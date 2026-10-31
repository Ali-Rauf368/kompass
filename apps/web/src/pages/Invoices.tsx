import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, DataTable, ErrorState, FilterSelect, PageHeader, Pagination, SearchInput, Spinner, type Column } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCents, formatDate, formatEur } from "../lib/format";
import { useApi, useDebounced, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useToast } from "../lib/toast";
import type { Invoice } from "../lib/types";

const AGING_COLOR = ["#5bb5a6", "#c9b23a", "#c98a1b", "#c0622b", "#b4372f"];

export function InvoicesPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("invoices.title"));
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const search = useDebounced(q);
  const status = params.get("status") ?? "";
  const company = params.get("company") ?? "";
  const page = Number(params.get("page") ?? 1);
  const list = useApi<Paged<Invoice>>(`/invoices${qs({ q: search, status, company, page })}`);
  const aging = useApi<{ buckets: { bucket: string; amountCents: number; count: number }[] }>(`/invoices/aging${qs({ company })}`);
  const today = new Date().toISOString().slice(0, 10);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const markPaid = async (inv: Invoice) => {
    try {
      await api(`/invoices/${inv.id}/mark-paid`, { method: "POST", body: {} });
      toast("success", `${t("invoices.paid")}: ${inv.number}`);
      list.reload();
      aging.reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  const label = (b: string) => (b === "current" ? t("invoices.aging.current") : t("invoices.aging.days", { range: b }));
  const columns: Column<Invoice>[] = [
    { key: "number", header: t("invoices.col.number"), cell: (i) => <><span className="font-mono text-xs font-medium">{i.number}</span>{i.source === "erp" && <span className="block text-[11px] text-ink-3">{t("invoices.source.erp")}</span>}</> },
    { key: "customer", header: t("sales.col.customer"), cell: (i) => i.customer.name },
    { key: "company", header: t("common.company"), cell: (i) => <Badge>{i.company.code}</Badge>, className: "hidden md:table-cell" },
    { key: "issued", header: t("invoices.col.issued"), cell: (i) => formatDate(i.issueDate, lang), className: "hidden lg:table-cell tabular" },
    { key: "due", header: t("invoices.col.due"), cell: (i) => <span className={i.status === "OPEN" && i.dueDate.slice(0, 10) < today ? "font-medium text-red-700 dark:text-red-400" : ""}>{formatDate(i.dueDate, lang)}</span>, className: "tabular" },
    { key: "amount", header: t("invoices.col.amount"), cell: (i) => formatCents(i.amountCents, lang), align: "end" },
    {
      key: "status",
      header: t("common.status"),
      cell: (i) => {
        const overdue = i.status === "OPEN" && i.dueDate.slice(0, 10) < today;
        return <Badge tone={i.status === "PAID" ? "green" : overdue ? "red" : i.status === "OPEN" ? "amber" : "neutral"}>{t(overdue ? "invoice.OVERDUE" : (`invoice.${i.status}` as never))}</Badge>;
      },
    },
    { key: "act", header: "", align: "end", cell: (i) => (i.status === "OPEN" && can("ACCOUNTING") ? <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => markPaid(i)} aria-label={`${t("invoices.markPaid")}: ${i.number}`}>{t("invoices.markPaid")}</Button> : null) },
  ];

  const totalOpen = aging.data?.buckets.reduce((n, b) => n + b.amountCents, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={t("invoices.title")}
        subtitle={t("invoices.subtitle")}
        actions={
          <FilterSelect label={t("common.company")} value={company} onChange={(e) => set("company", e.target.value)}>
            <option value="">{t("common.allCompanies")}</option>
            {["RWH", "RWS", "RWE", "RWK"].map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        }
      />
      <Card title={<>{t("invoices.aging")} · <span className="tabular">{formatEur(totalOpen / 100, lang)}</span></>} className="mb-4">
        {aging.data ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="h-44" role="img" aria-label={t("invoices.aging")}>
              <ResponsiveContainer>
                <BarChart data={aging.data.buckets.map((b) => ({ ...b, label: label(b.bucket), eur: b.amountCents / 100 }))}>
                  <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={12} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => formatEur(v, lang, { compact: true })} stroke="var(--ink-3)" fontSize={12} width={60} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => formatEur(Number(v), lang)} contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12 }} cursor={{ fill: "var(--sunken)" }} />
                  <Bar dataKey="eur" radius={[4, 4, 0, 0]}>{aging.data.buckets.map((_, i) => <Cell key={i} fill={AGING_COLOR[i]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="text-sm">
              <caption className="sr-only">{t("invoices.aging")}</caption>
              <tbody>
                {aging.data.buckets.map((b, i) => (
                  <tr key={b.bucket} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 text-start font-normal"><span className="me-2 inline-block size-2.5 rounded-sm" style={{ background: AGING_COLOR[i] }} aria-hidden />{label(b.bucket)}</th>
                    <td className="py-1.5 text-end text-ink-3 tabular">{b.count}</td>
                    <td className="py-1.5 text-end font-medium tabular">{formatCents(b.amountCents, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Spinner />}
      </Card>
      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value); }} />
          <FilterSelect label={t("common.status")} value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">{t("common.status")}: {t("common.all")}</option>
            {(["OPEN", "OVERDUE", "PAID", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{t(`invoice.${s}`)}</option>)}
          </FilterSelect>
        </div>
        {list.error && <div className="p-3"><ErrorState error={list.error} onRetry={list.reload} /></div>}
        {!list.data && list.loading ? <Spinner /> : list.data && (
          <>
            <DataTable caption={t("invoices.title")} columns={columns} rows={list.data.items} rowKey={(i) => i.id} />
            <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={(p) => set("page", String(p))} />
          </>
        )}
      </Card>
    </>
  );
}
