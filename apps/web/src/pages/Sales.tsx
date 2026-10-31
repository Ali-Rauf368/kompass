import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Badge, Button, Card, DataTable, Dialog, ErrorState, FilterSelect, PageHeader, Pagination, SearchInput, Spinner, TextField, type Column } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCents, formatDate, formatEur, fullName } from "../lib/format";
import { useApi, useDebounced, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useLiveEvent } from "../lib/live";
import { useToast } from "../lib/toast";
import type { Customer, Deal, DealStage } from "../lib/types";

const STAGES: DealStage[] = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const OPEN: DealStage[] = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];
const STAGE_BAR: Record<DealStage, string> = { LEAD: "bg-slate-400", QUALIFIED: "bg-sky-500", PROPOSAL: "bg-teal-500", NEGOTIATION: "bg-amber-500", WON: "bg-emerald-600", LOST: "bg-red-500" };

interface Column_ {
  stage: DealStage;
  count: number;
  valueCents: number;
  items: Deal[];
}

function DealCard({ deal, canMove, onMove }: { deal: Deal; canMove: boolean; onMove: (deal: Deal, stage: DealStage) => void }) {
  const { t, lang } = useI18n();
  const closed = deal.stage === "WON" || deal.stage === "LOST";
  return (
    <li className="rounded-md border border-line bg-panel p-3 text-sm shadow-sm">
      <p className="font-medium leading-snug">{deal.title}</p>
      <p className="mt-0.5 text-xs text-ink-2">
        <Link to={`/sales/customers/${deal.customer.id}`} className="hover:underline">{deal.customer.name}</Link> · {deal.customer.city}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold tabular">{formatCents(deal.valueCents, lang)}</span>
        <Badge>{deal.company.code}</Badge>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {fullName(deal.owner)} · {closed ? formatDate(deal.closedAt!, lang) : t("sales.expected", { date: formatDate(deal.expectedClose, lang) })}
      </p>
      {deal.lostReason && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{deal.lostReason}</p>}
      {canMove && !closed && (
        <label className="mt-2 block">
          <span className="sr-only">{t("sales.move")}: {deal.title}</span>
          <select value={deal.stage} onChange={(e) => onMove(deal, e.target.value as DealStage)} className="w-full rounded border border-line bg-sunken px-2 py-1 text-xs">
            {STAGES.map((s) => <option key={s} value={s}>{s === deal.stage ? `${t(`stage.${s}`)} ✓` : `→ ${t(`stage.${s}`)}`}</option>)}
          </select>
        </label>
      )}
    </li>
  );
}

export function PipelinePage() {
  const { t, lang } = useI18n();
  usePageTitle(t("sales.pipeline.title"));
  const { can, user } = useAuth();
  const toast = useToast();
  const [company, setCompany] = useState("");
  const { data, error, loading, reload } = useApi<{ columns: Column_[] }>(`/deals/board${qs({ company })}`);
  useLiveEvent(["deal.updated"], reload);
  const [losing, setLosing] = useState<Deal | null>(null);
  const [reason, setReason] = useState("");

  const move = async (deal: Deal, stage: DealStage, lostReason?: string) => {
    if (stage === deal.stage) return;
    if (stage === "LOST" && !lostReason) {
      setLosing(deal);
      return;
    }
    try {
      await api(`/deals/${deal.id}/stage`, { method: "PATCH", body: { stage, lostReason } });
      toast("success", t("sales.moved", { stage: t(`stage.${stage}`) }));
      reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };
  const confirmLost = async (e: FormEvent) => {
    e.preventDefault();
    if (!losing) return;
    await move(losing, "LOST", reason);
    setLosing(null);
    setReason("");
  };

  const canMove = (d: Deal) => can("MANAGER") || (can("SALES") && d.owner.id === user?.employeeId);
  const openValue = data?.columns.filter((c) => OPEN.includes(c.stage)).reduce((n, c) => n + c.valueCents, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={t("sales.pipeline.title")}
        subtitle={<>{t("sales.pipeline.subtitle")} · <span className="font-medium text-ink">{formatEur(openValue / 100, lang)}</span></>}
        actions={
          <FilterSelect label={t("common.company")} value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">{t("common.allCompanies")}</option>
            <option value="RWH">Rheinwerk Haustechnik</option>
            <option value="RWS">Rheinwerk Solar</option>
            <option value="RWE">Rheinwerk Elektro</option>
          </FilterSelect>
        }
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {!data && loading ? <Spinner /> : data && (
        <div className="-mx-4 grid snap-x auto-cols-[17rem] grid-flow-col gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
          {data.columns.map((col) => (
            <section key={col.stage} aria-labelledby={`col-${col.stage}`} className="flex snap-start flex-col rounded-lg bg-sunken/70 p-2">
              <header className="mb-2 px-1">
                <div className={`mb-2 h-1 rounded-full ${STAGE_BAR[col.stage]}`} aria-hidden />
                <h2 id={`col-${col.stage}`} className="flex items-baseline justify-between text-sm font-semibold">
                  {t(`stage.${col.stage}`)} <span className="text-xs font-normal text-ink-3">{col.count}</span>
                </h2>
                <p className="text-xs text-ink-2 tabular">{formatEur(col.valueCents / 100, lang, { compact: true })}</p>
              </header>
              <ul className="max-h-[65vh] space-y-2 overflow-y-auto">
                {col.items.map((d) => <DealCard key={d.id} deal={d} canMove={canMove(d)} onMove={move} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Dialog open={!!losing} onClose={() => setLosing(null)} title={`${t("stage.LOST")}: ${losing?.title ?? ""}`} footer={<><Button onClick={() => setLosing(null)}>{t("common.cancel")}</Button><Button variant="danger" type="submit" form="lost-form">{t("common.save")}</Button></>}>
        <form id="lost-form" onSubmit={confirmLost}>
          <TextField label={t("sales.lostReason")} required minLength={2} value={reason} onChange={(e) => setReason(e.target.value)} list="lost-reasons" autoFocus />
          <datalist id="lost-reasons">
            {["Price", "Chose competitor", "Project postponed", "No subsidy approved", "No response"].map((r) => <option key={r} value={r} />)}
          </datalist>
        </form>
      </Dialog>
    </>
  );
}

export function CustomersPage() {
  const { t } = useI18n();
  usePageTitle(t("sales.customers.title"));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const search = useDebounced(q);
  const segment = params.get("segment") ?? "";
  const page = Number(params.get("page") ?? 1);
  const { data, error, loading, reload } = useApi<Paged<Customer>>(`/customers${qs({ q: search, segment, page })}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const columns: Column<Customer>[] = [
    { key: "name", header: t("sales.col.customer"), cell: (c) => <><Link to={`/sales/customers/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{c.name}</Link><span className="block font-mono text-xs text-ink-3">{c.number}</span></> },
    { key: "segment", header: t("sales.col.segment"), cell: (c) => <Badge tone={c.segment === "PRIVATE" ? "neutral" : c.segment === "BUSINESS" ? "blue" : "accent"}>{t(`segment.${c.segment}`)}</Badge> },
    { key: "location", header: t("sales.col.location"), cell: (c) => <span className="text-ink-2">{c.postalCode} {c.city}</span>, className: "hidden md:table-cell" },
    { key: "activity", header: t("sales.col.activity"), cell: (c) => <span className="text-xs text-ink-2">{c._count?.deals} Deals · {c._count?.tickets} Tickets · {c._count?.invoices} RE</span>, className: "hidden lg:table-cell" },
    { key: "source", header: "", cell: (c) => (c.source === "crm" ? <Badge tone="accent">CRM</Badge> : null), align: "end" },
  ];
  return (
    <>
      <PageHeader title={t("sales.customers.title")} />
      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value); }} />
          <FilterSelect label={t("sales.col.segment")} value={segment} onChange={(e) => set("segment", e.target.value)}>
            <option value="">{t("common.all")}</option>
            {(["PRIVATE", "BUSINESS", "PUBLIC_SECTOR"] as const).map((s) => <option key={s} value={s}>{t(`segment.${s}`)}</option>)}
          </FilterSelect>
        </div>
        {error && <div className="p-3"><ErrorState error={error} onRetry={reload} /></div>}
        {!data && loading ? <Spinner /> : data && (
          <>
            <DataTable caption={t("sales.customers.title")} columns={columns} rows={data.items} rowKey={(c) => c.id} onRowClick={(c) => navigate(`/sales/customers/${c.id}`)} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => set("page", String(p))} />
          </>
        )}
      </Card>
    </>
  );
}

interface CustomerDetail {
  customer: Customer & {
    deals: { id: number; title: string; stage: DealStage; valueCents: number; createdAt: string }[];
    tickets: { id: number; number: string; subject: string; status: string; priority: string; createdAt: string }[];
    invoices: { id: number; number: string; status: string; amountCents: number; dueDate: string }[];
  };
  lifetimeRevenueCents: number;
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const { data, error } = useApi<CustomerDetail>(`/customers/${id}`);
  usePageTitle(data?.customer.name ?? t("nav.customers"));
  if (error) return <ErrorState error={error} />;
  if (!data) return <Spinner />;
  const c = data.customer;
  return (
    <>
      <Link to="/sales/customers" className="text-sm text-ink-2 hover:text-ink">← {t("nav.customers")}</Link>
      <div className="mt-2 mb-5 flex flex-wrap items-start gap-4">
        <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent" aria-hidden><Building2 className="size-6" /></span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{c.name}</h1>
          <p className="text-sm text-ink-2"><span className="font-mono">{c.number}</span> · {t(`segment.${c.segment}`)} · {c.street}, {c.postalCode} {c.city}</p>
          <p className="text-sm text-ink-2">{c.email} {c.phone && `· ${c.phone}`}</p>
        </div>
        <div className="rounded-lg border border-line bg-panel px-4 py-2 text-end">
          <p className="text-xs text-ink-2">{t("sales.lifetime")}</p>
          <p className="text-lg font-semibold tabular">{formatCents(data.lifetimeRevenueCents, lang)}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("sales.recentDeals")} bodyClass="divide-y divide-line">
          {c.deals.length === 0 && <p className="p-4 text-sm text-ink-3">—</p>}
          {c.deals.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span><span className="block">{d.title}</span><span className="text-xs text-ink-3">{formatDate(d.createdAt, lang)}</span></span>
              <span className="text-end"><span className="block tabular">{formatCents(d.valueCents, lang)}</span><Badge tone={d.stage === "WON" ? "green" : d.stage === "LOST" ? "red" : "neutral"}>{t(`stage.${d.stage}`)}</Badge></span>
            </div>
          ))}
        </Card>
        <Card title={t("sales.recentTickets")} bodyClass="divide-y divide-line">
          {c.tickets.length === 0 && <p className="p-4 text-sm text-ink-3">—</p>}
          {c.tickets.map((tk) => (
            <div key={tk.id} className="px-4 py-2.5 text-sm">
              {can("AFTERSALES", "MANAGER", "SALES") ? <Link to={`/after-sales/tickets/${tk.id}`} className="font-medium hover:underline">{tk.number}</Link> : <span className="font-medium">{tk.number}</span>} <span className="text-ink-2">{tk.subject}</span>
              <span className="block text-xs text-ink-3">{t(`ticket.${tk.status}` as never)} · {formatDate(tk.createdAt, lang)}</span>
            </div>
          ))}
        </Card>
        <Card title={t("sales.recentInvoices")} bodyClass="divide-y divide-line">
          {c.invoices.length === 0 && <p className="p-4 text-sm text-ink-3">—</p>}
          {c.invoices.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-mono text-xs">{i.number}</span>
              <span className="text-end"><span className="block tabular">{formatCents(i.amountCents, lang)}</span><span className="text-xs text-ink-3">{t(`invoice.${i.status}` as never)}</span></span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
