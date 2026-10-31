import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  // Never log credentials or session cookies.
  redact: ["req.headers.cookie", "req.headers.authorization", 'req.headers["x-api-key"]', "password", "*.password"],
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
});
