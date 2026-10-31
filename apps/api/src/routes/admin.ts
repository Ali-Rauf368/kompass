import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/session";
import { AuditEvent } from "../db/mongo";
import { prisma } from "../db/prisma";
import { pageQuery, paged } from "../lib/http";

const router = Router();
router.use(requireRole("ADMIN"));

router.get("/audit", async (req, res) => {
  const f = pageQuery
    .extend({ actor: z.string().trim().max(80).optional(), action: z.string().trim().max(80).optional(), entityType: z.string().trim().max(40).optional(), personalData: z.enum(["true", "false"]).optional() })
    .parse(req.query);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter: Record<string, unknown> = {
    ...(f.actor ? { actor: new RegExp(`^${escape(f.actor)}`, "i") } : {}),
    ...(f.action ? { action: new RegExp(`^${escape(f.action)}`) } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.personalData ? { personalData: f.personalData === "true" } : {}),
  };
  const [items, total] = await Promise.all([
    AuditEvent.find(filter).sort({ at: -1 }).skip((f.page - 1) * f.pageSize).limit(f.pageSize).lean(),
    AuditEvent.countDocuments(filter),
  ]);
  res.json(paged(items.map(({ _id, ...e }) => ({ id: String(_id), ...e })), total, f.page, f.pageSize));
});

router.get("/users", async (_req, res) => {
  const users = await prisma().user.findMany({ orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }] });
  res.json({ users });
});

export default router;
