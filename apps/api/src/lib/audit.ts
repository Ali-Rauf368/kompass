import type { Request } from "express";
import { AuditEvent, Notification } from "../db/mongo";
import { publish } from "../realtime/hub";

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | number;
  personalData?: boolean;
  details?: Record<string, unknown>;
}

/** Records an audit event. Never lets a logging failure break the user's request. */
export async function audit(req: Request | { actor: string; ip?: string }, input: AuditInput) {
  const actor = "actor" in req ? req.actor : (req.user?.username ?? "anonymous");
  const ip = "actor" in req ? req.ip : req.ip;
  try {
    await AuditEvent.create({ ...input, entityId: input.entityId?.toString(), actor, ip });
  } catch (err) {
    console.error("audit write failed", err);
  }
}

/** Stores a notification for a user and pushes it over the WebSocket if they're online. */
export async function notify(username: string, n: { kind: string; title: string; body?: string; link?: string }) {
  const doc = await Notification.create({ username, ...n });
  publish({ usernames: [username] }, { type: "notification", id: String(doc._id), title: n.title, body: n.body, link: n.link });
}
