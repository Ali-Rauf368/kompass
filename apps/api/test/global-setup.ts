/**
 * Boots disposable infrastructure for one test run:
 * - PostgreSQL cluster in a temp dir (initdb), migrated + warehouse schema + demo seed
 * - MongoDB via mongodb-memory-server
 * - mock Active Directory with the demo accounts plus a disabled account
 * Connection details are written to a temp file that setup-env.ts loads in each test file.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEV_ROLE_MAP, startDirectory } from "../src/ldap-directory";
import { DEMO_DIRECTORY } from "../src/scripts/demo-data";
import { mongoRuntime } from "../src/scripts/mongo-runtime";

const PGBIN = process.env.PGBIN ?? "/usr/lib/postgresql/16/bin";
export const ENV_FILE = path.join(tmpdir(), "kompass-test-env.json");

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

export default async function globalSetup() {
  const started = Date.now();
  const dir = mkdtempSync(path.join(tmpdir(), "kompass-test-"));
  const pgPort = await freePort();
  execFileSync(`${PGBIN}/initdb`, ["-D", `${dir}/pg`, "-U", "test", "--auth=trust", "--no-sync"], { stdio: "ignore" });
  execFileSync(`${PGBIN}/pg_ctl`, ["-D", `${dir}/pg`, "-o", `-p ${pgPort} -k ${dir} -c listen_addresses=localhost -c fsync=off -c synchronous_commit=off`, "-l", `${dir}/pg.log`, "-w", "start"], { stdio: "ignore" });
  execFileSync(`${PGBIN}/createdb`, ["-h", "localhost", "-p", String(pgPort), "-U", "test", "kompass_test"]);

  const runtime = await mongoRuntime();
  Object.assign(process.env, runtime.env);
  const mongo = await MongoMemoryServer.create({ binary: runtime.version === "system" ? undefined : { version: runtime.version } });

  const ldap = await startDirectory(
    [...DEMO_DIRECTORY, { username: "max.disabled", password: "kompass", displayName: "Max Disabled", mail: "max.disabled@rheinwerk.de", groups: ["HR"], disabled: true }],
    { port: 0, servicePassword: "svc-test" },
  );

  const env = {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://test@localhost:${pgPort}/kompass_test`,
    MONGO_URL: `${mongo.getUri()}kompass_test`,
    JWT_SECRET: "test-secret-0123456789abcdef",
    INGEST_API_KEY: "test-ingest-key-0123456789",
    LDAP_URL: ldap.url,
    LDAP_BIND_PASSWORD: "svc-test",
    LDAP_GROUP_ROLE_MAP: DEV_ROLE_MAP,
    LOGIN_RATE_LIMIT: "1000",
  };
  Object.assign(process.env, env);
  writeFileSync(ENV_FILE, JSON.stringify(env));

  const apiDir = path.resolve(__dirname, "..");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: apiDir, env: { ...process.env }, stdio: "ignore" });
  // The generated Prisma client uses ".js" import specifiers that Jest's globalSetup loader can't resolve,
  // so the warehouse + seed step runs under tsx.
  execFileSync("npx", ["tsx", "test/prepare-db.ts"], { cwd: apiDir, env: { ...process.env }, stdio: "inherit" });

  Object.assign(globalThis, { __KOMPASS__: { dir, pgPort, mongo, ldap } });
  console.log(`\ntest infrastructure ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
