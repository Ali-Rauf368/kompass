import { describe, expect, it } from "@jest/globals";
import { AuditEvent } from "../src/db/mongo";
import { api, CSRF, signIn, useDatabases } from "./helpers";

useDatabases();

const login = (username: string, password = "kompass") => api().post("/api/auth/login").set(CSRF).send({ username, password });

describe("POST /api/auth/login (Active Directory)", () => {
  it("signs in and maps AD groups to roles", async () => {
    const res = await login("anna.schmidt").expect(200);
    expect(res.body.user).toMatchObject({ username: "anna.schmidt", displayName: "Anna Schmidt", roles: ["ADMIN", "MANAGER", "EMPLOYEE"] });
    expect(res.body.user.employeeId).toEqual(expect.any(Number));
    expect(res.headers["set-cookie"]?.[0]).toMatch(/kompass_session=.+HttpOnly/);
  });

  it("accepts DOMAIN\\username and any letter case", async () => {
    const res = await login("RHEINWERK\\Jonas.Weber").expect(200);
    expect(res.body.user.roles).toEqual(["HR", "MANAGER", "EMPLOYEE"]);
  });

  it("gives plain employees only the EMPLOYEE role", async () => {
    expect((await login("tim.hoffmann").expect(200)).body.user.roles).toEqual(["EMPLOYEE"]);
  });

  it.each([
    ["wrong password", "anna.schmidt", "nope"],
    ["unknown user", "nobody.here", "kompass"],
    ["disabled account", "max.disabled", "kompass"],
    ["LDAP filter injection", "*", "kompass"],
    ["injection attempt", "anna.schmidt)(objectClass=*", "kompass"],
  ])("rejects %s with a generic message", async (_label, username, password) => {
    const res = await login(username, password).expect(401);
    expect(res.body.error).toBe("Username or password is incorrect");
  });

  it("records failed logins in the audit log", async () => {
    await login("anna.schmidt", "definitely-wrong").expect(401);
    expect(await AuditEvent.countDocuments({ action: "login.failed", actor: "anna.schmidt" })).toBeGreaterThan(0);
  });

  it("validates input", async () => {
    await api().post("/api/auth/login").set(CSRF).send({ username: "" }).expect(400);
  });
});

describe("sessions", () => {
  it("returns the current user from the cookie", async () => {
    const s = await signIn("lea.fischer");
    const res = await s.get("/api/auth/me").expect(200);
    expect(res.body.user.username).toBe("lea.fischer");
  });

  it("rejects requests without a session", async () => {
    await api().get("/api/auth/me").expect(401);
    await api().get("/api/employees").expect(401);
  });

  it("rejects a tampered session cookie", async () => {
    await api().get("/api/auth/me").set("Cookie", "kompass_session=eyJhbGciOiJIUzI1NiJ9.e30.forged").expect(401);
  });

  it("logs out by clearing the cookie", async () => {
    const s = await signIn("lea.fischer");
    const res = await s.post("/api/auth/logout").expect(204);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/kompass_session=;/);
  });

  it("requires the CSRF header on writes", async () => {
    const res = await api().post("/api/auth/login").send({ username: "anna.schmidt", password: "kompass" }).expect(403);
    expect(res.body.error).toMatch(/X-Kompass-Client/);
  });
});
