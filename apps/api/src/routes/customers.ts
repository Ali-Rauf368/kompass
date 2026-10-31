import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "../db/prisma";
import { notFound } from "../lib/errors";
import { idParam, pageQuery, paged } from "../lib/http";

const router = Router();

router.get("/", async (req, res) => {
  const f = pageQuery.extend({ q: z.string().trim().max(80).optional(), segment: z.enum(["PRIVATE", "BUSINESS", "PUBLIC_SECTOR"]).optional() }).parse(req.query);
  const where: Prisma.CustomerWhereInput = {
    ...(f.segment ? { segment: f.segment } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q, mode: "insensitive" } }, { city: { contains: f.q, mode: "insensitive" } }, { postalCode: { startsWith: f.q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma().customer.findMany({ where, orderBy: { name: "asc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { _count: { select: { deals: true, tickets: true, invoices: true } } } }),
    prisma().customer.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

router.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const customer = await prisma().customer.findUnique({
    where: { id },
    include: {
      deals: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, stage: true, valueCents: true, createdAt: true } },
      tickets: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true } },
      invoices: { orderBy: { issueDate: "desc" }, take: 10, select: { id: true, number: true, status: true, amountCents: true, dueDate: true } },
    },
  });
  if (!customer) throw notFound("Customer");
  const [row] = await prisma().$queryRaw<{ revenue: bigint | null }[]>`SELECT sum("amountCents") AS revenue FROM "Invoice" WHERE "customerId" = ${id} AND status = 'PAID'`;
  res.json({ customer, lifetimeRevenueCents: Number(row?.revenue ?? 0) });
});

export default router;
