import { describe, expect, it } from "@jest/globals";
import { AuditEvent, Notification } from "../src/db/mongo";
import { prisma } from "../src/db/prisma";
import { futureWeekday, signIn, useDatabases } from "./helpers";

useDatabases();

describe("employee directory", () => {
  it("hides personnel data from non-HR users (data minimisation)", async () => {
    const s = await signIn("lea.fischer");
    const res = await s.get("/api/employees?pageSize=5").expect(200);
    expect(res.body.items[0]).toHaveProperty("email");
    expect(res.body.items[0]).not.toHaveProperty("personnelNo");
    expect(res.body.items[0]).not.toHaveProperty("hireDate");
  });

  it("shows personnel data to HR and audits profile views", async () => {
    const hr = await signIn("jonas.weber");
    const list = await hr.get("/api/employees?q=Hoffmann").expect(200);
    expect(list.body.items[0]).toMatchObject({ lastName: "Hoffmann", personnelNo: expect.any(String) });
    await hr.get(`/api/employees/${list.body.items[0].id}`).expect(200);
    expect(await AuditEvent.countDocuments({ actor: "jonas.weber", action: "employee.viewed", personalData: true })).toBeGreaterThan(0);
  });

  it("filters by department and searches names", async () => {
    const s = await signIn("anna.schmidt");
    const res = await s.get("/api/employees?department=SALES&pageSize=100").expect(200);
    expect(res.body.total).toBeGreaterThan(5);
    expect(res.body.items.every((e: { department: { code: string } }) => e.department.code === "SALES")).toBe(true);
  });

  it("paginates", async () => {
    const s = await signIn("anna.schmidt");
    const res = await s.get("/api/employees?pageSize=10&page=2").expect(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 10, items: expect.any(Array) });
    expect(res.body.items).toHaveLength(10);
  });

  it("lets only HR change job data, and rejects self-management", async () => {
    const sales = await signIn("lea.fischer");
    const hr = await signIn("jonas.weber");
    const tim = await prisma().employee.findUniqueOrThrow({ where: { username: "tim.hoffmann" } });
    await sales.patch(`/api/employees/${tim.id}`, { jobTitle: "Senior Technician" }).expect(403);
    const res = await hr.patch(`/api/employees/${tim.id}`, { jobTitle: "Senior Service Technician" }).expect(200);
    expect(res.body.employee.jobTitle).toBe("Senior Service Technician");
    await hr.patch(`/api/employees/${tim.id}`, { managerId: tim.id }).expect(400);
  });
});

describe("leave requests", () => {
  it("calculates working days, notifies the manager, and shows up for approval", async () => {
    const tim = await signIn("tim.hoffmann");
    const start = futureWeekday(200);
    const end = new Date(new Date(start).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
    const res = await tim.post("/api/leave", { type: "TRAINING", startDate: start, endDate: end, note: "Heat pump certification" }).expect(201);
    expect(res.body.leave).toMatchObject({ status: "PENDING", workingDays: expect.any(Number) });
    expect(res.body.leave.workingDays).toBeLessThanOrEqual(5);
    expect(await Notification.countDocuments({ username: "murat.yilmaz", kind: "leave" })).toBeGreaterThan(0);

    const manager = await signIn("murat.yilmaz");
    const approvals = await manager.get("/api/leave?view=approvals&status=PENDING&pageSize=100").expect(200);
    expect(approvals.body.items.map((l: { id: number }) => l.id)).toContain(res.body.leave.id);
  });

  it("rejects overlapping requests", async () => {
    const tim = await signIn("tim.hoffmann");
    const start = futureWeekday(230);
    await tim.post("/api/leave", { type: "TRAINING", startDate: start, endDate: start }).expect(201);
    const res = await tim.post("/api/leave", { type: "OTHER", startDate: start, endDate: start }).expect(409);
    expect(res.body.error).toMatch(/already have leave/);
  });

  it("rejects vacation beyond the remaining balance", async () => {
    const lea = await signIn("lea.fischer");
    const year = new Date().getUTCFullYear() + 1;
    const res = await lea.post("/api/leave", { type: "VACATION", startDate: `${year}-02-01`, endDate: `${year}-04-30` }).expect(400);
    expect(res.body.error).toMatch(/vacation days left/);
  });

  it("rejects end dates before start dates and weekend-only periods", async () => {
    const tim = await signIn("tim.hoffmann");
    await tim.post("/api/leave", { type: "OTHER", startDate: "2030-03-10", endDate: "2030-03-01" }).expect(400);
    const res = await tim.post("/api/leave", { type: "OTHER", startDate: "2030-03-09", endDate: "2030-03-10" }).expect(400);
    expect(res.body.error).toMatch(/no working days/);
  });

  it("lets the manager approve and notifies the employee; only once", async () => {
    const tim = await signIn("tim.hoffmann");
    const start = futureWeekday(260);
    const { body } = await tim.post("/api/leave", { type: "OTHER", startDate: start, endDate: start }).expect(201);
    const manager = await signIn("murat.yilmaz");
    const res = await manager.post(`/api/leave/${body.leave.id}/decision`, { decision: "APPROVED" }).expect(200);
    expect(res.body.leave).toMatchObject({ status: "APPROVED", approver: { lastName: "Yılmaz" } });
    expect(await Notification.countDocuments({ username: "tim.hoffmann", title: /approved/ })).toBeGreaterThan(0);
    await manager.post(`/api/leave/${body.leave.id}/decision`, { decision: "REJECTED" }).expect(409);
  });

  it("doesn't let unrelated managers or the requester decide", async () => {
    const tim = await signIn("tim.hoffmann");
    const start = futureWeekday(290);
    const { body } = await tim.post("/api/leave", { type: "OTHER", startDate: start, endDate: start }).expect(201);
    await (await signIn("lea.fischer")).post(`/api/leave/${body.leave.id}/decision`, { decision: "APPROVED" }).expect(403);
    await tim.post(`/api/leave/${body.leave.id}/decision`, { decision: "APPROVED" }).expect(403);
  });

  it("lets employees cancel upcoming leave", async () => {
    const tim = await signIn("tim.hoffmann");
    const start = futureWeekday(320);
    const { body } = await tim.post("/api/leave", { type: "OTHER", startDate: start, endDate: start }).expect(201);
    expect((await tim.post(`/api/leave/${body.leave.id}/cancel`).expect(200)).body.leave.status).toBe("CANCELLED");
    await (await signIn("lea.fischer")).post(`/api/leave/${body.leave.id}/cancel`).expect(404);
  });

  it("reports the vacation balance", async () => {
    const res = await (await signIn("lea.fischer")).get("/api/leave/balance").expect(200);
    expect(res.body).toMatchObject({ entitlement: 30, remaining: expect.any(Number) });
    expect(res.body.remaining).toBe(res.body.entitlement - res.body.approved - res.body.pending);
  });

  it("restricts the all-requests view to HR", async () => {
    await (await signIn("lea.fischer")).get("/api/leave?view=all").expect(403);
    await (await signIn("jonas.weber")).get("/api/leave?view=all").expect(200);
  });
});
