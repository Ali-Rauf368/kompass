import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import WebSocket from "ws";
import { prisma } from "../src/db/prisma";
import { attachRealtime, closeRealtime } from "../src/realtime/hub";
import { DEMO_DIRECTORY } from "../src/scripts/demo-data";
import { app, futureWeekday, signIn, useDatabases } from "./helpers";

useDatabases();

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(app);
  attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  closeRealtime();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

/** Opens a socket with the user's session cookie and collects messages. */
async function connect(username: string) {
  const s = await signIn(username);
  const cookie = (await s.agent.get("/api/auth/me")).request.getHeader("Cookie") as string | undefined;
  const sessionCookie = cookie ?? (s.agent as unknown as { jar: { getCookie(n: string, o: object): { toValueString(): string } } }).jar.getCookie("kompass_session", { path: "/", domain: "127.0.0.1" })?.toValueString();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: sessionCookie ?? "" } });
  const messages: { type: string; [k: string]: unknown }[] = [];
  ws.on("message", (m) => messages.push(JSON.parse(String(m))));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const waitFor = async (type: string, timeout = 5000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const found = messages.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`no ${type} message; got ${messages.map((m) => m.type).join(", ")}`);
  };
  return { ws, session: s, messages, waitFor };
}

describe("WebSocket /ws", () => {
  it("refuses connections without a session", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const result = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("open"));
      ws.once("unexpected-response", (_req, res) => resolve(String(res.statusCode)));
      ws.once("error", () => resolve("error"));
    });
    expect(result).toBe("401");
  });

  it("greets authenticated users", async () => {
    const { ws, waitFor } = await connect("tim.hoffmann");
    expect(await waitFor("hello")).toMatchObject({ username: "tim.hoffmann" });
    ws.close();
  });

  it("pushes a notification to the manager when someone requests leave", async () => {
    const manager = await connect("murat.yilmaz");
    const tim = await signIn("tim.hoffmann");
    const day = futureWeekday(340);
    await tim.post("/api/leave", { type: "OTHER", startDate: day, endDate: day }).expect(201);
    expect(await manager.waitFor("notification")).toMatchObject({ title: expect.stringMatching(/requested 1 day off/) });
    manager.ws.close();
  });

  it("broadcasts ticket updates to after-sales but not to HR", async () => {
    const service = await connect("murat.yilmaz");
    // a plain HR clerk: no after-sales or manager role
    const hr = await connect(DEMO_DIRECTORY.find((u) => u.groups.length === 1 && u.groups[0] === "HR")!.username);
    const ticket = await prisma().ticket.findFirstOrThrow({ where: { status: "WAITING" } });
    await service.session.patch(`/api/tickets/${ticket.id}`, { status: "IN_PROGRESS" }).expect(200);
    expect(await service.waitFor("ticket.updated")).toMatchObject({ ticketId: ticket.id, status: "IN_PROGRESS" });
    await new Promise((r) => setTimeout(r, 200));
    expect(hr.messages.find((m) => m.type === "ticket.updated")).toBeUndefined();
    service.ws.close();
    hr.ws.close();
  });
});
