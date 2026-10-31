import { refreshWarehouse } from "../analytics/warehouse";
import { AuditEvent, Notification, RawIngest, TicketActivity } from "../db/mongo";
import { prisma, type Prisma } from "../db/prisma";
import { workingDaysBetween } from "../lib/dates";
import { COMPANIES, CUSTOMER_NAMES, DEAL_TOPICS, DEPARTMENTS, demoEmployees, PLACES, rng, STREETS, TICKET_SUBJECTS } from "./demo-data";

const DAY = 86_400_000;
const SLA_HOURS = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 } as const;

/**
 * Replaces all data with the demo dataset. `now` is injectable so tests get stable relative dates.
 * Returns counts for logging.
 */
export async function seedDatabase(opts: { now?: Date; withMongo?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ago = (days: number) => new Date(today.getTime() - days * DAY);
  const r = rng(42);
  const db = prisma();

  await db.$executeRawUnsafe(
    `TRUNCATE "IngestionRun", "Invoice", "Ticket", "Deal", "Customer", "LeaveRequest", "User", "Employee", "Department", "Company" RESTART IDENTITY CASCADE`,
  );
  await db.$executeRawUnsafe(`DO $$ BEGIN IF to_regclass('analytics.dim_employee') IS NOT NULL THEN
    TRUNCATE analytics.fact_deal, analytics.fact_ticket, analytics.fact_invoice, analytics.fact_absence_day, analytics.dim_employee, analytics.dim_customer RESTART IDENTITY CASCADE; END IF; END $$`);

  await db.company.createMany({ data: COMPANIES.map((c) => ({ ...c })) });
  await db.department.createMany({ data: DEPARTMENTS.map((d) => ({ ...d })) });
  const companyId = Object.fromEntries((await db.company.findMany()).map((c) => [c.code, c.id]));
  const departmentId = Object.fromEntries((await db.department.findMany()).map((d) => [d.code, d.id]));

  // Employees: insert without managers first, then link managers by username.
  const people = demoEmployees();
  await db.employee.createMany({
    data: people.map((p) => ({
      personnelNo: p.personnelNo,
      firstName: p.firstName,
      lastName: p.lastName,
      username: p.username,
      email: `${p.username}@rheinwerk.de`,
      phone: `+49 221 ${r.int(100000, 999999)}`,
      jobTitle: p.jobTitle,
      hireDate: new Date(`${p.hireDate}T00:00:00Z`),
      companyId: companyId[p.company]!,
      departmentId: departmentId[p.department]!,
    })),
  });
  const employees = await db.employee.findMany();
  const byUsername = new Map(employees.map((e) => [e.username, e]));
  for (const p of people) {
    if (p.managerUsername) await db.employee.update({ where: { username: p.username }, data: { managerId: byUsername.get(p.managerUsername)!.id } });
  }
  // One former employee to exercise "LEFT" status and GDPR retention.
  const leaver = employees[employees.length - 1]!;
  await db.employee.update({ where: { id: leaver.id }, data: { status: "LEFT", exitDate: ago(200) } });

  const inDept = (code: string) => employees.filter((e) => e.departmentId === departmentId[code] && e.id !== leaver.id);
  const sales = inDept("SALES");
  const service = [...inDept("AFTERSALES"), ...inDept("FIELD")];

  // Customers
  const customers: Prisma.CustomerCreateManyInput[] = [];
  for (let i = 0; i < 160; i++) {
    const segment = i % 10 < 7 ? "PRIVATE" : i % 10 < 9 ? "BUSINESS" : "PUBLIC_SECTOR";
    const [postalCode, city] = r.pick(PLACES);
    const name =
      segment === "PRIVATE"
        ? `${r.pick(["Familie", "Herr", "Frau"])} ${r.pick(["Bauer", "Peters", "Lindner", "Arslan", "Hahn", "Busch", "Sommer", "Engel", "Otto", "Kuhn", "Pohl", "Brandt", "Graf", "Franke", "Beck"])}`
        : segment === "BUSINESS"
          ? `${r.pick(CUSTOMER_NAMES.business)}${i > 20 ? ` ${city}` : ""}`
          : r.pick(CUSTOMER_NAMES.public);
    customers.push({
      number: `K-${String(20001 + i)}`,
      name,
      segment,
      email: `kunde${20001 + i}@example.org`,
      phone: `+49 ${r.pick(["221", "214", "2202"])} ${r.int(100000, 999999)}`,
      street: `${r.pick(STREETS)} ${r.int(1, 180)}`,
      postalCode,
      city,
      source: i % 3 === 0 ? "crm" : "manual",
      createdAt: ago(r.int(30, 900)),
    });
  }
  await db.customer.createMany({ data: customers });
  const customerRows = await db.customer.findMany();

  // Deals over the last 24 months; older deals are mostly closed.
  const deals: Prisma.DealCreateManyInput[] = [];
  for (let i = 0; i < 260; i++) {
    const company = r.pick(["RWH", "RWS", "RWE"] as const);
    const age = r.int(1, 720);
    const created = ago(age);
    const closed = age > 45 || r.chance(0.25);
    const won = closed && r.chance(company === "RWS" ? 0.42 : 0.35);
    const stage = closed ? (won ? "WON" : "LOST") : r.pick(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const);
    const closedAt = closed ? new Date(Math.min(created.getTime() + r.int(7, 75) * DAY, today.getTime())) : null;
    const base = { RWH: [6_000, 35_000], RWS: [9_000, 48_000], RWE: [1_500, 22_000] }[company];
    deals.push({
      title: r.pick(DEAL_TOPICS[company]!),
      stage,
      valueCents: r.int(base[0]!, base[1]!) * 100,
      probability: { LEAD: 10, QUALIFIED: 30, PROPOSAL: 50, NEGOTIATION: 75, WON: 100, LOST: 0 }[stage],
      expectedClose: new Date(created.getTime() + r.int(20, 90) * DAY),
      closedAt,
      lostReason: stage === "LOST" ? r.pick(["Price", "Chose competitor", "Project postponed", "No subsidy approved", "No response"]) : null,
      customerId: r.pick(customerRows).id,
      ownerId: r.pick(sales.filter((s) => s.companyId === companyId[company]).length ? sales.filter((s) => s.companyId === companyId[company]) : sales).id,
      companyId: companyId[company]!,
      createdAt: created,
    });
  }
  await db.deal.createMany({ data: deals });
  const wonDeals = await db.deal.findMany({ where: { stage: "WON" } });

  // Invoices: one per won deal (sometimes split), plus small service invoices.
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  let invNo = 1;
  const addInvoice = (amountCents: number, issue: Date, customerId: number, company: number, dealId: number | null, source: string) => {
    const due = new Date(issue.getTime() + 14 * DAY);
    const ageDays = (today.getTime() - issue.getTime()) / DAY;
    const paid = ageDays > 10 && r.chance(ageDays > 60 ? 0.96 : 0.7);
    const paidAt = paid ? new Date(Math.min(issue.getTime() + r.int(3, 48) * DAY, today.getTime())) : null;
    invoices.push({
      number: `RE-${issue.getUTCFullYear()}-${String(invNo++).padStart(5, "0")}`,
      status: paid ? "PAID" : r.chance(0.03) ? "CANCELLED" : "OPEN",
      amountCents,
      issueDate: issue,
      dueDate: due,
      paidAt,
      customerId,
      companyId: company,
      dealId,
      source,
    });
  };
  for (const d of wonDeals) {
    const issue = new Date(d.closedAt!.getTime() + r.int(5, 30) * DAY);
    if (issue > today) continue;
    if (d.valueCents > 2_000_000 && r.chance(0.5)) {
      addInvoice(Math.round(d.valueCents * 0.3), issue, d.customerId, d.companyId, d.id, "erp");
      const second = new Date(issue.getTime() + 30 * DAY);
      if (second <= today) addInvoice(d.valueCents - Math.round(d.valueCents * 0.3), second, d.customerId, d.companyId, d.id, "erp");
    } else addInvoice(d.valueCents, issue, d.customerId, d.companyId, d.id, "erp");
  }
  for (let i = 0; i < 140; i++) addInvoice(r.int(89, 650) * 100, ago(r.int(1, 700)), r.pick(customerRows).id, companyId.RWK!, null, i % 2 ? "erp" : "manual");
  await db.invoice.createMany({ data: invoices });

  // Service tickets with SLA by priority.
  const tickets: Prisma.TicketCreateManyInput[] = [];
  for (let i = 0; i < 420; i++) {
    const priority = r.pick(["LOW", "MEDIUM", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "URGENT"] as const);
    const ageHours = i < 18 ? r.int(1, 60) : r.int(24, 700 * 24);
    const created = new Date(now.getTime() - ageHours * 3_600_000);
    const sla = new Date(created.getTime() + SLA_HOURS[priority] * 3_600_000);
    // Everything older than a month is finished; a few tickets from the last weeks are still open (some overdue).
    const done = ageHours > 24 * 30 ? true : ageHours > 24 * 5 ? r.chance(0.9) : r.chance(0.35);
    const resolveHours = SLA_HOURS[priority] * (r.chance(0.86) ? r.next() * 0.9 + 0.05 : 1 + r.next());
    const resolvedAt = done ? new Date(Math.min(created.getTime() + resolveHours * 3_600_000, now.getTime() - 60_000)) : null;
    const status = done ? (r.chance(0.8) ? "CLOSED" : "RESOLVED") : r.pick(["OPEN", "IN_PROGRESS", "IN_PROGRESS", "WAITING"] as const);
    tickets.push({
      number: `SR-${String(30001 + i)}`,
      subject: r.pick(TICKET_SUBJECTS),
      description: "Customer reported the issue by phone. Details noted in the activity log.",
      priority,
      status,
      channel: r.pick(["PHONE", "PHONE", "EMAIL", "PORTAL", "TECHNICIAN"] as const),
      slaDueAt: sla,
      firstResponseAt: status === "OPEN" && !done ? null : new Date(created.getTime() + r.int(5, Math.min(SLA_HOURS[priority] * 20, 600)) * 60_000),
      resolvedAt,
      customerId: r.pick(customerRows).id,
      assigneeId: status === "OPEN" && r.chance(0.5) ? null : r.pick(service).id,
      companyId: r.chance(0.8) ? companyId.RWK! : r.pick([companyId.RWH!, companyId.RWS!, companyId.RWE!]),
      createdAt: created,
    });
  }
  await db.ticket.createMany({ data: tickets });

  // Leave: vacations + sick days spread over two years, a few pending requests in the near future.
  const leaves: Prisma.LeaveRequestCreateManyInput[] = [];
  for (const e of employees) {
    if (e.id === leaver.id) continue;
    const manager = e.managerId;
    for (let k = 0; k < r.int(3, 6); k++) {
      const type = r.chance(0.72) ? "VACATION" : r.chance(0.8) ? "SICK" : "TRAINING";
      const startOffset = r.int(-700, 120);
      const start = new Date(today.getTime() + startOffset * DAY);
      const end = new Date(start.getTime() + (type === "VACATION" ? r.int(2, 13) : r.int(0, 4)) * DAY);
      const future = startOffset > 7;
      const status = type === "SICK" ? "APPROVED" : future && r.chance(0.45) ? "PENDING" : r.chance(0.94) ? "APPROVED" : "REJECTED";
      leaves.push({
        employeeId: e.id,
        type,
        startDate: start,
        endDate: end,
        workingDays: workingDaysBetween(start, end),
        status,
        approverId: status === "PENDING" ? null : manager,
        decidedAt: status === "PENDING" ? null : new Date(start.getTime() - r.int(3, 30) * DAY),
        note: type === "TRAINING" ? "Manufacturer certification" : null,
        createdAt: new Date(start.getTime() - r.int(5, 60) * DAY),
      });
    }
  }
  await db.leaveRequest.createMany({ data: leaves.filter((l) => l.workingDays > 0) });

  // A history of NiFi deliveries for the pipelines page.
  const runs: Prisma.IngestionRunCreateManyInput[] = [];
  for (let d = 13; d >= 0; d--) {
    for (const [pipeline, base] of [["erp-invoices", 30], ["crm-customers", 12]] as const) {
      const received = base + r.int(0, 15);
      const rejected = r.chance(0.2) ? r.int(1, 3) : 0;
      const started = new Date(today.getTime() - d * DAY + (pipeline === "erp-invoices" ? 2 : 3) * 3_600_000);
      runs.push({ pipeline, batchId: `${pipeline}-${started.toISOString().slice(0, 10)}`, status: rejected ? "PARTIAL" : "SUCCEEDED", received, inserted: Math.round((received - rejected) * 0.3), updated: received - rejected - Math.round((received - rejected) * 0.3), rejected, errors: rejected ? [{ record: 3, message: "customerNumber K-99999 not found" }] : [], startedAt: started, finishedAt: new Date(started.getTime() + r.int(400, 2500)) });
    }
  }
  await db.ingestionRun.createMany({ data: runs });

  if (opts.withMongo !== false) {
    await Promise.all([AuditEvent.deleteMany({}), Notification.deleteMany({}), TicketActivity.deleteMany({}), RawIngest.deleteMany({})]);
    const recent = await db.ticket.findMany({ include: { assignee: true } });
    const activities = recent.flatMap((t) => {
      const items: Record<string, unknown>[] = [{ ticketId: t.id, kind: "created", author: "system", authorName: "Kompass", body: `Ticket opened via ${t.channel.toLowerCase()}`, at: t.createdAt }];
      if (t.firstResponseAt && t.assignee) {
        items.push({ ticketId: t.id, kind: "comment", author: t.assignee.username, authorName: `${t.assignee.firstName} ${t.assignee.lastName}`, body: r.pick(["Called the customer, appointment scheduled.", "Asked customer for photos of the error display.", "Spare part ordered, ETA 2 days.", "Remote diagnosis done, technician needed on site."]), at: t.firstResponseAt });
      }
      if (t.resolvedAt && t.assignee) items.push({ ticketId: t.id, kind: "status", author: t.assignee.username, authorName: `${t.assignee.firstName} ${t.assignee.lastName}`, from: "IN_PROGRESS", to: "RESOLVED", at: t.resolvedAt });
      return items;
    });
    await TicketActivity.insertMany(activities);
    await Notification.insertMany([
      { username: "jonas.weber", kind: "leave", title: "New leave requests to review", body: "Several team members are waiting for a decision.", link: "/hr/leave?view=approvals", createdAt: ago(0) },
      { username: "murat.yilmaz", kind: "ticket", title: "Urgent ticket close to SLA breach", link: "/after-sales/tickets?priority=URGENT", createdAt: ago(0) },
      { username: "sophie.becker", kind: "invoice", title: "Overdue receivables increased this week", link: "/accounting/invoices?status=OVERDUE", createdAt: ago(1) },
    ]);
  }

  await refreshWarehouse();
  return { employees: employees.length, customers: customerRows.length, deals: deals.length, invoices: invoices.length, tickets: tickets.length, leaves: leaves.length };
}
