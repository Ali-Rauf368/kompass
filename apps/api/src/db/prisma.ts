import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config";
import { PrismaClient } from "../generated/prisma/client";

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: config().DATABASE_URL }) });
  return client;
}

export async function disconnectPrisma() {
  await client?.$disconnect();
  client = undefined;
}

export * from "../generated/prisma/client";
