import { z } from "zod";
import type { PrismaClient } from "../db/prisma";

/**
 * NiFi delivers records as JSON arrays. Each pipeline declares how to validate one record and how
 * to upsert it by its natural key, so re-deliveries never create duplicates.
 */
export interface PipelineDef<T> {
  description: string;
  record: z.ZodType<T>;
  upsert: (db: PrismaClient, record: T) => Promise<"inserted" | "updated">;
}

const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  // ERP exports use German formatting: "1.234,56"
  const n = typeof v === "number" ? v : Number(v.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: "custom", message: "Invalid amount" });
    return z.NEVER;
  }
  return Math.round(n * 100);
});
const date = z.string().transform((v, ctx) => {
  // accepts 2026-03-01 or 01.03.2026
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: `Invalid date "${v}"` });
    return z.NEVER;
  }
  return d;
});

const erpInvoice = z.object({
  invoiceNumber: z.string().trim().regex(/^RE-\d{4}-\d{5}$/),
  customerNumber: z.string().trim().regex(/^K-\d{5}$/),
  companyCode: z.enum(["RWH", "RWS", "RWE", "RWK"]),
  amount: money,
  issueDate: date,
  dueDate: date,
  paidDate: date.nullish(),
  cancelled: z.union([z.boolean(), z.enum(["true", "false", "0", "1"])]).optional().transform((v) => v === true || v === "true" || v === "1"),
});

const crmCustomer = z.object({
  customerNumber: z.string().trim().regex(/^K-\d{5}$/),
  name: z.string().trim().min(2).max(200),
  segment: z.enum(["PRIVATE", "BUSINESS", "PUBLIC_SECTOR"]),
  email: z.string().trim().email().nullish(),
  phone: z.string().trim().max(40).nullish(),
  street: z.string().trim().max(200).nullish(),
  postalCode: z.string().trim().regex(/^\d{5}$/),
  city: z.string().trim().min(2).max(100),
});

export const PIPELINES: Record<string, PipelineDef<any>> = {
  "erp-invoices": {
    description: "Invoices exported nightly from the ERP as CSV (NiFi: GetFile → ConvertRecord → InvokeHTTP)",
    record: erpInvoice,
    async upsert(db, r: z.output<typeof erpInvoice>) {
      const [customer, company] = await Promise.all([
        db.customer.findUnique({ where: { number: r.customerNumber }, select: { id: true } }),
        db.company.findUnique({ where: { code: r.companyCode }, select: { id: true } }),
      ]);
      if (!customer) throw new Error(`customerNumber ${r.customerNumber} not found`);
      if (r.dueDate < r.issueDate) throw new Error("dueDate is before issueDate");
      const status = r.cancelled ? "CANCELLED" : r.paidDate ? "PAID" : "OPEN";
      const data = { amountCents: r.amount, issueDate: r.issueDate, dueDate: r.dueDate, paidAt: r.paidDate ?? null, status, customerId: customer.id, companyId: company!.id, source: "erp" } as const;
      const existing = await db.invoice.findUnique({ where: { number: r.invoiceNumber }, select: { id: true } });
      await db.invoice.upsert({ where: { number: r.invoiceNumber }, create: { number: r.invoiceNumber, ...data }, update: data });
      return existing ? "updated" : "inserted";
    },
  },
  "crm-customers": {
    description: "Customer master data pulled from the external CRM REST API (NiFi: InvokeHTTP → SplitJson → JoltTransform → InvokeHTTP)",
    record: crmCustomer,
    async upsert(db, r: z.output<typeof crmCustomer>) {
      const data = { name: r.name, segment: r.segment, email: r.email ?? null, phone: r.phone ?? null, street: r.street ?? null, postalCode: r.postalCode, city: r.city, source: "crm" };
      const existing = await db.customer.findUnique({ where: { number: r.customerNumber }, select: { id: true } });
      await db.customer.upsert({ where: { number: r.customerNumber }, create: { number: r.customerNumber, ...data }, update: data });
      return existing ? "updated" : "inserted";
    },
  },
};
