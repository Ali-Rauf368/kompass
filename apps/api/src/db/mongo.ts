import mongoose, { Schema, model, type InferSchemaType } from "mongoose";
import { config } from "../config";

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config().MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([AuditEvent.syncIndexes(), Notification.syncIndexes(), TicketActivity.syncIndexes(), RawIngest.syncIndexes()]);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

const days = (n: number) => n * 24 * 60 * 60;

/**
 * Who did what to which record. Kept in MongoDB because the shape of `details` varies per action
 * and the log is append-only. Expires automatically after AUDIT_RETENTION_DAYS (GDPR storage limitation).
 */
const auditSchema = new Schema(
  {
    actor: { type: String, required: true, index: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String },
    /** True when the action touched personal data (e.g. viewing an employee record). */
    personalData: { type: Boolean, default: false },
    ip: { type: String },
    details: { type: Schema.Types.Mixed },
    at: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
auditSchema.index({ entityType: 1, entityId: 1, at: -1 });
auditSchema.index({ at: 1 }, { expireAfterSeconds: days(Number(process.env.AUDIT_RETENTION_DAYS ?? 400)) });
export const AuditEvent = model("AuditEvent", auditSchema);
export type AuditEventDoc = InferSchemaType<typeof auditSchema>;

const notificationSchema = new Schema(
  {
    username: { type: String, required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    link: { type: String },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
notificationSchema.index({ username: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: days(90) });
export const Notification = model("Notification", notificationSchema);

/** Comments and status changes on a service ticket: a free-form, ever-growing feed. */
const ticketActivitySchema = new Schema(
  {
    ticketId: { type: Number, required: true },
    kind: { type: String, enum: ["comment", "status", "assignment", "created"], required: true },
    author: { type: String, required: true },
    authorName: { type: String, required: true },
    body: { type: String },
    from: { type: String },
    to: { type: String },
    internal: { type: Boolean, default: false },
    at: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
ticketActivitySchema.index({ ticketId: 1, at: 1 });
export const TicketActivity = model("TicketActivity", ticketActivitySchema);

/** Raw NiFi payloads as received, for replay and debugging. Kept for 30 days only. */
const rawIngestSchema = new Schema(
  {
    pipeline: { type: String, required: true },
    batchId: { type: String, required: true },
    records: { type: [Schema.Types.Mixed], default: [] },
    receivedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
rawIngestSchema.index({ pipeline: 1, batchId: 1 });
rawIngestSchema.index({ receivedAt: 1 }, { expireAfterSeconds: days(30) });
export const RawIngest = model("RawIngest", rawIngestSchema);
