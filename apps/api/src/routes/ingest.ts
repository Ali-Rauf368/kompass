import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config";
import { RawIngest } from "../db/mongo";
import { prisma } from "../db/prisma";
import { PIPELINES } from "../ingest/pipelines";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { scheduleRefresh } from "../analytics/warehouse";
import { publish } from "../realtime/hub";

const router = Router();

function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(req.get("X-Api-Key") ?? "");
  const expected = Buffer.from(config().INGEST_API_KEY);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, "Invalid API key");
  next();
}

router.use(requireApiKey);

router.get("/", (_req, res) => {
  res.json({ pipelines: Object.entries(PIPELINES).map(([name, p]) => ({ name, description: p.description })) });
});

/**
 * POST /api/ingest/:pipeline
 * Headers: X-Api-Key, X-Batch-Id (idempotency key; NiFi sends ${filename} or ${uuid})
 * Body: JSON array of records, or { records: [...] }
 * Re-sending the same batch id returns the original result without writing again.
 */
router.post("/:pipeline", async (req, res) => {
  const def = PIPELINES[req.params.pipeline!];
  if (!def) throw notFound(`Pipeline "${req.params.pipeline}"`);
  const batchId = z.string().trim().min(1).max(200).parse(req.get("X-Batch-Id") ?? `${req.params.pipeline}-${Date.now()}`);
  const body = z.union([z.array(z.unknown()), z.object({ records: z.array(z.unknown()) })]).parse(req.body);
  const records = Array.isArray(body) ? body : body.records;
  if (records.length > 5000) throw new HttpError(413, "Send at most 5000 records per batch");

  const db = prisma();
  const pipeline = req.params.pipeline!;
  const previous = await db.ingestionRun.findUnique({ where: { pipeline_batchId: { pipeline, batchId } } });
  if (previous && previous.status !== "RUNNING") {
    res.status(200).json({ run: previous, replayed: true });
    return;
  }
  const run = previous ?? (await db.ingestionRun.create({ data: { pipeline, batchId, received: records.length } }));
  await RawIngest.create({ pipeline, batchId, records });

  let inserted = 0, updated = 0;
  const errors: { record: number; message: string }[] = [];
  for (const [i, raw] of records.entries()) {
    const parsed = def.record.safeParse(raw);
    if (!parsed.success) {
      errors.push({ record: i, message: parsed.error.issues.map((x) => `${x.path.join(".") || "record"}: ${x.message}`).join("; ") });
      continue;
    }
    try {
      if ((await def.upsert(db, parsed.data)) === "inserted") inserted++;
      else updated++;
    } catch (err) {
      errors.push({ record: i, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const status = errors.length === 0 ? "SUCCEEDED" : errors.length === records.length ? "FAILED" : "PARTIAL";
  const finished = await db.ingestionRun.update({
    where: { id: run.id },
    data: { status, inserted, updated, rejected: errors.length, errors: errors.slice(0, 100), finishedAt: new Date() },
  });
  await audit({ actor: "nifi", ip: req.ip }, { action: "ingest.batch", entityType: "pipeline", entityId: pipeline, details: { batchId, status, inserted, updated, rejected: errors.length } });
  publish({ roles: ["ADMIN", "ACCOUNTING", "SALES"] }, { type: "ingestion.finished", pipeline, runId: run.id, status });
  if (inserted + updated > 0) scheduleRefresh(() => publish({ all: true }, { type: "kpis.changed" }));
  // 207 tells NiFi some records failed; route those FlowFiles to a retry/failure relationship.
  res.status(status === "SUCCEEDED" ? 200 : status === "PARTIAL" ? 207 : 422).json({ run: finished, replayed: false });
});

export default router;
