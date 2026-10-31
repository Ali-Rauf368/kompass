import { describe, expect, it } from "@jest/globals";
import { RawIngest } from "../src/db/mongo";
import { prisma } from "../src/db/prisma";
import { api, signIn, useDatabases } from "./helpers";

useDatabases();

const KEY = "test-ingest-key-0123456789";
const send = (pipeline: string, batchId: string, records: unknown[]) =>
  api().post(`/api/ingest/${pipeline}`).set("X-Api-Key", KEY).set("X-Batch-Id", batchId).send(records);

describe("NiFi ingestion", () => {
  it("rejects requests without a valid API key", async () => {
    await api().post("/api/ingest/erp-invoices").send([]).expect(401);
    await api().post("/api/ingest/erp-invoices").set("X-Api-Key", "wrong").send([]).expect(401);
  });

  it("404s for unknown pipelines", async () => {
    await send("payroll", "b1", []).expect(404);
  });

  it("upserts CRM customers by customer number", async () => {
    const res = await send("crm-customers", "crm-test-1", [
      { customerNumber: "K-29001", name: "Kita Regenbogen", segment: "PUBLIC_SECTOR", postalCode: "50733", city: "Köln", email: "info@kita.example" },
      { customerNumber: "K-20001", name: "Renamed Customer GmbH", segment: "BUSINESS", postalCode: "50667", city: "Köln" },
    ]).expect(200);
    expect(res.body.run).toMatchObject({ status: "SUCCEEDED", inserted: 1, updated: 1, rejected: 0 });
    expect((await prisma().customer.findUniqueOrThrow({ where: { number: "K-20001" } })).name).toBe("Renamed Customer GmbH");
  });

  it("applies valid records, rejects invalid ones and answers 207", async () => {
    const res = await send("erp-invoices", "erp-test-1", [
      { invoiceNumber: "RE-2026-90001", customerNumber: "K-29001", companyCode: "RWS", amount: "12.450,00", issueDate: "01.10.2026", dueDate: "15.10.2026" },
      { invoiceNumber: "RE-2026-90002", customerNumber: "K-99999", companyCode: "RWS", amount: 100, issueDate: "2026-10-01", dueDate: "2026-10-15" },
      { invoiceNumber: "nope" },
    ]).expect(207);
    expect(res.body.run).toMatchObject({ status: "PARTIAL", inserted: 1, rejected: 2 });
    expect(res.body.run.errors[0]).toMatchObject({ record: 1, message: "customerNumber K-99999 not found" });
    const inv = await prisma().invoice.findUniqueOrThrow({ where: { number: "RE-2026-90001" } });
    expect(inv).toMatchObject({ amountCents: 1_245_000, status: "OPEN", source: "erp" });
  });

  it("is idempotent per batch id: a re-delivery doesn't write again", async () => {
    const records = [{ invoiceNumber: "RE-2026-90010", customerNumber: "K-29001", companyCode: "RWS", amount: 500, issueDate: "2026-10-01", dueDate: "2026-10-15" }];
    const first = await send("erp-invoices", "erp-replay", records).expect(200);
    await prisma().invoice.update({ where: { number: "RE-2026-90010" }, data: { amountCents: 1 } });
    const second = await send("erp-invoices", "erp-replay", records).expect(200);
    expect(second.body).toMatchObject({ replayed: true, run: { id: first.body.run.id } });
    expect((await prisma().invoice.findUniqueOrThrow({ where: { number: "RE-2026-90010" } })).amountCents).toBe(1);
  });

  it("updates existing invoices when the ERP reports a payment", async () => {
    await send("erp-invoices", "erp-pay-1", [{ invoiceNumber: "RE-2026-90001", customerNumber: "K-29001", companyCode: "RWS", amount: "12.450,00", issueDate: "01.10.2026", dueDate: "15.10.2026", paidDate: "12.10.2026" }]).expect(200);
    expect((await prisma().invoice.findUniqueOrThrow({ where: { number: "RE-2026-90001" } })).status).toBe("PAID");
  });

  it("answers 422 when every record is rejected, and keeps the raw payload in MongoDB", async () => {
    await send("erp-invoices", "erp-bad", [{ foo: 1 }, { bar: 2 }]).expect(422);
    const raw = await RawIngest.findOne({ batchId: "erp-bad" }).lean();
    expect(raw?.records).toHaveLength(2);
  });

  it("shows pipeline health to admins", async () => {
    const res = await (await signIn("anna.schmidt")).get("/api/pipelines").expect(200);
    const erp = res.body.pipelines.find((p: { name: string }) => p.name === "erp-invoices");
    expect(erp.lastRun.batchId).toBe("erp-bad");
    expect(erp.successRate14d).toBeGreaterThan(0);
    await (await signIn("tim.hoffmann")).get("/api/pipelines").expect(403);
  });
});
