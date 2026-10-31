import { describe, expect, it } from "@jest/globals";
import { api, signIn, useDatabases } from "./helpers";

useDatabases();

describe("admin", () => {
  it("shows the audit log to admins with filters", async () => {
    const admin = await signIn("anna.schmidt");
    const res = await admin.get("/api/admin/audit?action=login.&pageSize=5").expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((e: { action: string }) => e.action.startsWith("login."))).toBe(true);
  });

  it("treats regex characters in filters literally", async () => {
    await (await signIn("anna.schmidt")).get("/api/admin/audit?actor=(.*").expect(200);
  });

  it("lists users provisioned from the directory", async () => {
    const res = await (await signIn("anna.schmidt")).get("/api/admin/users").expect(200);
    expect(res.body.users.find((u: { username: string }) => u.username === "anna.schmidt").roles).toContain("ADMIN");
  });

  it("is admin-only", async () => {
    await (await signIn("jonas.weber")).get("/api/admin/audit").expect(403);
  });
});

describe("system", () => {
  it("reports health of Postgres and MongoDB", async () => {
    expect((await api().get("/api/health").expect(200)).body).toMatchObject({ status: "ok", postgres: true, mongo: true });
  });

  it("serves the OpenAPI document and Swagger UI", async () => {
    expect((await api().get("/api/openapi.json").expect(200)).body.openapi).toBe("3.1.0");
    expect((await api().get("/api/docs/").expect(200)).text).toContain("swagger-ui");
  });

  it("answers unknown API routes with JSON 404", async () => {
    const s = await signIn("tim.hoffmann");
    expect((await s.get("/api/nope").expect(404)).body.error).toBe("Route not found");
  });

  it("returns 400 for malformed JSON", async () => {
    await api().post("/api/auth/login").set("X-Kompass-Client", "web").set("Content-Type", "application/json").send("{bad").expect(400);
  });
});
