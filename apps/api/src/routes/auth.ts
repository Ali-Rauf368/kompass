import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../auth/ldap";
import { rolesForGroups } from "../auth/roles";
import { clearSessionCookie, requireAuth, currentUser, setSessionCookie, signSession } from "../auth/session";
import { config } from "../config";
import { prisma } from "../db/prisma";
import { audit } from "../lib/audit";
import { HttpError } from "../lib/errors";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: () => config().LOGIN_RATE_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a few minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = z
    .object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(256) })
    .parse(req.body);
  let entry;
  try {
    entry = await authenticate(username.replace(/^rheinwerk\\/i, ""), password);
  } catch (err) {
    req.log?.error({ err }, "directory unavailable");
    throw new HttpError(503, "The company directory is not reachable right now. Please try again shortly.");
  }
  if (!entry) {
    await audit({ actor: username, ip: req.ip }, { action: "login.failed", entityType: "session" });
    throw new HttpError(401, "Username or password is incorrect");
  }
  const roles = rolesForGroups(entry.groups);
  const employee = await prisma().employee.findUnique({ where: { username: entry.username }, select: { id: true } });
  const user = await prisma().user.upsert({
    where: { username: entry.username },
    create: { username: entry.username, displayName: entry.displayName, email: entry.email, roles, employeeId: employee?.id, lastLoginAt: new Date() },
    update: { displayName: entry.displayName, email: entry.email, roles, employeeId: employee?.id ?? null, lastLoginAt: new Date() },
  });
  const session = { id: user.id, username: user.username, displayName: user.displayName, roles: user.roles, employeeId: user.employeeId };
  setSessionCookie(res, signSession(session));
  await audit({ actor: user.username, ip: req.ip }, { action: "login.succeeded", entityType: "session", details: { roles } });
  res.json({ user: session });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});

export default router;
