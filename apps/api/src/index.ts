import { createServer } from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { connectMongo, disconnectMongo } from "./db/mongo";
import { disconnectPrisma, prisma } from "./db/prisma";
import { logger } from "./lib/logger";
import { attachRealtime, closeRealtime } from "./realtime/hub";

async function main() {
  const c = config();
  await Promise.all([connectMongo(), prisma().$queryRaw`SELECT 1`]);
  const server = createServer(createApp());
  attachRealtime(server);
  server.listen(c.PORT, () => logger.info(`Kompass API on http://localhost:${c.PORT} (docs: /api/docs, websocket: /ws)`));

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    closeRealtime();
    server.close(async () => {
      await Promise.all([disconnectPrisma(), disconnectMongo()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
