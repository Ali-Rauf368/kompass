import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/session";
import { prisma, type Prisma } from "../db/prisma";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { idParam, isoDate, pageQuery, paged } from "../lib/http";
import { toDateOnly } from "../lib/dates";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();
router.use(requireRole("ACCOUNTING", "MANAGER"));

const include = {
  customer: { select: { id: true, number: true, name: true } },
  company: { select: { id: true, code: true, name: true } },
} satisfies Prisma.InvoiceInclude;

const today = () => toDateOnly(new Date().toISOString().slice(0, 10));

router.get("/", async (req, res) => {
  const f = pageQuery
    .extend({ status: z.enum(["OPEN", "OVERDUE", "PAID", "CANCELLED", "DRAFT"]).optional(), company: z.string().optional(), q: z.string().trim().max(80).optional() })
    .parse(req.query);
  const where: Prisma.InvoiceWhereInput = {
    ...(f.status === "OVERDUE" ? { status: "OPEN", dueDate: { lt: today() } } : f.status ? { status: f.status } : {}),
    ...(f.company ? { company: { code: f.company } } : {}),
    ...(f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { customer: { name: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
  const orderBy: Prisma.InvoiceOrderByWithRelationInput = f.status === "OVERDUE" || f.status === "OPEN" ? { dueDate: "asc" } : { issueDate: "desc" };
  const [items, total] = await Promise.all([
    prisma().invoice.findMany({ where, include, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().invoice.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

/** Receivables aging: open invoice amounts bucketed by days past due. */
router.get("/aging", async (req, res) => {
  const { company } = z.object({ company: z.string().optional() }).parse(req.query);
  const rows = await prisma().$queryRaw<{ bucket: string; amount: bigint; count: bigint }[]>`
    SELECT CASE
             WHEN i."dueDate" >= current_date THEN 'current'
             WHEN current_date - i."dueDate" <= 30 THEN '1-30'
             WHEN current_date - i."dueDate" <= 60 THEN '31-60'
             WHEN current_date - i."dueDate" <= 90 THEN '61-90'
             ELSE '90+'
           END AS bucket,
           sum(i."amountCents") AS amount, count(*) AS count
    FROM "Invoice" i JOIN "Company" c ON c.id = i."companyId"
    WHERE i.status = 'OPEN' AND (${company ?? null}::text IS NULL OR c.code = ${company ?? null})
    GROUP BY 1`;
  const order = ["current", "1-30", "31-60", "61-90", "90+"];
  res.json({
    buckets: order.map((b) => {
      const r = rows.find((x) => x.bucket === b);
      return { bucket: b, amountCents: Number(r?.amount ?? 0), count: Number(r?.count ?? 0) };
    }),
  });
});

router.post("/:id/mark-paid", requireRole("ACCOUNTING"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { paidAt } = z.object({ paidAt: isoDate.optional() }).parse(req.body ?? {});
  const invoice = await prisma().invoice.findUnique({ where: { id } });
  if (!invoice) throw notFound("Invoice");
  if (invoice.status !== "OPEN") throw conflict(`Only open invoices can be marked as paid (this one is ${invoice.status.toLowerCase()})`);
  const updated = await prisma().invoice.update({ where: { id }, data: { status: "PAID", paidAt: paidAt ? toDateOnly(paidAt) : today() }, include });
  await audit(req, { action: "invoice.paid", entityType: "invoice", entityId: id });
  scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  res.json({ invoice: updated });
});

export default router;
