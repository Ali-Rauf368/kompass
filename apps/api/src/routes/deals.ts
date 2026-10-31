import { Router } from "express";
import { z } from "zod";
import { currentUser, hasRole, requireRole } from "../auth/session";
import { prisma, type DealStage, type Prisma } from "../db/prisma";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { idParam, isoDate, pageQuery, paged, } from "../lib/http";
import { toDateOnly } from "../lib/dates";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();
router.use(requireRole("SALES", "MANAGER", "ACCOUNTING"));

const STAGES: DealStage[] = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const PROBABILITY: Record<DealStage, number> = { LEAD: 10, QUALIFIED: 30, PROPOSAL: 50, NEGOTIATION: 75, WON: 100, LOST: 0 };

const include = {
  customer: { select: { id: true, number: true, name: true, city: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DealInclude;

router.get("/", async (req, res) => {
  const f = pageQuery
    .extend({ stage: z.enum(STAGES as [DealStage, ...DealStage[]]).optional(), company: z.string().optional(), owner: z.enum(["me", "all"]).default("all"), q: z.string().trim().max(80).optional() })
    .parse(req.query);
  const user = currentUser(req);
  const where: Prisma.DealWhereInput = {
    ...(f.stage ? { stage: f.stage } : {}),
    ...(f.company ? { company: { code: f.company } } : {}),
    ...(f.owner === "me" ? { ownerId: user.employeeId ?? -1 } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { customer: { name: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma().deal.findMany({ where, include, orderBy: { updatedAt: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().deal.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

/** Open pipeline grouped by stage, plus deals closed in the last 30 days. */
router.get("/board", async (req, res) => {
  const { company } = z.object({ company: z.string().optional() }).parse(req.query);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const deals = await prisma().deal.findMany({
    where: { ...(company ? { company: { code: company } } : {}), OR: [{ stage: { notIn: ["WON", "LOST"] } }, { closedAt: { gte: since } }] },
    include,
    orderBy: [{ expectedClose: "asc" }],
  });
  const columns = STAGES.map((stage) => {
    const items = deals.filter((d) => d.stage === stage);
    return { stage, count: items.length, valueCents: items.reduce((n, d) => n + d.valueCents, 0), items };
  });
  res.json({ columns });
});

const createSchema = z.object({
  title: z.string().trim().min(3).max(140),
  customerId: z.number().int().positive(),
  companyId: z.number().int().positive(),
  valueCents: z.number().int().min(0).max(1_000_000_00),
  expectedClose: isoDate,
  ownerId: z.number().int().positive().optional(),
});

router.post("/", requireRole("SALES"), async (req, res) => {
  const user = currentUser(req);
  const body = createSchema.parse(req.body);
  const ownerId = body.ownerId ?? user.employeeId;
  if (!ownerId) throw badRequest("Choose an owner for this deal");
  const deal = await prisma().deal.create({ data: { ...body, ownerId, expectedClose: toDateOnly(body.expectedClose), probability: PROBABILITY.LEAD }, include });
  await audit(req, { action: "deal.created", entityType: "deal", entityId: deal.id });
  publish({ roles: ["SALES", "MANAGER"] }, { type: "deal.updated", dealId: deal.id, stage: deal.stage });
  res.status(201).json({ deal });
});

router.patch("/:id/stage", requireRole("SALES"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const user = currentUser(req);
  const { stage, lostReason } = z.object({ stage: z.enum(STAGES as [DealStage, ...DealStage[]]), lostReason: z.string().trim().min(2).max(200).optional() }).parse(req.body);
  const deal = await prisma().deal.findUnique({ where: { id } });
  if (!deal) throw notFound("Deal");
  if (deal.ownerId !== user.employeeId && !hasRole(user, "MANAGER")) throw forbidden("Only the deal owner or a manager can move this deal");
  if (deal.stage === "WON" || deal.stage === "LOST") throw conflict("Closed deals can't be moved. Create a new deal instead.");
  if (stage === "LOST" && !lostReason) throw badRequest("Please give a reason when marking a deal as lost");
  const closing = stage === "WON" || stage === "LOST";
  const updated = await prisma().deal.update({
    where: { id },
    data: { stage, probability: PROBABILITY[stage], closedAt: closing ? new Date() : null, lostReason: stage === "LOST" ? lostReason : null },
    include,
  });
  await audit(req, { action: "deal.stage_changed", entityType: "deal", entityId: id, details: { from: deal.stage, to: stage } });
  publish({ roles: ["SALES", "MANAGER", "ACCOUNTING"] }, { type: "deal.updated", dealId: id, stage });
  scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ deal: updated });
});

export default router;
