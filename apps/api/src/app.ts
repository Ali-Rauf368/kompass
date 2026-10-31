import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import { requireAuth, requireCsrfHeader } from "./auth/session";
import { config } from "./config";
import { HttpError } from "./lib/errors";
import { logger } from "./lib/logger";
import { openapi } from "./openapi";
import adminRoutes from "./routes/admin";
import analyticsRoutes from "./routes/analytics";
import authRoutes from "./routes/auth";
import customerRoutes from "./routes/customers";
import dealRoutes from "./routes/deals";
import employeeRoutes from "./routes/employees";
import gdprRoutes from "./routes/gdpr";
import healthRoutes from "./routes/health";
import ingestRoutes from "./routes/ingest";
import invoiceRoutes from "./routes/invoices";
import leaveRoutes from "./routes/leave";
import notificationRoutes from "./routes/notifications";
import pipelineRoutes from "./routes/pipelines";
import ticketRoutes from "./routes/tickets";

export function createApp() {
  const app = express();
  const c = config();
  if (c.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(c.TRUST_PROXY) ? Number(c.TRUST_PROXY) : c.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: c.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  if (c.NODE_ENV !== "test") app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  app.use("/api/health", healthRoutes);
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openapi);
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "Kompass API" }));

  // Machine-to-machine: NiFi authenticates with an API key, not a session.
  app.use("/api/ingest", ingestRoutes);

  app.use("/api", requireCsrfHeader);
  app.use("/api/auth", authRoutes);
  app.use("/api", requireAuth);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/leave", leaveRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/deals", dealRoutes);
  app.use("/api/tickets", ticketRoutes);
  app.use("/api/invoices", invoiceRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/pipelines", pipelineRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/gdpr", gdprRoutes);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Route not found")));
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  // Prisma known errors
  if (err?.code === "P2025") {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  if (err?.code === "P2002") {
    res.status(409).json({ error: "A record with this value already exists" });
    return;
  }
  if (err?.code === "P2003") {
    res.status(400).json({ error: "Referenced record does not exist" });
    return;
  }
  (req.log ?? logger).error({ err }, "unhandled error");
  res.status(500).json({ error: "Something went wrong on our side" });
};
