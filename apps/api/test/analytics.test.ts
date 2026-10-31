import { describe, expect, it } from "@jest/globals";
import { refreshWarehouse } from "../src/analytics/warehouse";
import { prisma } from "../src/db/prisma";
import { signIn, useDatabases } from "./helpers";

useDatabases();

describe("dashboard KPIs", () => {
  it("returns period KPIs, live numbers and monthly series", async () => {
    const res = await (await signIn("anna.schmidt")).get("/api/analytics/overview?months=6").expect(200);
    const { period, live, monthly } = res.body;
    expect(period.current).toMatchObject({ invoicedEur: expect.any(Number), winRate: expect.any(Number), slaRate: expect.any(Number) });
    expect(period.current.winRate).toBeGreaterThan(0);
    expect(period.current.winRate).toBeLessThan(1);
    expect(live).toMatchObject({ headcount: expect.any(Number), openTickets: expect.any(Number), dso: expect.any(Number) });
    expect(monthly).toHaveLength(12);
    expect(res.body.refreshedAt).not.toBeNull();
  });

  it("filters by company", async () => {
    const s = await signIn("anna.schmidt");
    const all = (await s.get("/api/analytics/overview").expect(200)).body;
    const solar = (await s.get("/api/analytics/overview?company=RWS").expect(200)).body;
    expect(solar.live.headcount).toBeLessThan(all.live.headcount);
    expect(solar.period.current.invoicedEur).toBeLessThan(all.period.current.invoicedEur);
  });

  it("matches the operational data for the live pipeline value", async () => {
    const res = await (await signIn("anna.schmidt")).get("/api/analytics/overview").expect(200);
    const { _sum } = await prisma().deal.aggregate({ where: { stage: { notIn: ["WON", "LOST"] } }, _sum: { valueCents: true } });
    expect(res.body.live.pipelineEur).toBeCloseTo((_sum.valueCents ?? 0) / 100, 2);
  });

  it("validates filters", async () => {
    await (await signIn("anna.schmidt")).get("/api/analytics/overview?company=../etc").expect(400);
  });

  it("restricts the absence breakdown to HR and managers", async () => {
    await (await signIn("tim.hoffmann")).get("/api/analytics/absence-by-department").expect(403);
    const res = await (await signIn("jonas.weber")).get("/api/analytics/absence-by-department").expect(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });
});

describe("warehouse ETL", () => {
  it("keeps department history for employees (SCD type 2)", async () => {
    const emp = await prisma().employee.findFirstOrThrow({ where: { department: { code: "FIELD" }, status: "ACTIVE" } });
    const hr = await prisma().department.findUniqueOrThrow({ where: { code: "HR" } });
    await prisma().employee.update({ where: { id: emp.id }, data: { departmentId: hr.id } });
    await refreshWarehouse();
    const versions = await prisma().$queryRaw<{ department: string; is_current: boolean }[]>`
      SELECT department, is_current FROM analytics.dim_employee WHERE employee_id = ${emp.id} ORDER BY employee_key`;
    expect(versions).toEqual([
      { department: "Field Service", is_current: false },
      { department: "Human Resources", is_current: true },
    ]);
  });

  it("reflects a newly won deal in the KPI mart after refresh", async () => {
    const before = await prisma().$queryRaw<{ n: bigint }[]>`SELECT coalesce(sum(deals_won), 0)::bigint AS n FROM analytics.mv_kpi_monthly`;
    const deal = await prisma().deal.findFirstOrThrow({ where: { stage: "NEGOTIATION" } });
    await prisma().deal.update({ where: { id: deal.id }, data: { stage: "WON", closedAt: new Date() } });
    await refreshWarehouse();
    const after = await prisma().$queryRaw<{ n: bigint }[]>`SELECT coalesce(sum(deals_won), 0)::bigint AS n FROM analytics.mv_kpi_monthly`;
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n) + 1);
  });

  it("only lets admins trigger a refresh", async () => {
    await (await signIn("lea.fischer")).post("/api/analytics/refresh").expect(403);
    const res = await (await signIn("anna.schmidt")).post("/api/analytics/refresh").expect(200);
    expect(res.body.rows.fact_deal).toBeGreaterThan(0);
  });

  it("uses the indexes on fact tables for company/date filters", async () => {
    await prisma().$executeRawUnsafe("ANALYZE analytics.fact_ticket");
    await prisma().$executeRawUnsafe("SET enable_seqscan = off");
    const plan = await prisma().$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      "EXPLAIN SELECT count(*) FROM analytics.fact_ticket WHERE company_key = 4 AND created_date_key >= 20260101",
    );
    await prisma().$executeRawUnsafe("RESET enable_seqscan");
    expect(plan.map((p) => p["QUERY PLAN"]).join("\n")).toMatch(/fact_ticket_created_idx/);
  });
});
