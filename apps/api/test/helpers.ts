import request from "supertest";
import { afterAll, beforeAll } from "@jest/globals";
import { createApp } from "../src/app";
import { connectMongo, disconnectMongo } from "../src/db/mongo";
import { disconnectPrisma } from "../src/db/prisma";

export const app = createApp();

/** Connects Mongo for the file and closes all clients afterwards. */
export function useDatabases() {
  beforeAll(async () => {
    await connectMongo();
  });
  afterAll(async () => {
    await Promise.all([disconnectMongo(), disconnectPrisma()]);
  });
}

const CSRF = { "X-Kompass-Client": "web" };

/** A supertest agent signed in as a demo user (password "kompass"); keeps the session cookie. */
export async function signIn(username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set(CSRF).send({ username, password: "kompass" });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    agent,
    user: res.body.user as { id: number; username: string; roles: string[]; employeeId: number },
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set(CSRF).send(body ?? {}),
    patch: (url: string, body: object) => agent.patch(url).set(CSRF).send(body),
  };
}

export const api = () => request(app);
export { CSRF };

/** YYYY-MM-DD of the next weekday at least `days` days from now. */
export function futureWeekday(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
