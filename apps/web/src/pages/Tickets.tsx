import { AlertTriangle, ArrowRightLeft, MessageSquare, Plus, Send, UserCheck, CircleDot } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Badge, Button, Card, DataTable, Dialog, ErrorState, FilterSelect, PageHeader, Pagination, SearchInput, SelectField, Spinner, TextArea, TextField, clsx, type Column, type Tone } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatRelative, fullName } from "../lib/format";
import { useApi, useDebounced, useNow, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useLiveEvent } from "../lib/live";
import { useToast } from "../lib/toast";
import type { Customer, Ticket, TicketActivity, TicketPriority, TicketStatus } from "../lib/types";

export const PRIORITY_TONE: Record<TicketPriority, Tone> = { URGENT: "red", HIGH: "amber", MEDIUM: "blue", LOW: "neutral" };
const STATUS_TONE: Record<TicketStatus, Tone> = { OPEN: "amber", IN_PROGRESS: "blue", WAITING: "neutral", RESOLVED: "green", CLOSED: "neutral" };
const ACTIVE: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

/** SLA status: remaining time, breach, or whether it was met once resolved. */
export function SlaCell({ ticket, now }: { ticket: Pick<Ticket, "slaDueAt" | "resolvedAt" | "status">; now: number }) {
  const { t, lang } = useI18n();
  const due = new Date(ticket.slaDueAt).getTime();
  if (ticket.resolvedAt) {
    const met = new Date(ticket.resolvedAt).getTime() <= due;
    return <Badge tone={met ? "green" : "red"}>{t(met ? "tickets.sla.met" : "tickets.sla.missed")}</Badge>;
  }
  const breached = due < now;
  const soon = !breached && due - now < 4 * 3_600_000;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", breached ? "text-red-700 dark:text-red-400" : soon ? "text-amber-700 dark:text-amber-400" : "text-ink-2")}>
      {breached && <AlertTriangle className="size-3.5" aria-hidden />}
      {t(breached ? "tickets.sla.breached" : "tickets.sla.due", { time: formatRelative(ticket.slaDueAt, lang, now) })}
    </span>
  );
}

function NewTicket({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const search = useDebounced(q, 200);
  const customers = useApi<Paged<Customer>>(open && search.length >= 2 ? `/customers${qs({ q: search, pageSize: 8 })}` : null);
  const [form, setForm] = useState({ subject: "", description: "", priority: "MEDIUM", channel: "PHONE", customerId: 0, companyId: 4 });
  const [busy, setBusy] = useState(false);
  const picked = customers.data?.items.find((c) => c.id === form.customerId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast("error", t("tickets.customer"));
    setBusy(true);
    try {
      const { ticket } = await api<{ ticket: Ticket }>("/tickets", { method: "POST", body: form });
      toast("success", t("tickets.created", { number: ticket.number }));
      onCreated(ticket);
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} wide title={t("tickets.new")} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" type="submit" form="new-ticket" busy={busy}>{t("tickets.create")}</Button></>}>
      <form id="new-ticket" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label={t("tickets.customer")} placeholder="Name, K-Nr., PLZ …" value={picked ? `${picked.name} (${picked.number})` : q} onChange={(e) => { setQ(e.target.value); setForm({ ...form, customerId: 0 }); }} required autoComplete="off" />
          {!picked && customers.data && customers.data.items.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-line" role="listbox" aria-label={t("tickets.customer")}>
              {customers.data.items.map((c) => (
                <li key={c.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => setForm({ ...form, customerId: c.id })} className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sunken">
                    {c.name} <span className="text-ink-3">· {c.number} · {c.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="sm:col-span-2"><TextField label={t("tickets.subject")} required minLength={4} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
        <div className="sm:col-span-2"><TextArea label={t("tickets.description")} required minLength={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <SelectField label={t("tickets.col.priority")} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
        </SelectField>
        <SelectField label={t("tickets.channel")} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
          {(["PHONE", "EMAIL", "PORTAL", "TECHNICIAN"] as const).map((c) => <option key={c} value={c}>{t(`channel.${c}`)}</option>)}
        </SelectField>
      </form>
    </Dialog>
  );
}

export function TicketsPage() {
  const { t } = useI18n();
  usePageTitle(t("tickets.title"));
  const { can } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const search = useDebounced(q);
  const filter = params.get("filter") ?? "active";
  const priority = params.get("priority") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [creating, setCreating] = useState(false);
  const query = { q: search, priority, page, assignee: filter === "mine" ? "me" : filter === "unassigned" ? "unassigned" : undefined, sla: filter === "breached" ? "breached" : undefined, status: ACTIVE.includes(filter.toUpperCase() as TicketStatus) || ["RESOLVED", "CLOSED"].includes(filter.toUpperCase()) ? filter.toUpperCase() : undefined };
  const { data, error, loading, reload } = useApi<Paged<Ticket> & { openByPriority: Record<string, number> }>(`/tickets${qs(query)}`);
  useLiveEvent(["ticket.updated"], reload);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const columns: Column<Ticket>[] = [
    { key: "ticket", header: t("tickets.col.ticket"), cell: (tk) => <><Link to={`/after-sales/tickets/${tk.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{tk.subject}</Link><span className="block font-mono text-xs text-ink-3">{tk.number}</span></> },
    { key: "customer", header: t("tickets.col.customer"), cell: (tk) => <><span>{tk.customer.name}</span><span className="block text-xs text-ink-3">{tk.customer.city}</span></>, className: "hidden md:table-cell" },
    { key: "priority", header: t("tickets.col.priority"), cell: (tk) => <Badge tone={PRIORITY_TONE[tk.priority]}>{t(`priority.${tk.priority}`)}</Badge> },
    { key: "status", header: t("common.status"), cell: (tk) => <Badge tone={STATUS_TONE[tk.status]}>{t(`ticket.${tk.status}`)}</Badge>, className: "hidden sm:table-cell" },
    { key: "assignee", header: t("tickets.col.assignee"), cell: (tk) => (tk.assignee ? fullName(tk.assignee) : <span className="text-ink-3">{t("tickets.unassigned")}</span>), className: "hidden lg:table-cell" },
    { key: "sla", header: t("tickets.col.sla"), cell: (tk) => <SlaCell ticket={tk} now={now} /> },
  ];

  const filters: [string, string][] = [["active", t("tickets.filter.active")], ["mine", t("tickets.filter.mine")], ["unassigned", t("tickets.filter.unassigned")], ["breached", t("tickets.filter.breached")], ["resolved", t("ticket.RESOLVED")], ["closed", t("ticket.CLOSED")]];

  return (
    <>
      <PageHeader
        title={t("tickets.title")}
        subtitle={data && <span className="inline-flex flex-wrap gap-1.5">{(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((p) => <Badge key={p} tone={PRIORITY_TONE[p]}>{t(`priority.${p}`)}: {data.openByPriority[p] ?? 0}</Badge>)}</span>}
        actions={can("AFTERSALES") && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t("tickets.new")}</Button>}
      />
      <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("common.status")}>
            {filters.map(([key, label]) => (
              <button key={key} onClick={() => set("filter", key === "active" ? "" : key)} aria-pressed={filter === key} className={clsx("rounded-md px-2.5 py-1 text-sm", filter === key ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sunken")}>{label}</button>
            ))}
          </div>
          <SearchInput label={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value); }} />
          <FilterSelect label={t("tickets.col.priority")} value={priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">{t("tickets.col.priority")}: {t("common.all")}</option>
            {(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
          </FilterSelect>
        </div>
        {error && <div className="p-3"><ErrorState error={error} onRetry={reload} /></div>}
        {!data && loading ? <Spinner /> : data && (
          <>
            <DataTable caption={t("tickets.title")} columns={columns} rows={data.items} rowKey={(tk) => tk.id} onRowClick={(tk) => navigate(`/after-sales/tickets/${tk.id}`)} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => set("page", String(p))} />
          </>
        )}
      </Card>
      <NewTicket open={creating} onClose={() => setCreating(false)} onCreated={(tk) => { setCreating(false); navigate(`/after-sales/tickets/${tk.id}`); }} />
    </>
  );
}

const ACTIVITY_ICON = { comment: MessageSquare, status: ArrowRightLeft, assignment: UserCheck, created: CircleDot };

export function TicketDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { can, user } = useAuth();
  const toast = useToast();
  const now = useNow(15_000);
  const { data, error, reload } = useApi<{ ticket: Ticket; activity: TicketActivity[] }>(`/tickets/${id}`);
  useLiveEvent(["ticket.activity", "ticket.updated"], (e) => Number(e.ticketId) === Number(id) && reload());
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  usePageTitle(data ? `${data.ticket.number} · ${data.ticket.subject}` : t("nav.tickets"));

  if (error) return <ErrorState error={error} />;
  if (!data) return <Spinner />;
  const tk = data.ticket;
  const editable = can("AFTERSALES") && tk.status !== "CLOSED";

  const update = async (body: Record<string, unknown>) => {
    try {
      await api(`/tickets/${tk.id}`, { method: "PATCH", body });
      toast("success", t("tickets.updated"));
      reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/tickets/${tk.id}/comments`, { method: "POST", body: { body: comment, internal } });
      setComment("");
      reload();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/after-sales/tickets" className="text-sm text-ink-2 hover:text-ink">← {t("nav.tickets")}</Link>
      <div className="mt-2 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-ink-3">{tk.number} · {tk.company.name}</p>
          <h1 className="text-xl font-semibold">{tk.subject}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={PRIORITY_TONE[tk.priority]}>{t(`priority.${tk.priority}`)}</Badge>
            <Badge tone={STATUS_TONE[tk.status]}>{t(`ticket.${tk.status}`)}</Badge>
            <SlaCell ticket={tk} now={now} />
          </div>
        </div>
        {editable && !tk.assignee && user?.employeeId && <Button icon={UserCheck} onClick={() => update({ assigneeId: user.employeeId, status: tk.status === "OPEN" ? "IN_PROGRESS" : tk.status })}>{t("tickets.assignToMe")}</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card title={t("tickets.description")}><p className="text-sm whitespace-pre-line">{tk.description}</p></Card>
          <Card title={t("tickets.activity")}>
            <ol className="space-y-4" aria-live="polite">
              {data.activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.kind];
                return (
                  <li key={a._id} className="flex gap-3">
                    <span className={clsx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", a.internal ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-sunken text-ink-2")} aria-hidden><Icon className="size-3.5" /></span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p><span className="font-medium">{a.authorName}</span> <span className="text-xs text-ink-3">· {formatDateTime(a.at, lang)}</span>{a.internal && <Badge tone="amber">{t("tickets.comment.internal")}</Badge>}</p>
                      {a.kind === "status" ? <p className="text-ink-2">{t(`ticket.${a.from as TicketStatus}`)} → <span className="font-medium text-ink">{t(`ticket.${a.to as TicketStatus}`)}</span></p> : <p className="whitespace-pre-line text-ink-2">{a.body}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {editable && (
              <form onSubmit={send} className="mt-5 border-t border-line pt-4">
                <TextArea label={t("tickets.comment")} rows={3} required value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[var(--accent)]" /> {t("tickets.comment.internal")}</label>
                  <Button type="submit" variant="primary" icon={Send} busy={busy}>{t("tickets.comment.send")}</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={t("common.details")}>
            <div className="space-y-3">
              {editable ? (
                <>
                  <SelectField label={t("common.status")} value={tk.status} onChange={(e) => update({ status: e.target.value })}>
                    {(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] as const).map((s) => <option key={s} value={s}>{t(`ticket.${s}`)}</option>)}
                  </SelectField>
                  <SelectField label={t("tickets.col.priority")} value={tk.priority} onChange={(e) => update({ priority: e.target.value })}>
                    {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                  </SelectField>
                </>
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-2">{t("tickets.col.assignee")}</dt><dd>{tk.assignee ? fullName(tk.assignee) : t("tickets.unassigned")}</dd>
                <dt className="text-ink-2">{t("tickets.channel")}</dt><dd>{t(`channel.${tk.channel}`)}</dd>
                <dt className="text-ink-2">{t("common.created")}</dt><dd>{formatDateTime(tk.createdAt, lang)}</dd>
                <dt className="text-ink-2">{t("tickets.firstResponse")}</dt><dd>{tk.firstResponseAt ? formatDateTime(tk.firstResponseAt, lang) : "—"}</dd>
                <dt className="text-ink-2">{t("tickets.resolved")}</dt><dd>{tk.resolvedAt ? formatDateTime(tk.resolvedAt, lang) : "—"}</dd>
              </dl>
            </div>
          </Card>
          <Card title={t("tickets.customer")}>
            <p className="text-sm font-medium"><Link to={`/sales/customers/${tk.customer.id}`} className="hover:underline">{tk.customer.name}</Link></p>
            <p className="text-sm text-ink-2">{tk.customer.number} · {tk.customer.city}</p>
            {tk.customer.phone && <a href={`tel:${tk.customer.phone}`} className="text-sm text-accent hover:underline">{tk.customer.phone}</a>}
          </Card>
        </div>
      </div>
    </>
  );
}
