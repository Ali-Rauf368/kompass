import { Router } from "express";
import { z } from "zod";
import { currentUser, hasRole, type SessionUser } from "../auth/session";
import { prisma, type Prisma } from "../db/prisma";
import { audit, notify } from "../lib/audit";
import { toDateOnly, workingDaysBetween } from "../lib/dates";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { idParam, isoDate, pageQuery, paged } from "../lib/http";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();

const include = {
  employee: { select: { id: true, firstName: true, lastName: true, username: true, managerId: true, department: { select: { name: true } } } },
  approver: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeaveRequestInclude;

function requireEmployee(user: SessionUser) {
  if (!user.employeeId) throw forbidden("Your account isn't linked to an employee record");
  return user.employeeId;
}

/** view=mine (default) | approvals (requests I can decide) | all (HR only) */
const listQuery = pageQuery.extend({
  view: z.enum(["mine", "approvals", "all"]).default("mine"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

router.get("/", async (req, res) => {
  const user = currentUser(req);
  const f = listQuery.parse(req.query);
  let where: Prisma.LeaveRequestWhereInput;
  if (f.view === "mine") where = { employeeId: requireEmployee(user) };
  else if (f.view === "approvals") {
    where = hasRole(user, "HR") ? { employee: { id: { not: user.employeeId ?? -1 } } } : { employee: { managerId: requireEmployee(user) } };
  } else {
    if (!hasRole(user, "HR")) throw forbidden();
    where = {};
  }
  if (f.status) where.status = f.status;
  if (f.year) where.startDate = { gte: new Date(Date.UTC(f.year, 0, 1)), lt: new Date(Date.UTC(f.year + 1, 0, 1)) };
  const [items, total] = await Promise.all([
    prisma().leaveRequest.findMany({ where, include, orderBy: [{ status: "asc" }, { startDate: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().leaveRequest.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

/** Vacation entitlement for the current year: total, approved, pending, remaining. */
router.get("/balance", async (req, res) => {
  const employeeId = requireEmployee(currentUser(req));
  res.json(await vacationBalance(employeeId, new Date().getUTCFullYear()));
});

async function vacationBalance(employeeId: number, year: number) {
  const employee = await prisma().employee.findUniqueOrThrow({ where: { id: employeeId }, select: { vacationDays: true } });
  const rows = await prisma().leaveRequest.groupBy({
    by: ["status"],
    where: { employeeId, type: "VACATION", status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    _sum: { workingDays: true },
  });
  const sum = (s: string) => rows.find((r) => r.status === s)?._sum.workingDays ?? 0;
  const approved = sum("APPROVED"), pending = sum("PENDING");
  return { year, entitlement: employee.vacationDays, approved, pending, remaining: employee.vacationDays - approved - pending };
}

const createSchema = z
  .object({
    type: z.enum(["VACATION", "TRAINING", "OTHER"]),
    startDate: isoDate,
    endDate: isoDate,
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

router.post("/", async (req, res) => {
  const user = currentUser(req);
  const employeeId = requireEmployee(user);
  const body = createSchema.parse(req.body);
  const start = toDateOnly(body.startDate), end = toDateOnly(body.endDate);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) throw badRequest("Please split requests that span the turn of the year");
  const workingDays = workingDaysBetween(start, end);
  if (workingDays === 0) throw badRequest("The selected period contains no working days");

  const overlap = await prisma().leaveRequest.findFirst({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) throw conflict("You already have leave in this period");
  if (body.type === "VACATION") {
    const balance = await vacationBalance(employeeId, start.getUTCFullYear());
    if (workingDays > balance.remaining) throw badRequest(`Only ${balance.remaining} vacation days left for ${balance.year}`);
  }

  const leave = await prisma().leaveRequest.create({ data: { employeeId, type: body.type, startDate: start, endDate: end, workingDays, note: body.note }, include });
  await audit(req, { action: "leave.requested", entityType: "leave", entityId: leave.id, personalData: true });
  const manager = leave.employee.managerId ? await prisma().employee.findUnique({ where: { id: leave.employee.managerId }, select: { username: true } }) : null;
  if (manager) {
    await notify(manager.username, {
      kind: "leave",
      title: `${leave.employee.firstName} ${leave.employee.lastName} requested ${workingDays} day${workingDays === 1 ? "" : "s"} off`,
      body: `${body.startDate} – ${body.endDate}`,
      link: "/hr/leave?view=approvals",
    });
  }
  res.status(201).json({ leave });
});

router.post("/:id/decision", async (req, res) => {
  const user = currentUser(req);
  const id = idParam.parse(req.params.id);
  const { decision, note } = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(500).optional() }).parse(req.body);
  const leave = await prisma().leaveRequest.findUnique({ where: { id }, include });
  if (!leave) throw notFound("Leave request");
  const isManager = !!user.employeeId && leave.employee.managerId === user.employeeId;
  if (!isManager && !hasRole(user, "HR")) throw forbidden("Only the employee's manager or HR can decide on this request");
  if (leave.employee.id === user.employeeId) throw forbidden("You can't approve your own leave");
  if (leave.status !== "PENDING") throw conflict(`This request is already ${leave.status.toLowerCase()}`);

  const updated = await prisma().leaveRequest.update({
    where: { id },
    data: { status: decision, approverId: user.employeeId, decidedAt: new Date(), note: note ? [leave.note, `Decision note: ${note}`].filter(Boolean).join("\n") : leave.note },
    include,
  });
  await audit(req, { action: `leave.${decision.toLowerCase()}`, entityType: "leave", entityId: id, personalData: true });
  await notify(leave.employee.username, {
    kind: "leave",
    title: `Your leave from ${leave.startDate.toISOString().slice(0, 10)} was ${decision === "APPROVED" ? "approved" : "rejected"}`,
    body: note,
    link: "/hr/leave",
  });
  publish({ usernames: [leave.employee.username, user.username] }, { type: "leave.updated", leaveId: id, status: decision });
  if (decision === "APPROVED") scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ leave: updated });
});

router.post("/:id/cancel", async (req, res) => {
  const user = currentUser(req);
  const id = idParam.parse(req.params.id);
  const leave = await prisma().leaveRequest.findUnique({ where: { id } });
  if (!leave || leave.employeeId !== user.employeeId) throw notFound("Leave request");
  if (!["PENDING", "APPROVED"].includes(leave.status)) throw conflict("Only pending or approved requests can be cancelled");
  if (leave.startDate <= new Date()) throw conflict("Leave that has already started can't be cancelled here. Please contact HR.");
  const updated = await prisma().leaveRequest.update({ where: { id }, data: { status: "CANCELLED" }, include });
  await audit(req, { action: "leave.cancelled", entityType: "leave", entityId: id, personalData: true });
  if (leave.status === "APPROVED") scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ leave: updated });
});

export default router;
