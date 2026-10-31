import { Router } from "express";
import mongoose from "mongoose";
import { prisma } from "../db/prisma";
import { connectedClients } from "../realtime/hub";

const router = Router();

/** Liveness + dependency checks for the load balancer / monitoring. */
router.get("/", async (_req, res) => {
  const checks = await Promise.allSettled([prisma().$queryRaw`SELECT 1`, mongoose.connection.db?.admin().ping() ?? Promise.reject(new Error("not connected"))]);
  const postgres = checks[0].status === "fulfilled", mongo = checks[1].status === "fulfilled";
  res.status(postgres && mongo ? 200 : 503).json({ status: postgres && mongo ? "ok" : "degraded", postgres, mongo, websocketClients: connectedClients(), version: process.env.APP_VERSION ?? "dev" });
});

export default router;
