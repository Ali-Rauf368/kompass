import { describe, expect, it } from "@jest/globals";
import { TicketActivity } from "../src/db/mongo";
import { prisma } from "../src/db/prisma";
import { DEMO_DIRECTORY } from "../src/scripts/demo-data";
import { signIn, useDatabases } from "./helpers";

useDatabases();

describe("sales pipeline", () => {
  it("returns the board grouped by stage with totals", async () => {
    const res = await (await signIn("lea.fischer")).get("/api/deals/board").expect(200);
    expect(res.body.columns.map((c: { stage: string }) => c.stage)).toEqual(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
    for (const col of res.body.columns) expect(col.valueCents).toBe(col.items.reduce((n: number, d: { valueCents: number }) => n + d.valueCents, 0));
  });

  it("creates a deal and moves it through the pipeline", async () => {
    const lea = await signIn("lea.fischer");
    const customer = await prisma().customer.findFirstOrThrow();
    const company = await prisma().company.findUniqueOrThrow({ where: { code: "RWS" } });
    const { body } = await lea.post("/api/deals", { title: "PV + battery for test customer", customerId: customer.id, companyId: company.id, valueCents: 2_150_000, expectedClose: "2030-06-30" }).expect(201);
    expect(body.deal).toMatchObject({ stage: "LEAD", probability: 10 });
    const moved = await lea.patch(`/api/deals/${body.deal.id}/stage`, { stage: "PROPOSAL" }).expect(200);
    expect(moved.body.deal.probability).toBe(50);
    await lea.patch(`/api/deals/${body.deal.id}/stage`, { stage: "LOST" }).expect(400);
    const lost = await lea.patch(`/api/deals/${body.deal.id}/stage`, { stage: "LOST", lostReason: "Chose competitor" }).expect(200);
    expect(lost.body.deal.closedAt).not.toBeNull();
    await lea.patch(`/api/deals/${body.deal.id}/stage`, { stage: "LEAD" }).expect(409);
  });

  it("keeps the sales area away from roles without access", async () => {
    await (await signIn("tim.hoffmann")).get("/api/deals").expect(403);
    // a plain HR clerk (Jonas is HR *and* a manager, and managers may see the pipeline)
    const clerk = DEMO_DIRECTORY.find((u) => u.groups.length === 1 && u.groups[0] === "HR")!;
    await (await signIn(clerk.username)).get("/api/deals/board").expect(403);
  });
});

describe("service tickets", () => {
  it("lists active tickets with the closest SLA first", async () => {
    const res = await (await signIn("murat.yilmaz")).get("/api/tickets?pageSize=50").expect(200);
    const due = res.body.items.map((t: { slaDueAt: string }) => t.slaDueAt);
    expect(due).toEqual([...due].sort());
    expect(res.body.openByPriority).toEqual(expect.any(Object));
  });

  it("filters breached tickets", async () => {
    const res = await (await signIn("murat.yilmaz")).get("/api/tickets?sla=breached&pageSize=100").expect(200);
    expect(res.body.items.every((t: { slaDueAt: string }) => new Date(t.slaDueAt) < new Date())).toBe(true);
  });

  it("opens a ticket with an SLA from its priority and a sequential number", async () => {
    const murat = await signIn("murat.yilmaz");
    const customer = await prisma().customer.findFirstOrThrow();
    const company = await prisma().company.findUniqueOrThrow({ where: { code: "RWK" } });
    const before = Date.now();
    const a = await murat.post("/api/tickets", { subject: "Heat pump loud at night", description: "Customer reports humming noise", priority: "URGENT", channel: "PHONE", customerId: customer.id, companyId: company.id }).expect(201);
    const b = await murat.post("/api/tickets", { subject: "Second ticket", description: "Another one", priority: "LOW", channel: "EMAIL", customerId: customer.id, companyId: company.id }).expect(201);
    const slaHours = (new Date(a.body.ticket.slaDueAt).getTime() - before) / 3_600_000;
    expect(slaHours).toBeGreaterThan(3.9);
    expect(slaHours).toBeLessThan(4.1);
    expect(Number(b.body.ticket.number.slice(3))).toBe(Number(a.body.ticket.number.slice(3)) + 1);
    expect(await TicketActivity.countDocuments({ ticketId: a.body.ticket.id, kind: "created" })).toBe(1);
  });

  it("records first response and resolution, and logs activity", async () => {
    const murat = await signIn("murat.yilmaz");
    const ticket = await prisma().ticket.findFirstOrThrow({ where: { status: "OPEN", firstResponseAt: null } });
    const tim = await prisma().employee.findUniqueOrThrow({ where: { username: "tim.hoffmann" } });
    const progress = await murat.patch(`/api/tickets/${ticket.id}`, { status: "IN_PROGRESS", assigneeId: tim.id }).expect(200);
    expect(progress.body.ticket.firstResponseAt).not.toBeNull();
    await murat.post(`/api/tickets/${ticket.id}/comments`, { body: "Technician scheduled for Thursday" }).expect(201);
    const resolved = await murat.patch(`/api/tickets/${ticket.id}`, { status: "RESOLVED" }).expect(200);
    expect(resolved.body.ticket.resolvedAt).not.toBeNull();
    const detail = await murat.get(`/api/tickets/${ticket.id}`).expect(200);
    expect(detail.body.activity.map((a: { kind: string }) => a.kind)).toEqual(expect.arrayContaining(["status", "assignment", "comment"]));
  });

  it("recomputes the SLA when the priority changes", async () => {
    const murat = await signIn("murat.yilmaz");
    const ticket = await prisma().ticket.findFirstOrThrow({ where: { status: "OPEN", priority: "LOW" } });
    const res = await murat.patch(`/api/tickets/${ticket.id}`, { priority: "URGENT" }).expect(200);
    expect(new Date(res.body.ticket.slaDueAt).getTime()).toBe(ticket.createdAt.getTime() + 4 * 3_600_000);
  });

  it("doesn't reopen closed tickets", async () => {
    const murat = await signIn("murat.yilmaz");
    const ticket = await prisma().ticket.findFirstOrThrow({ where: { status: "CLOSED" } });
    await murat.patch(`/api/tickets/${ticket.id}`, { status: "OPEN" }).expect(400);
  });

  it("lets sales read but not change tickets", async () => {
    const lea = await signIn("lea.fischer");
    const ticket = await prisma().ticket.findFirstOrThrow();
    await lea.get(`/api/tickets/${ticket.id}`).expect(200);
    await lea.patch(`/api/tickets/${ticket.id}`, { status: "WAITING" }).expect(403);
  });
});

describe("invoices", () => {
  it("lists overdue invoices only", async () => {
    const res = await (await signIn("sophie.becker")).get("/api/invoices?status=OVERDUE&pageSize=100").expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const inv of res.body.items) {
      expect(inv.status).toBe("OPEN");
      expect(new Date(inv.dueDate) < new Date()).toBe(true);
    }
  });

  it("buckets open receivables by age, matching the open total", async () => {
    const sophie = await signIn("sophie.becker");
    const res = await sophie.get("/api/invoices/aging").expect(200);
    const { _sum } = await prisma().invoice.aggregate({ where: { status: "OPEN" }, _sum: { amountCents: true } });
    expect(res.body.buckets.reduce((n: number, b: { amountCents: number }) => n + b.amountCents, 0)).toBe(_sum.amountCents);
    expect(res.body.buckets.map((b: { bucket: string }) => b.bucket)).toEqual(["current", "1-30", "31-60", "61-90", "90+"]);
  });

  it("records payments once", async () => {
    const sophie = await signIn("sophie.becker");
    const inv = await prisma().invoice.findFirstOrThrow({ where: { status: "OPEN" } });
    const res = await sophie.post(`/api/invoices/${inv.id}/mark-paid`, { paidAt: "2026-10-01" }).expect(200);
    expect(res.body.invoice).toMatchObject({ status: "PAID" });
    await sophie.post(`/api/invoices/${inv.id}/mark-paid`).expect(409);
  });

  it("is limited to accounting and managers", async () => {
    await (await signIn("tim.hoffmann")).get("/api/invoices").expect(403);
  });
});
