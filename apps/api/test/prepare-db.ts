/** Run by global-setup in a tsx subprocess: migrations are applied by the caller; this builds the warehouse and seeds. */
import { setupWarehouse } from "../src/analytics/warehouse";
import { connectMongo, disconnectMongo } from "../src/db/mongo";
import { disconnectPrisma } from "../src/db/prisma";
import { seedDatabase } from "../src/scripts/seed-db";

(async () => {
  await setupWarehouse();
  await connectMongo();
  await seedDatabase();
  await Promise.all([disconnectMongo(), disconnectPrisma()]);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
