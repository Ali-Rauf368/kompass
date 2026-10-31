import { config } from "../config";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { disconnectPrisma } from "../db/prisma";
import { applyRetention } from "../lib/gdpr";

async function main() {
  await connectMongo();
  console.log("retention:", await applyRetention(config().LEAVE_RETENTION_YEARS));
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([disconnectPrisma(), disconnectMongo()]));
