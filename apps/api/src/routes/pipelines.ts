import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/session";
import { RawIngest } from "../db/mongo";
import { prisma } from "../db/prisma";
import { PIPELINES } from "../ingest/pipelines";
import { idParam, pageQuery, paged } from "../lib/http";
import { notFound } from "../lib/errors";

const router = Router();
router.use(requireRole("ADMIN", "ACCOUNTING", "SALES"));

router.get("/", async (_req, res) => {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const summaries = await Promise.all(
    Object.entries(PIPELINES).map(async ([name, def]) => {
      const [last, recent] = await Promise.all([
        prisma().ingestionRun.findFirst({ where: { pipeline: name }, orderBy: { startedAt: "desc" } }),
        prisma().ingestionRun.groupBy({ by: ["status"], where: { pipeline: name, startedAt: { gte: since } }, _count: true, _sum: { received: true, rejected: true } }),
      ]);
      const runs = recent.reduce((n, r) => n + r._count, 0);
      const ok = recent.find((r) => r.status === "SUCCEEDED")?._count ?? 0;
      const received = recent.reduce((n, r) => n + (r._sum.received ?? 0), 0);
      const rejected = recent.reduce((n, r) => n + (r._sum.rejected ?? 0), 0);
      return { name, description: def.description, lastRun: last, runs14d: runs, successRate14d: runs ? ok / runs : null, recordsReceived14d: received, rejectionRate14d: received ? rejected / received : null };
    }),
  );
  res.json({ pipelines: summaries });
});

router.get("/runs", async (req, res) => {
  const f = pageQuery.extend({ pipeline: z.string().optional(), status: z.enum(["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"]).optional() }).parse(req.query);
  const where = { ...(f.pipeline ? { pipeline: f.pipeline } : {}), ...(f.status ? { status: f.status } : {}) };
  const [items, total] = await Promise.all([
    prisma().ingestionRun.findMany({ where, orderBy: { startedAt: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma().ingestionRun.count({ where }),
  ]);
  res.json(paged(items, total, f.page, f.pageSize));
});

router.get("/runs/:id", async (req, res) => {
  const run = await prisma().ingestionRun.findUnique({ where: { id: idParam.parse(req.params.id) } });
  if (!run) throw notFound("Run");
  const raw = await RawIngest.findOne({ pipeline: run.pipeline, batchId: run.batchId }).lean();
  res.json({ run, sample: raw?.records.slice(0, 5) ?? null, rawAvailable: !!raw });
});

export default router;
