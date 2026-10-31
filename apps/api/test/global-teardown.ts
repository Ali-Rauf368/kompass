import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import type { MongoMemoryServer } from "mongodb-memory-server";

export default async function globalTeardown() {
  const state = (globalThis as unknown as { __KOMPASS__?: { dir: string; mongo: MongoMemoryServer; ldap: { close(): Promise<void> } } }).__KOMPASS__;
  if (!state) return;
  await state.ldap.close();
  await state.mongo.stop();
  execFileSync(`${process.env.PGBIN ?? "/usr/lib/postgresql/16/bin"}/pg_ctl`, ["-D", `${state.dir}/pg`, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
  rmSync(state.dir, { recursive: true, force: true });
}
