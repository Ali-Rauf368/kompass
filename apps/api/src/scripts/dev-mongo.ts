/** Runs a persistent local MongoDB on port 27018 with data in <repo>/.data/mongo (dev only). */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { mongoRuntime } from "./mongo-runtime";

async function main() {
  const runtime = await mongoRuntime();
  Object.assign(process.env, runtime.env);
  const dbPath = path.resolve(__dirname, "../../../../.data/mongo");
  mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    binary: runtime.version === "system" ? undefined : { version: runtime.version },
    instance: { port: 27018, dbPath, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  console.log(`MongoDB ${runtime.version} ready at ${server.getUri()} (data: ${dbPath})`);
  const stop = async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
