import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, directoryHasUser } from "../auth/ldap";
import { hashPassword, verifyPassword } from "../auth/password";
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

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => config().LOGIN_RATE_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-up attempts. Please try again later." },
});

const SignupBody = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "Use 3–32 letters, digits, dots, dashes or underscores"),
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(256),
});

/**
 * Self-registration. New accounts only ever get EMPLOYEE; further roles still come from AD groups.
 * Usernames that exist in Kompass or in the directory are refused, so nobody can claim a colleague's name.
 */
router.post("/signup", signupLimiter, async (req, res) => {
  const body = SignupBody.parse(req.body);
  if (await prisma().user.findUnique({ where: { username: body.username }, select: { id: true } })) throw new HttpError(409, "This username is already taken");
  let inDirectory;
  try {
    inDirectory = await directoryHasUser(body.username);
  } catch (err) {
    req.log?.error({ err }, "directory unavailable");
    throw new HttpError(503, "The company directory is not reachable right now. Please try again shortly.");
  }
  if (inDirectory) throw new HttpError(409, "This username is already taken");

  const user = await prisma().user.create({
    data: { username: body.username, displayName: body.displayName, email: body.email, roles: ["EMPLOYEE"], passwordHash: await hashPassword(body.password), lastLoginAt: new Date() },
  });
  const session = { id: user.id, username: user.username, displayName: user.displayName, roles: user.roles, employeeId: user.employeeId };
  setSessionCookie(res, signSession(session));
  await audit({ actor: user.username, ip: req.ip }, { action: "signup.succeeded", entityType: "session" });
  res.status(201).json({ user: session });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = z
    .object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(256) })
    .parse(req.body);

  // Self-registered accounts never fall through to the directory.
  const local = await prisma().user.findUnique({ where: { username } });
  if (local?.passwordHash) {
    if (!(await verifyPassword(password, local.passwordHash))) {
      await audit({ actor: username, ip: req.ip }, { action: "login.failed", entityType: "session" });
      throw new HttpError(401, "Username or password is incorrect");
    }
    const user = await prisma().user.update({ where: { id: local.id }, data: { lastLoginAt: new Date() } });
    const session = { id: user.id, username: user.username, displayName: user.displayName, roles: user.roles, employeeId: user.employeeId };
    setSessionCookie(res, signSession(session));
    await audit({ actor: user.username, ip: req.ip }, { action: "login.succeeded", entityType: "session", details: { roles: user.roles } });
    res.json({ user: session });
    return;
  }

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
