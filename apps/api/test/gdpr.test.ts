import { describe, expect, it } from "@jest/globals";
import { AuditEvent, TicketActivity } from "../src/db/mongo";
import { applyRetention } from "../src/lib/gdpr";
import { prisma } from "../src/db/prisma";
import { signIn, useDatabases } from "./helpers";

useDatabases();

describe("GDPR", () => {
  it("lets employees export their own data, but not other people's", async () => {
    const tim = await signIn("tim.hoffmann");
    const res = await tim.get(`/api/gdpr/employees/${tim.user.employeeId}/export`).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body).toMatchObject({ employee: { username: "tim.hoffmann" }, leaveRequests: expect.any(Array), legalBasis: expect.stringMatching(/GDPR/) });
    const anna = await prisma().employee.findUniqueOrThrow({ where: { username: "anna.schmidt" } });
    await tim.get(`/api/gdpr/employees/${anna.id}/export`).expect(403);
  });

  it("lets HR export anyone's data", async () => {
    const tim = await prisma().employee.findUniqueOrThrow({ where: { username: "tim.hoffmann" } });
    await (await signIn("jonas.weber")).get(`/api/gdpr/employees/${tim.id}/export`).expect(200);
  });

  it("only erases former employees, and asks for explicit confirmation", async () => {
    const hr = await signIn("jonas.weber");
    const active = await prisma().employee.findUniqueOrThrow({ where: { username: "tim.hoffmann" } });
    await hr.post(`/api/gdpr/employees/${active.id}/erase`, { confirm: "ERASE" }).expect(409);
    const leaver = await prisma().employee.findFirstOrThrow({ where: { status: "LEFT", pseudonymizedAt: null } });
    await hr.post(`/api/gdpr/employees/${leaver.id}/erase`, {}).expect(400);
  });

  it("pseudonymises a former employee across Postgres and MongoDB", async () => {
    const hr = await signIn("jonas.weber");
    const leaver = await prisma().employee.findFirstOrThrow({ where: { status: "LEFT", pseudonymizedAt: null } });
    await TicketActivity.create({ ticketId: 1, kind: "comment", author: leaver.username, authorName: `${leaver.firstName} ${leaver.lastName}`, body: "test" });
    const res = await hr.post(`/api/gdpr/employees/${leaver.id}/erase`, { confirm: "ERASE" }).expect(200);
    const after = await prisma().employee.findUniqueOrThrow({ where: { id: leaver.id } });
    expect(after).toMatchObject({ firstName: "Former", email: `former-${leaver.id}@deleted.invalid`, phone: null });
    expect(after.pseudonymizedAt).not.toBeNull();
    expect(await TicketActivity.countDocuments({ author: leaver.username })).toBe(0);
    expect(await TicketActivity.countDocuments({ author: res.body.alias })).toBeGreaterThan(0);
    expect(await AuditEvent.countDocuments({ action: "gdpr.erased", entityId: String(leaver.id) })).toBe(1);
    await hr.post(`/api/gdpr/employees/${leaver.id}/erase`, { confirm: "ERASE" }).expect(409);
  });

  it("is restricted to HR", async () => {
    const leaver = await prisma().employee.findFirstOrThrow({ where: { status: "LEFT" } });
    await (await signIn("lea.fischer")).post(`/api/gdpr/employees/${leaver.id}/erase`, { confirm: "ERASE" }).expect(403);
  });

  it("applies the retention policy to old records of former employees", async () => {
    const company = await prisma().company.findFirstOrThrow();
    const dept = await prisma().department.findFirstOrThrow();
    const old = await prisma().employee.create({
      data: { personnelNo: "P9999", firstName: "Old", lastName: "Leaver", email: "old.leaver@rheinwerk.de", username: "old.leaver", jobTitle: "Clerk", hireDate: new Date("2015-01-01"), exitDate: new Date("2019-06-30"), status: "LEFT", companyId: company.id, departmentId: dept.id },
    });
    await prisma().leaveRequest.create({ data: { employeeId: old.id, type: "VACATION", startDate: new Date("2019-03-04"), endDate: new Date("2019-03-08"), workingDays: 5, status: "APPROVED" } });
    const result = await applyRetention(3);
    expect(result.leaveDeleted).toBeGreaterThanOrEqual(1);
    expect(result.employeesPseudonymized).toBeGreaterThanOrEqual(1);
    expect((await prisma().employee.findUniqueOrThrow({ where: { id: old.id } })).firstName).toBe("Former");
  });
});
