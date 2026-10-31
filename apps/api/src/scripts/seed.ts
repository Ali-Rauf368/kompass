import { connectMongo, disconnectMongo } from "../db/mongo";
import { disconnectPrisma } from "../db/prisma";
import { seedDatabase } from "./seed-db";

async function main() {
  await connectMongo();
  const counts = await seedDatabase();
  console.log("Seeded demo data:", counts);
  console.log("Log in with anna.schmidt / kompass (admin) — see README for all demo accounts.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([disconnectPrisma(), disconnectMongo()]);
  });
