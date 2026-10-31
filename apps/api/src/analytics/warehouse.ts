import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma";

const sql = (name: string) => readFileSync(path.resolve(__dirname, "../../sql", name), "utf8");

/** Creates/updates the star schema. Idempotent; run after Prisma migrations. */
export async function setupWarehouse() {
  await prisma().$executeRawUnsafe(sql("analytics-schema.sql"));
}

export interface RefreshResult {
  ms: number;
  rows: Record<string, number>;
}

/** Runs the ETL in one transaction and refreshes the KPI mart without blocking readers. */
export async function refreshWarehouse(): Promise<RefreshResult> {
  const started = Date.now();
  const db = prisma();
  const [{ id }] = (await db.$queryRaw<{ id: number }[]>`INSERT INTO analytics.etl_log DEFAULT VALUES RETURNING id`) as [{ id: number }];
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql("analytics-refresh.sql"));
    }, { timeout: 60_000 });
    await db.$executeRawUnsafe("REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpi_monthly");
    const counts = await db.$queryRaw<{ t: string; n: bigint }[]>`
      SELECT 'fact_deal' AS t, count(*) AS n FROM analytics.fact_deal
      UNION ALL SELECT 'fact_ticket', count(*) FROM analytics.fact_ticket
      UNION ALL SELECT 'fact_invoice', count(*) FROM analytics.fact_invoice
      UNION ALL SELECT 'fact_absence_day', count(*) FROM analytics.fact_absence_day
      UNION ALL SELECT 'dim_employee', count(*) FROM analytics.dim_employee`;
    const rows = Object.fromEntries(counts.map((c) => [c.t, Number(c.n)]));
    await db.$executeRaw`UPDATE analytics.etl_log SET finished_at = now(), rows_loaded = ${JSON.stringify(rows)}::jsonb WHERE id = ${id}`;
    return { ms: Date.now() - started, rows };
  } catch (err) {
    await db.$executeRaw`UPDATE analytics.etl_log SET finished_at = now(), error = ${String(err)} WHERE id = ${id}`;
    throw err;
  }
}

let pending: NodeJS.Timeout | undefined;
/** Debounced refresh after writes, so a burst of changes triggers one ETL run. */
export function scheduleRefresh(onDone?: () => void, delayMs = 3000) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    refreshWarehouse()
      .then(() => onDone?.())
      .catch((err) => console.error("analytics refresh failed", err));
  }, delayMs);
  pending.unref();
}
