import { describe, expect, it } from "@jest/globals";
import { PIPELINES } from "./pipelines";

const invoice = PIPELINES["erp-invoices"]!.record;
const base = { invoiceNumber: "RE-2026-00001", customerNumber: "K-20001", companyCode: "RWH", amount: 100, issueDate: "2026-03-01", dueDate: "2026-03-15" };

describe("erp-invoices record schema", () => {
  it("parses German number and date formats from the ERP CSV export", () => {
    const r = invoice.parse({ ...base, amount: "1.234,56", issueDate: "01.03.2026", dueDate: "15.03.2026" });
    expect(r.amount).toBe(123456);
    expect(r.issueDate.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("accepts numeric amounts and ISO dates", () => {
    expect(invoice.parse(base).amount).toBe(10000);
  });

  it.each([
    [{ invoiceNumber: "2026-1" }, "invoiceNumber"],
    [{ amount: "-5" }, "amount"],
    [{ issueDate: "31.31.2026" }, "issueDate"],
    [{ companyCode: "XXX" }, "companyCode"],
  ])("rejects %j", (patch, field) => {
    const res = invoice.safeParse({ ...base, ...patch });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it("treats 'true'/'1' as cancelled", () => {
    expect(invoice.parse({ ...base, cancelled: "1" }).cancelled).toBe(true);
    expect(invoice.parse(base).cancelled).toBe(false);
  });
});
