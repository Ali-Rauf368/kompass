/**
 * Full stack for Playwright on throwaway infrastructure: temp Postgres cluster, in-memory MongoDB,
 * mock AD, migrated + seeded, API on E2E_API_PORT (default 4110). Cleans up on exit, and a watchdog
 * removes the Postgres cluster even if this process is killed.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEV_ROLE_MAP, startDirectory } from "../src/ldap-directory";
import { DEMO_DIRECTORY } from "../src/scripts/demo-data";
import { mongoRuntime } from "../src/scripts/mongo-runtime";

const PGBIN = process.env.PGBIN ?? "/usr/lib/postgresql/16/bin";
const port = Number(process.env.E2E_API_PORT ?? 4110);
const freePort = () => new Promise<number>((r) => { const s = netServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "kompass-e2e-"));
  const pgPort = await freePort();
  execFileSync(`${PGBIN}/initdb`, ["-D", `${dir}/pg`, "-U", "e2e", "--auth=trust", "--no-sync"], { stdio: "ignore" });
  execFileSync(`${PGBIN}/pg_ctl`, ["-D", `${dir}/pg`, "-o", `-p ${pgPort} -k ${dir} -c listen_addresses=localhost -c fsync=off`, "-l", `${dir}/pg.log`, "-w", "start"], { stdio: "ignore" });
  spawn("sh", ["-c", `while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done; "${PGBIN}/pg_ctl" -D "${dir}/pg" -m immediate stop; rm -rf "${dir}"`], { detached: true, stdio: "ignore" }).unref();
  execFileSync(`${PGBIN}/createdb`, ["-h", "localhost", "-p", String(pgPort), "-U", "e2e", "kompass"]);

  const runtime = await mongoRuntime();
  Object.assign(process.env, runtime.env);
  const mongo = await MongoMemoryServer.create({ binary: runtime.version === "system" ? undefined : { version: runtime.version } });
  const ldap = await startDirectory(DEMO_DIRECTORY, { port: 0, servicePassword: "svc-e2e" });

  Object.assign(process.env, {
    NODE_ENV: "production",
    DATABASE_URL: `postgresql://e2e@localhost:${pgPort}/kompass`,
    MONGO_URL: `${mongo.getUri()}kompass`,
    JWT_SECRET: "e2e-secret-0123456789abcdef",
    INGEST_API_KEY: "e2e-ingest-key-0123456789",
    LDAP_URL: ldap.url,
    LDAP_BIND_PASSWORD: "svc-e2e",
    LDAP_GROUP_ROLE_MAP: DEV_ROLE_MAP,
    LOGIN_RATE_LIMIT: "10000",
    CORS_ORIGIN: "http://localhost:5191",
    LOG_LEVEL: "warn",
  });
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: path.resolve(__dirname, ".."), env: process.env, stdio: "ignore" });

  const { setupWarehouse } = await import("../src/analytics/warehouse.js");
  const { connectMongo } = await import("../src/db/mongo.js");
  const { seedDatabase } = await import("../src/scripts/seed-db.js");
  const { createApp } = await import("../src/app.js");
  const { attachRealtime } = await import("../src/realtime/hub.js");
  await setupWarehouse();
  await connectMongo();
  await seedDatabase();

  const server = createServer(createApp());
  attachRealtime(server);
  server.listen(port, () => console.log(`e2e API ready on :${port}`));

  const stop = async () => {
    server.close();
    await ldap.close();
    await mongo.stop();
    try {
      execFileSync(`${PGBIN}/pg_ctl`, ["-D", `${dir}/pg`, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* watchdog will clean up */
    }
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
