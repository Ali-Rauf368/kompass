import { refreshWarehouse } from "../analytics/warehouse";
import { disconnectPrisma } from "../db/prisma";

refreshWarehouse()
  .then((r) => console.log(`warehouse refreshed in ${r.ms} ms`, r.rows))
  .finally(disconnectPrisma);
