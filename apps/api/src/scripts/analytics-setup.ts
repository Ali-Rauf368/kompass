import { setupWarehouse } from "../analytics/warehouse";
import { disconnectPrisma } from "../db/prisma";

setupWarehouse()
  .then(() => console.log("analytics schema is up to date"))
  .finally(disconnectPrisma);
