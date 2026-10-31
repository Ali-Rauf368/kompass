import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/session";
import { prisma } from "../db/prisma";
import { refreshWarehouse } from "../analytics/warehouse";
import { publish } from "../realtime/hub";
import { audit } from "../lib/audit";

const router = Router();

interface MonthRow {
  month_start: Date;
  invoiced_eur: string;
  deals_won: number;
  deals_lost: number;
  won_value_eur: string;
  avg_days_to_close: string | null;
  tickets_created: number;
  sla_rate: string | null;
  avg_resolution_hours: string | null;
  avg_first_response_minutes: string | null;
  absence_days: number;
  sick_days: number;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const sum = (rows: MonthRow[], k: keyof MonthRow) => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);
/** Ticket-weighted average so busy months count more than quiet ones. */
const weighted = (rows: MonthRow[], k: keyof MonthRow) => {
  const w = rows.filter((r) => r[k] !== null && r.tickets_created > 0);
  const total = w.reduce((n, r) => n + r.tickets_created, 0);
  return total ? w.reduce((n, r) => n + Number(r[k]) * r.tickets_created, 0) / total : null;
};

function summarize(rows: MonthRow[]) {
  const won = sum(rows, "deals_won"), lost = sum(rows, "deals_lost");
  const closed = rows.filter((r) => r.avg_days_to_close !== null && r.deals_won > 0);
  return {
    invoicedEur: sum(rows, "invoiced_eur"),
    wonValueEur: sum(rows, "won_value_eur"),
    dealsWon: won,
    winRate: ratio(won, won + lost),
    avgDaysToClose: closed.length ? closed.reduce((n, r) => n + Number(r.avg_days_to_close) * r.deals_won, 0) / closed.reduce((n, r) => n + r.deals_won, 0) : null,
    ticketsCreated: sum(rows, "tickets_created"),
    slaRate: weighted(rows, "sla_rate"),
    avgResolutionHours: weighted(rows, "avg_resolution_hours"),
    avgFirstResponseMinutes: weighted(rows, "avg_first_response_minutes"),
    absenceDays: sum(rows, "absence_days"),
    sickDays: sum(rows, "sick_days"),
  };
}

const overviewQuery = z.object({ company: z.string().regex(/^[A-Z]{3}$/).optional(), months: z.coerce.number().int().min(1).max(12).default(6) });

/**
 * Dashboard data: period KPIs from the monthly mart (current vs previous period), live operational
 * numbers, and monthly series for charts. All filtered by company when given.
 */
router.get("/overview", async (req, res) => {
  const { company, months } = overviewQuery.parse(req.query);
  const db = prisma();
  const companyKey = company ? (await db.company.findUnique({ where: { code: company } }))?.id ?? -1 : null;

  const monthly = await db.$queryRaw<MonthRow[]>`
    SELECT month_start, sum(invoiced_eur) AS invoiced_eur, sum(deals_won)::int AS deals_won, sum(deals_lost)::int AS deals_lost,
           sum(won_value_eur) AS won_value_eur,
           sum(avg_days_to_close * deals_won) / nullif(sum(deals_won) FILTER (WHERE avg_days_to_close IS NOT NULL), 0) AS avg_days_to_close,
           sum(tickets_created)::int AS tickets_created,
           sum(sla_rate * tickets_created) / nullif(sum(tickets_created) FILTER (WHERE sla_rate IS NOT NULL), 0) AS sla_rate,
           sum(avg_resolution_hours * tickets_created) / nullif(sum(tickets_created) FILTER (WHERE avg_resolution_hours IS NOT NULL), 0) AS avg_resolution_hours,
           sum(avg_first_response_minutes * tickets_created) / nullif(sum(tickets_created) FILTER (WHERE avg_first_response_minutes IS NOT NULL), 0) AS avg_first_response_minutes,
           sum(absence_days)::int AS absence_days, sum(sick_days)::int AS sick_days
    FROM analytics.mv_kpi_monthly
    WHERE (${companyKey}::int IS NULL OR company_key = ${companyKey}::int)
    GROUP BY month_start ORDER BY month_start`;

  const current = monthly.slice(-months);
  const previous = monthly.slice(-2 * months, -months);

  const [live] = await db.$queryRaw<
    { pipeline_eur: string; weighted_pipeline_eur: string; open_tickets: bigint; breached_tickets: bigint; open_ar_eur: string; overdue_ar_eur: string; invoiced_90d_eur: string; headcount: bigint }[]
  >`
    SELECT
      (SELECT coalesce(sum("valueCents"), 0) / 100.0 FROM "Deal" WHERE stage NOT IN ('WON','LOST') AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS pipeline_eur,
      (SELECT coalesce(sum("valueCents" * probability), 0) / 10000.0 FROM "Deal" WHERE stage NOT IN ('WON','LOST') AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS weighted_pipeline_eur,
      (SELECT count(*) FROM "Ticket" WHERE status IN ('OPEN','IN_PROGRESS','WAITING') AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS open_tickets,
      (SELECT count(*) FROM "Ticket" WHERE status IN ('OPEN','IN_PROGRESS','WAITING') AND "slaDueAt" < now() AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS breached_tickets,
      (SELECT coalesce(sum("amountCents"), 0) / 100.0 FROM "Invoice" WHERE status = 'OPEN' AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS open_ar_eur,
      (SELECT coalesce(sum("amountCents"), 0) / 100.0 FROM "Invoice" WHERE status = 'OPEN' AND "dueDate" < current_date AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS overdue_ar_eur,
      (SELECT coalesce(sum("amountCents"), 0) / 100.0 FROM "Invoice" WHERE status <> 'CANCELLED' AND "issueDate" >= current_date - 90 AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS invoiced_90d_eur,
      (SELECT count(*) FROM "Employee" WHERE status <> 'LEFT' AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)) AS headcount`;

  const headcount = Number(live!.headcount);
  // ~21 working days per month: absence rate = absent days / possible working days
  const absenceRate = (rows: MonthRow[]) => ratio(sum(rows, "absence_days"), headcount * 21 * rows.length);

  const [pipeline, ticketsByPriority, etl] = await Promise.all([
    db.$queryRaw<{ stage: string; count: bigint; value_eur: string }[]>`
      SELECT stage::text, count(*), sum("valueCents") / 100.0 AS value_eur FROM "Deal"
      WHERE stage NOT IN ('WON','LOST') AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)
      GROUP BY stage ORDER BY array_position(ARRAY['LEAD','QUALIFIED','PROPOSAL','NEGOTIATION'], stage::text)`,
    db.$queryRaw<{ priority: string; count: bigint }[]>`
      SELECT priority::text, count(*) FROM "Ticket" WHERE status IN ('OPEN','IN_PROGRESS','WAITING') AND (${companyKey}::int IS NULL OR "companyId" = ${companyKey}::int)
      GROUP BY priority ORDER BY array_position(ARRAY['URGENT','HIGH','MEDIUM','LOW'], priority::text)`,
    db.$queryRaw<{ finished_at: Date | null }[]>`SELECT finished_at FROM analytics.etl_log WHERE error IS NULL AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`,
  ]);

  const openAr = Number(live!.open_ar_eur), invoiced90 = Number(live!.invoiced_90d_eur);
  res.json({
    filters: { company: company ?? null, months },
    period: { current: { ...summarize(current), absenceRate: absenceRate(current) }, previous: previous.length ? { ...summarize(previous), absenceRate: absenceRate(previous) } : null },
    live: {
      pipelineEur: Number(live!.pipeline_eur),
      weightedPipelineEur: Number(live!.weighted_pipeline_eur),
      openTickets: Number(live!.open_tickets),
      breachedTickets: Number(live!.breached_tickets),
      openReceivablesEur: openAr,
      overdueReceivablesEur: Number(live!.overdue_ar_eur),
      // Days sales outstanding over a 90-day window
      dso: invoiced90 > 0 ? Math.round((openAr / invoiced90) * 90) : null,
      headcount,
    },
    monthly: monthly.slice(-12).map((m) => ({
      month: m.month_start.toISOString().slice(0, 7),
      invoicedEur: Number(m.invoiced_eur),
      wonValueEur: Number(m.won_value_eur),
      dealsWon: m.deals_won,
      dealsLost: m.deals_lost,
      ticketsCreated: m.tickets_created,
      slaRate: num(m.sla_rate),
      avgResolutionHours: num(m.avg_resolution_hours),
      absenceDays: m.absence_days,
      sickDays: m.sick_days,
    })),
    pipelineByStage: pipeline.map((p) => ({ stage: p.stage, count: Number(p.count), valueEur: Number(p.value_eur) })),
    openTicketsByPriority: ticketsByPriority.map((t) => ({ priority: t.priority, count: Number(t.count) })),
    refreshedAt: etl[0]?.finished_at ?? null,
  });
});

/** Absence by department for the HR view (from the star schema, SCD2-correct attribution). */
router.get("/absence-by-department", requireRole("HR", "MANAGER"), async (req, res) => {
  const { months } = z.object({ months: z.coerce.number().int().min(1).max(24).default(12) }).parse(req.query);
  const rows = await prisma().$queryRaw<{ department: string; leave_type: string; days: bigint }[]>`
    SELECT e.department, f.leave_type, count(*) AS days
    FROM analytics.fact_absence_day f
    JOIN analytics.dim_employee e ON e.employee_key = f.employee_key
    JOIN analytics.dim_date d ON d.date_key = f.date_key
    WHERE d.full_date >= date_trunc('month', current_date) - make_interval(months => ${months} - 1) AND d.full_date <= current_date
    GROUP BY 1, 2 ORDER BY 1`;
  const departments = [...new Set(rows.map((r) => r.department))];
  res.json({
    rows: departments.map((department) => ({
      department,
      ...Object.fromEntries(rows.filter((r) => r.department === department).map((r) => [r.leave_type, Number(r.days)])),
    })),
  });
});

router.get("/etl", requireRole("ADMIN"), async (_req, res) => {
  const runs = await prisma().$queryRaw<unknown[]>`SELECT id, started_at, finished_at, rows_loaded, error FROM analytics.etl_log ORDER BY id DESC LIMIT 20`;
  res.json({ runs });
});

router.post("/refresh", requireRole("ADMIN"), async (req, res) => {
  const result = await refreshWarehouse();
  await audit(req, { action: "analytics.refreshed", entityType: "warehouse", details: result.rows });
  publish({ all: true }, { type: "kpis.changed" });
  res.json(result);
});

export default router;
