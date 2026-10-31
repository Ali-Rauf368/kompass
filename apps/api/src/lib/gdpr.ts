import { AuditEvent, Notification, TicketActivity } from "../db/mongo";
import { prisma } from "../db/prisma";
import { HttpError, notFound } from "./errors";

/** Everything Kompass stores about an employee (GDPR Art. 15 / Art. 20, machine-readable). */
export async function exportEmployeeData(employeeId: number) {
  const db = prisma();
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { company: { select: { name: true } }, department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true } } },
  });
  if (!employee) throw notFound("Employee");
  const [user, leave, deals, tickets] = await Promise.all([
    db.user.findUnique({ where: { username: employee.username } }),
    db.leaveRequest.findMany({ where: { employeeId }, orderBy: { startDate: "desc" } }),
    db.deal.findMany({ where: { ownerId: employeeId }, select: { id: true, title: true, stage: true, createdAt: true } }),
    db.ticket.findMany({ where: { assigneeId: employeeId }, select: { id: true, number: true, subject: true, status: true, createdAt: true } }),
  ]);
  const [auditAsActor, auditAboutThem, comments, notifications] = await Promise.all([
    AuditEvent.find({ actor: employee.username }).sort({ at: -1 }).limit(1000).lean(),
    AuditEvent.find({ entityType: "employee", entityId: String(employeeId) }).sort({ at: -1 }).limit(1000).lean(),
    TicketActivity.find({ author: employee.username }).lean(),
    Notification.find({ username: employee.username }).lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    legalBasis: "Art. 6(1)(b) GDPR and § 26 BDSG (employment relationship)",
    controller: "Rheinwerk Gruppe, Köln",
    employee,
    account: user,
    leaveRequests: leave,
    assignedWork: { deals, tickets },
    activity: { auditAsActor, auditAboutThem, ticketComments: comments, notifications },
  };
}

/**
 * Right to erasure (Art. 17) for people who have left. Business records (invoices, tickets, deals)
 * must be kept for commercial/tax retention periods, so the person is pseudonymised instead of
 * deleted: identifying fields are overwritten and free-text notes removed. Irreversible.
 */
export async function pseudonymizeEmployee(employeeId: number, actor: string) {
  const db = prisma();
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw notFound("Employee");
  if (employee.status !== "LEFT") throw new HttpError(409, "Only employees who have left the company can be erased");
  if (employee.pseudonymizedAt) throw new HttpError(409, "This employee has already been erased");

  const alias = `former-${employeeId}`;
  await db.$transaction([
    db.employee.update({
      where: { id: employeeId },
      data: { firstName: "Former", lastName: `employee #${employeeId}`, email: `${alias}@deleted.invalid`, phone: null, username: alias, pseudonymizedAt: new Date() },
    }),
    db.leaveRequest.updateMany({ where: { employeeId }, data: { note: null } }),
    db.user.deleteMany({ where: { username: employee.username } }),
  ]);
  await Promise.all([
    TicketActivity.updateMany({ author: employee.username }, { author: alias, authorName: `Former employee #${employeeId}` }),
    Notification.deleteMany({ username: employee.username }),
    AuditEvent.updateMany({ actor: employee.username }, { actor: alias }),
  ]);
  await AuditEvent.create({ actor, action: "gdpr.erased", entityType: "employee", entityId: String(employeeId), personalData: true });
  return { employeeId, alias };
}

/**
 * Retention policy (run nightly):
 * - leave records of former employees older than LEAVE_RETENTION_YEARS are deleted
 * - former employees who left more than LEAVE_RETENTION_YEARS ago are pseudonymised
 * Audit events and notifications expire via MongoDB TTL indexes.
 */
export async function applyRetention(years: number, actor = "retention-job") {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const db = prisma();
  const { count: leaveDeleted } = await db.leaveRequest.deleteMany({ where: { endDate: { lt: cutoff }, employee: { status: "LEFT" } } });
  const due = await db.employee.findMany({ where: { status: "LEFT", pseudonymizedAt: null, exitDate: { lt: cutoff } }, select: { id: true } });
  for (const e of due) await pseudonymizeEmployee(e.id, actor);
  return { leaveDeleted, employeesPseudonymized: due.length, cutoff: cutoff.toISOString().slice(0, 10) };
}
