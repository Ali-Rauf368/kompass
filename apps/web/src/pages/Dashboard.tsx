import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WelcomeIllustration } from "../components/Illustrations";
import { KpiCard } from "../components/KpiCard";
import { Card, ErrorState, FilterSelect, PageHeader, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatEur, formatMonth, formatNumber, formatPercent } from "../lib/format";
import { useApi, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useLiveEvent } from "../lib/live";

interface Period {
  invoicedEur: number;
  wonValueEur: number;
  dealsWon: number;
  winRate: number | null;
  avgDaysToClose: number | null;
  ticketsCreated: number;
  slaRate: number | null;
  avgResolutionHours: number | null;
  absenceRate: number | null;
  absenceDays: number;
}
export interface Overview {
  period: { current: Period; previous: Period | null };
  live: { pipelineEur: number; weightedPipelineEur: number; openTickets: number; breachedTickets: number; openReceivablesEur: number; overdueReceivablesEur: number; dso: number | null; headcount: number };
  monthly: { month: string; invoicedEur: number; wonValueEur: number; dealsWon: number; ticketsCreated: number; slaRate: number | null; absenceDays: number; sickDays: number }[];
  pipelineByStage: { stage: string; count: number; valueEur: number }[];
  openTicketsByPriority: { priority: string; count: number }[];
  refreshedAt: string | null;
}

const COMPANIES = [["RWH", "Rheinwerk Haustechnik"], ["RWS", "Rheinwerk Solar"], ["RWE", "Rheinwerk Elektro"], ["RWK", "Rheinwerk Kundenservice"]] as const;
const C = { accent: "var(--accent)", accent2: "#5fc4b4", amber: "#c98a1b", red: "#b4372f", grid: "var(--line)", axis: "var(--ink-3)" };
const PRIORITY_COLOR: Record<string, string> = { URGENT: "#b4372f", HIGH: "#c98a1b", MEDIUM: "#5bb5a6", LOW: "#9fb3b0" };

/** Each chart ships a table version for screen readers and people who prefer numbers. */
function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  const { t } = useI18n();
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-ink-3 hover:text-ink">{t("dash.tableView")}</summary>
      <table className="mt-2 w-full">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col" className="py-1 text-start font-medium text-ink-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 tabular">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

export function DashboardPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  usePageTitle(t("dash.title"));
  const [company, setCompany] = useState("");
  const [months, setMonths] = useState(6);
  const { data, error, loading, reload } = useApi<Overview>(`/analytics/overview?months=${months}${company ? `&company=${company}` : ""}`);
  useLiveEvent(["kpis.changed"], reload);

  const cur = data?.period.current;
  const prev = data?.period.previous;
  const eur = (v: number) => formatEur(v, lang, { compact: v >= 100_000 });
  const tooltipStyle = { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-pop)", color: "var(--ink)" };

  return (
    <>
      <PageHeader
        title={t("dash.greeting", { name: user?.displayName.split(" ")[0] ?? "" })}
        subtitle={data?.refreshedAt ? <span className="inline-flex items-center gap-1.5"><RefreshCw className="size-3.5" aria-hidden /> {t("dash.refreshed", { time: formatDateTime(data.refreshedAt, lang) })}</span> : undefined}
        actions={
          <>
            <FilterSelect label={t("common.company")} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">{t("common.allCompanies")}</option>
              {COMPANIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </FilterSelect>
            <FilterSelect label={t("dash.period")} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[3, 6, 12].map((n) => <option key={n} value={n}>{t("dash.months", { n })}</option>)}
            </FilterSelect>
          </>
        }
      />
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b5f57] via-[#0d7a6f] to-[#14a08f] p-5 text-white shadow-card sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-20 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-white/80">{new Date().toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{t("dash.welcome.body")}</p>
            {data && (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">{t("dash.pipeline")}: <b className="tabular">{eur(data.live.pipelineEur)}</b></span>
                <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">{t("dash.openTickets")}: <b className="tabular">{formatNumber(data.live.openTickets, lang)}</b></span>
              </div>
            )}
          </div>
          <WelcomeIllustration className="hidden h-32 shrink-0 sm:block" />
        </div>
      </section>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!data && loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:h-32">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : data && cur ? (
        <div className={loading ? "opacity-70 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <section aria-label="KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={t("dash.revenue")} value={eur(cur.invoicedEur)} current={cur.invoicedEur} previous={prev?.invoicedEur} />
            <KpiCard label={t("dash.winRate")} value={cur.winRate === null ? "—" : formatPercent(cur.winRate, lang)} current={cur.winRate} previous={prev?.winRate} mode="points" sub={`${cur.dealsWon} ${t("stage.WON").toLowerCase()}`} />
            <KpiCard label={t("dash.pipeline")} value={eur(data.live.pipelineEur)} sub={t("dash.weighted", { value: eur(data.live.weightedPipelineEur) })} />
            <KpiCard label={t("dash.sla")} value={cur.slaRate === null ? "—" : formatPercent(cur.slaRate, lang, 1)} current={cur.slaRate} previous={prev?.slaRate} mode="points" sub={`Ø ${formatNumber(cur.avgResolutionHours ?? 0, lang, 1)} h`} />
            <KpiCard label={t("dash.openTickets")} value={formatNumber(data.live.openTickets, lang)} sub={<span className={data.live.breachedTickets ? "text-red-700 dark:text-red-400" : ""}>{t("dash.breached", { n: data.live.breachedTickets })}</span>} />
            <KpiCard label={t("dash.dso")} value={data.live.dso === null ? "—" : t("dash.days", { n: data.live.dso })} sub={t("dash.overdue", { value: eur(data.live.overdueReceivablesEur) })} />
            <KpiCard label={t("dash.absence")} value={cur.absenceRate === null ? "—" : formatPercent(cur.absenceRate, lang, 1)} current={cur.absenceRate} previous={prev?.absenceRate} goodWhen="down" mode="points" sub={t("dash.headcount", { n: data.live.headcount })} />
            <KpiCard label={t("dash.chart.won")} value={eur(cur.wonValueEur)} current={cur.wonValueEur} previous={prev?.wonValueEur} sub={cur.avgDaysToClose ? `Ø ${Math.round(cur.avgDaysToClose)} ${lang === "de" ? "Tage bis Abschluss" : "days to close"}` : undefined} />
          </section>

          <div className="mt-6 grid gap-4 sm:gap-6 xl:grid-cols-3">
            <Card title={t("dash.chart.revenue")} className="xl:col-span-2">
              <div className="h-64" role="img" aria-label={t("dash.chart.revenue")}>
                <ResponsiveContainer>
                  <ComposedChart data={data.monthly} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m, lang)} stroke={C.axis} fontSize={12} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => formatEur(v, lang, { compact: true })} stroke={C.axis} fontSize={12} width={64} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(Number(v), lang)} labelFormatter={(m) => formatMonth(String(m), lang)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="invoicedEur" name={t("dash.chart.invoiced")} stroke={C.accent} fill={C.accent} fillOpacity={0.1} strokeWidth={2.5} />
                    <Line type="monotone" dataKey="wonValueEur" name={t("dash.chart.won")} stroke={C.amber} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <ChartTable caption={t("dash.chart.revenue")} head={["", t("dash.chart.invoiced"), t("dash.chart.won")]} rows={data.monthly.map((m) => [formatMonth(m.month, lang), formatEur(m.invoicedEur, lang), formatEur(m.wonValueEur, lang)])} />
            </Card>
            <Card title={t("dash.chart.pipeline")}>
              <div className="h-64" role="img" aria-label={t("dash.chart.pipeline")}>
                <ResponsiveContainer>
                  <BarChart data={data.pipelineByStage.map((p) => ({ ...p, label: t(`stage.${p.stage}` as never) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tickFormatter={(v: number) => formatEur(v, lang, { compact: true })} stroke={C.axis} fontSize={11} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={90} stroke={C.axis} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEur(Number(v), lang)} cursor={{ fill: "var(--sunken)" }} />
                    <Bar dataKey="valueEur" name={t("dash.pipeline")} fill={C.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartTable caption={t("dash.chart.pipeline")} head={["", "#", "€"]} rows={data.pipelineByStage.map((p) => [t(`stage.${p.stage}` as never), p.count, formatEur(p.valueEur, lang)])} />
            </Card>
            <Card title={t("dash.chart.service")} className="xl:col-span-2">
              <div className="h-60" role="img" aria-label={t("dash.chart.service")}>
                <ResponsiveContainer>
                  <ComposedChart data={data.monthly} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m, lang)} stroke={C.axis} fontSize={12} tickLine={false} />
                    <YAxis yAxisId="n" stroke={C.axis} fontSize={12} width={40} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="p" orientation="right" domain={[0.5, 1]} tickFormatter={(v: number) => formatPercent(v, lang)} stroke={C.axis} fontSize={12} width={48} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => (name === t("dash.sla") ? formatPercent(Number(v), lang, 1) : v)} labelFormatter={(m) => formatMonth(String(m), lang)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="ticketsCreated" name={t("dash.chart.tickets")} fill={C.accent2} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="p" type="monotone" dataKey="slaRate" name={t("dash.sla")} stroke={C.red} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <ChartTable caption={t("dash.chart.service")} head={["", t("dash.chart.tickets"), t("dash.sla")]} rows={data.monthly.map((m) => [formatMonth(m.month, lang), m.ticketsCreated, m.slaRate === null ? "—" : formatPercent(m.slaRate, lang, 1)])} />
            </Card>
            <Card title={t("dash.chart.priority")}>
              <div className="relative mx-auto mb-4 h-40 max-w-[220px]" role="img" aria-label={t("dash.chart.priorityShare")}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.openTicketsByPriority.map((p) => ({ ...p, name: t(`priority.${p.priority}` as never) }))} dataKey="count" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {data.openTicketsByPriority.map((p) => <Cell key={p.priority} fill={PRIORITY_COLOR[p.priority]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <span><span className="block text-2xl font-semibold tabular">{formatNumber(data.live.openTickets, lang)}</span><span className="text-xs text-ink-3">{t("dash.openTickets")}</span></span>
                </div>
              </div>
              <ul className="space-y-3" aria-label={t("dash.chart.priority")}>
                {data.openTicketsByPriority.map((p) => {
                  const max = Math.max(...data.openTicketsByPriority.map((x) => x.count), 1);
                  return (
                    <li key={p.priority}>
                      <div className="mb-1 flex justify-between text-sm"><span>{t(`priority.${p.priority}` as never)}</span><span className="font-medium tabular">{p.count}</span></div>
                      <div className="h-2 rounded-full bg-sunken"><div className="h-2 rounded-full" style={{ width: `${(p.count / max) * 100}%`, background: PRIORITY_COLOR[p.priority] }} /></div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 h-32" role="img" aria-label={t("dash.chart.absence")}>
                <p className="mb-1 text-xs font-medium text-ink-2">{t("dash.chart.absence")}</p>
                <ResponsiveContainer>
                  <BarChart data={data.monthly}>
                    <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m, lang)} stroke={C.axis} fontSize={10} tickLine={false} interval={2} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => formatMonth(String(m), lang)} cursor={{ fill: "var(--sunken)" }} />
                    <Bar dataKey="absenceDays" name={t("dash.chart.absence")} fill="#9fb3b0" stackId="a" />
                    <Bar dataKey="sickDays" name={t("dash.chart.sick")} fill={C.amber} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
