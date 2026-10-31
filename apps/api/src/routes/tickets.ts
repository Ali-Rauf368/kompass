import { Router } from "express";
import { z } from "zod";
import { currentUser, requireRole } from "../auth/session";
import { TicketActivity } from "../db/mongo";
import { prisma, type Prisma, type TicketPriority, type TicketStatus } from "../db/prisma";
import { audit, notify } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { idParam, pageQuery, paged } from "../lib/http";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();
router.use(requireRole("AFTERSALES", "MANAGER", "SALES"));

export const SLA_HOURS: Record<TicketPriority, number> = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] as const;
const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

const include = {
  customer: { select: { id: true, number: true, name: true, city: true, phone: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, username: true } },
  company: { select: { id: true, code: true, name: true } },
} satisfies Prisma.TicketInclude;

const listQuery = pageQuery.extend({
  status: z.enum([...STATUSES, "ACTIVE"]).default("ACTIVE"),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.enum(["me", "unassigned", "all"]).default("all"),
  sla: z.enum(["breached", "at_risk"]).optional(),
  q: z.string().trim().max(80).optional(),
});

router.get("/", async (req, res) => {
  const user = currentUser(req);
  const f = listQuery.parse(req.query);
  const now = new Date();
  const where: Prisma.TicketWhereInput = {
    status: f.status === "ACTIVE" ? { in: OPEN_STATUSES } : f.status,
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.assignee === "me" ? { assigneeId: user.employeeId ?? -1 } : f.assignee === "unassigned" ? { assigneeId: null } : {}),
    ...(f.sla === "breached" ? { slaDueAt: { lt: now }, status: { in: OPEN_STATUSES } } : {}),
    ...(f.sla === "at_risk" ? { slaDueAt: { gte: now, lt: new Date(now.getTime() + 4 * 3_600_000) }, status: { in: OPEN_STATUSES } } : {}),
    ...(f.q ? { OR: [{ subject: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q, mode: "insensitive" } }, { customer: { name: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
  // Most urgent first: active tickets by SLA deadline, finished tickets by recency.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] = f.status === "ACTIVE" || OPEN_STATUSES.includes(f.status as TicketStatus) ? [{ slaDueAt: "asc" }] : [{ updatedAt: "desc" }];
  const [items, total, counts] = await Promise.all([
    prisma().ticket.findMany({ where, include, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().ticket.count({ where }),
    prisma().ticket.groupBy({ by: ["priority"], where: { status: { in: OPEN_STATUSES } }, _count: true }),
  ]);
  res.json({ ...paged(items, total, f.page, f.pageSize), openByPriority: Object.fromEntries(counts.map((c) => [c.priority, c._count])) });
});

router.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const ticket = await prisma().ticket.findUnique({ where: { id }, include });
  if (!ticket) throw notFound("Ticket");
  const activity = await TicketActivity.find({ ticketId: id }).sort({ at: 1 }).lean();
  res.json({ ticket, activity });
});

const createSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(5000),
  priority: z.enum(PRIORITIES),
  channel: z.enum(["PHONE", "EMAIL", "PORTAL", "TECHNICIAN"]),
  customerId: z.number().int().positive(),
  companyId: z.number().int().positive(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

router.post("/", requireRole("AFTERSALES"), async (req, res) => {
  const user = currentUser(req);
  const body = createSchema.parse(req.body);
  const now = new Date();
  const ticket = await prisma().$transaction(async (tx) => {
    // Gap-free, human-friendly numbers: lock the latest ticket row while numbering.
    const [last] = await tx.$queryRaw<{ number: string }[]>`SELECT number FROM "Ticket" ORDER BY id DESC LIMIT 1 FOR UPDATE`;
    const next = last ? Number(last.number.replace(/\D/g, "")) + 1 : 30001;
    return tx.ticket.create({ data: { ...body, number: `SR-${next}`, slaDueAt: new Date(now.getTime() + SLA_HOURS[body.priority] * 3_600_000) }, include });
  });
  await TicketActivity.create({ ticketId: ticket.id, kind: "created", author: user.username, authorName: user.displayName, body: `Ticket opened via ${body.channel.toLowerCase()}` });
  await audit(req, { action: "ticket.created", entityType: "ticket", entityId: ticket.id });
  if (ticket.assignee && ticket.assignee.username !== user.username) {
    await notify(ticket.assignee.username, { kind: "ticket", title: `${ticket.number} was assigned to you`, body: ticket.subject, link: `/after-sales/tickets/${ticket.id}` });
  }
  publish({ roles: ["AFTERSALES", "MANAGER"] }, { type: "ticket.updated", ticketId: ticket.id, status: ticket.status, priority: ticket.priority });
  scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.status(201).json({ ticket });
});

const updateSchema = z
  .object({ status: z.enum(STATUSES), priority: z.enum(PRIORITIES), assigneeId: z.number().int().positive().nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

router.patch("/:id", requireRole("AFTERSALES"), async (req, res) => {
  const user = currentUser(req);
  const id = idParam.parse(req.params.id);
  const body = updateSchema.parse(req.body);
  const before = await prisma().ticket.findUnique({ where: { id }, include });
  if (!before) throw notFound("Ticket");
  if (before.status === "CLOSED" && body.status && body.status !== "CLOSED") throw badRequest("Closed tickets can't be reopened. Create a follow-up ticket instead.");

  const now = new Date();
  const data: Prisma.TicketUncheckedUpdateInput = { ...body };
  const resolving = body.status === "RESOLVED" || body.status === "CLOSED";
  if (body.status && body.status !== "OPEN" && !before.firstResponseAt) data.firstResponseAt = now;
  if (resolving && !before.resolvedAt) data.resolvedAt = now;
  if (body.status && OPEN_STATUSES.includes(body.status)) data.resolvedAt = null;
  if (body.priority && body.priority !== before.priority) data.slaDueAt = new Date(before.createdAt.getTime() + SLA_HOURS[body.priority] * 3_600_000);

  const ticket = await prisma().ticket.update({ where: { id }, data, include });
  const author = { author: user.username, authorName: user.displayName, ticketId: id };
  if (body.status && body.status !== before.status) await TicketActivity.create({ ...author, kind: "status", from: before.status, to: body.status });
  if (body.assigneeId !== undefined && body.assigneeId !== before.assigneeId) {
    await TicketActivity.create({ ...author, kind: "assignment", body: ticket.assignee ? `Assigned to ${ticket.assignee.firstName} ${ticket.assignee.lastName}` : "Unassigned" });
    if (ticket.assignee && ticket.assignee.username !== user.username) {
      await notify(ticket.assignee.username, { kind: "ticket", title: `${ticket.number} was assigned to you`, body: ticket.subject, link: `/after-sales/tickets/${id}` });
    }
  }
  await audit(req, { action: "ticket.updated", entityType: "ticket", entityId: id, details: body });
  publish({ roles: ["AFTERSALES", "MANAGER"] }, { type: "ticket.updated", ticketId: id, status: ticket.status, priority: ticket.priority });
  publish({ roles: ["AFTERSALES", "MANAGER"] }, { type: "ticket.activity", ticketId: id });
  scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ ticket });
});

router.post("/:id/comments", requireRole("AFTERSALES"), async (req, res) => {
  const user = currentUser(req);
  const id = idParam.parse(req.params.id);
  const { body, internal } = z.object({ body: z.string().trim().min(1).max(5000), internal: z.boolean().default(false) }).parse(req.body);
  const ticket = await prisma().ticket.findUnique({ where: { id } });
  if (!ticket) throw notFound("Ticket");
  const comment = await TicketActivity.create({ ticketId: id, kind: "comment", author: user.username, authorName: user.displayName, body, internal });
  if (!ticket.firstResponseAt && !internal) await prisma().ticket.update({ where: { id }, data: { firstResponseAt: new Date() } });
  publish({ roles: ["AFTERSALES", "MANAGER"] }, { type: "ticket.activity", ticketId: id });
  res.status(201).json({ comment });
});

export default router;
