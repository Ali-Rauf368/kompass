import { Router } from "express";
import { z } from "zod";
import { currentUser, hasRole, requireRole } from "../auth/session";
import { prisma, type Prisma } from "../db/prisma";
import { audit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { idParam, pageQuery, paged } from "../lib/http";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();

/** Directory fields everyone may see; HR additionally sees personnel data (data minimisation). */
const directorySelect = {
  id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, status: true,
  company: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

const hrSelect = { ...directorySelect, personnelNo: true, username: true, hireDate: true, exitDate: true, vacationDays: true, pseudonymizedAt: true } satisfies Prisma.EmployeeSelect;

const listQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  department: z.string().optional(),
  company: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "LEFT"]).optional(),
  sort: z.enum(["name", "department", "hireDate"]).default("name"),
});

router.get("/", async (req, res) => {
  const f = listQuery.parse(req.query);
  const isHr = hasRole(req.user, "HR");
  const where: Prisma.EmployeeWhereInput = {
    pseudonymizedAt: null,
    status: f.status ?? (isHr ? undefined : { not: "LEFT" }),
    ...(f.department ? { department: { code: f.department } } : {}),
    ...(f.company ? { company: { code: f.company } } : {}),
    ...(f.q
      ? { OR: [{ firstName: { contains: f.q, mode: "insensitive" } }, { lastName: { contains: f.q, mode: "insensitive" } }, { jobTitle: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
    f.sort === "department" ? [{ department: { name: "asc" } }, { lastName: "asc" }] : f.sort === "hireDate" && isHr ? [{ hireDate: "desc" }] : [{ lastName: "asc" }, { firstName: "asc" }];
  const [items, total] = await Promise.all([
    prisma().employee.findMany({ where, orderBy, select: isHr ? hrSelect : directorySelect, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().employee.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

router.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const user = currentUser(req);
  const isHr = hasRole(user, "HR");
  const employee = await prisma().employee.findUnique({ where: { id }, select: { ...(isHr ? hrSelect : directorySelect), managerId: true } });
  if (!employee) throw notFound("Employee");
  const isManager = employee.managerId === user.employeeId;
  if (isHr) await audit(req, { action: "employee.viewed", entityType: "employee", entityId: id, personalData: true });
  const reports = await prisma().employee.findMany({ where: { managerId: id, status: { not: "LEFT" } }, select: { id: true, firstName: true, lastName: true, jobTitle: true }, orderBy: { lastName: "asc" } });
  res.json({ employee, reports, canSeeLeave: isHr || isManager || user.employeeId === id });
});

const updateSchema = z
  .object({
    jobTitle: z.string().trim().min(2).max(120),
    departmentId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    managerId: z.number().int().positive().nullable(),
    status: z.enum(["ACTIVE", "ON_LEAVE", "LEFT"]),
    phone: z.string().trim().max(40).nullable(),
    vacationDays: z.number().int().min(0).max(60),
  })
  .partial();

router.patch("/:id", requireRole("HR"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = updateSchema.parse(req.body);
  if (data.managerId === id) throw badRequest("An employee can't be their own manager");
  const before = await prisma().employee.findUnique({ where: { id } });
  if (!before) throw notFound("Employee");
  const employee = await prisma().employee.update({
    where: { id },
    data: { ...data, ...(data.status === "LEFT" && !before.exitDate ? { exitDate: new Date() } : {}) },
    select: hrSelect,
  });
  const changed = Object.keys(data).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((data as Record<string, unknown>)[k]));
  await audit(req, { action: "employee.updated", entityType: "employee", entityId: id, personalData: true, details: { changed } });
  scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ employee });
});

export default router;
