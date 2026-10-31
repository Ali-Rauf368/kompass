import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import type { Role } from "../generated/prisma/client";
import { forbidden, HttpError } from "../lib/errors";

export const SESSION_COOKIE = "kompass_session";

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roles: Role[];
  employeeId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser): string {
  return jwt.sign(user, config().JWT_SECRET, { expiresIn: `${config().SESSION_HOURS}h`, issuer: "kompass" });
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  try {
    const { id, username, displayName, roles, employeeId } = jwt.verify(token, config().JWT_SECRET, {
      issuer: "kompass",
    }) as SessionUser;
    return { id, username, displayName, roles, employeeId };
  } catch {
    return null;
  }
}

/** httpOnly so scripts can't read it; SameSite=Lax plus the CSRF header check below for mutations. */
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config().NODE_ENV === "production",
    maxAge: config().SESSION_HOURS * 3600 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw new HttpError(401, "Please sign in");
  req.user = user;
  next();
}

/**
 * Cookie-based sessions need CSRF protection: browsers only add custom headers to same-origin
 * requests (or after a CORS preflight we control), so requiring one on writes blocks cross-site forms.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Kompass-Client") !== "web") throw new HttpError(403, "Missing X-Kompass-Client header");
  next();
}

export function hasRole(user: SessionUser | undefined, ...roles: Role[]) {
  return !!user && (user.roles.includes("ADMIN") || roles.some((r) => user.roles.includes(r)));
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!hasRole(req.user, ...roles)) throw forbidden();
    next();
  };

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, "Please sign in");
  return req.user;
}
