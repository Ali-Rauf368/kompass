import { CalendarPlus, Check, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Badge, Button, Card, DataTable, Dialog, EmptyState, ErrorState, PageHeader, Pagination, SelectField, Spinner, TextArea, TextField, type Column, type Tone } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, fullName } from "../lib/format";
import { useApi, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useLiveEvent } from "../lib/live";
import { useToast } from "../lib/toast";
import type { LeaveRequest, LeaveStatus } from "../lib/types";
import { countWorkingDays } from "../lib/workdays";

const STATUS_TONE: Record<LeaveStatus, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" };

function Balance() {
  const { t } = useI18n();
  const { data } = useApi<{ year: number; entitlement: number; approved: number; pending: number; remaining: number }>("/leave/balance");
  if (!data) return null;
  const pct = (n: number) => `${Math.min(100, (n / data.entitlement) * 100)}%`;
  return (
    <Card>
      <p className="text-xs font-medium text-ink-2">{t("leave.balance", { year: data.year })}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{t("leave.balance.remaining", { n: data.remaining })}</p>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="bg-accent" style={{ width: pct(data.approved) }} />
        <div className="bg-amber-400" style={{ width: pct(data.pending) }} />
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("leave.balance.detail", { approved: data.approved, pending: data.pending, total: data.entitlement })}</p>
    </Card>
  );
}

function RequestDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ type: "VACATION", startDate: "", endDate: "", note: "" });
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => (form.startDate && form.endDate ? countWorkingDays(form.startDate, form.endDate) : null), [form.startDate, form.endDate]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/leave", { method: "POST", body: { type: form.type, startDate: form.startDate, endDate: form.endDate, note: form.note || undefined } });
      toast("success", t("leave.submitted"));
      setForm({ type: "VACATION", startDate: "", endDate: "", note: "" });
      onDone();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("leave.new")} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" type="submit" form="leave-form" busy={busy} disabled={days === 0}>{t("leave.submit")}</Button></>}>
      <form id="leave-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SelectField label={t("leave.type")} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {(["VACATION", "TRAINING", "OTHER"] as const).map((x) => <option key={x} value={x}>{t(`leave.${x}`)}</option>)}
          </SelectField>
        </div>
        <TextField label={t("leave.from")} type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate && form.endDate < e.target.value ? e.target.value : form.endDate })} />
        <TextField label={t("leave.to")} type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <p className="text-sm sm:col-span-2" aria-live="polite">
          {days !== null && <><span className="font-semibold tabular">{days}</span> {t("leave.days")} · </>}
          <span className="text-ink-3">{t("leave.workingDaysHint")}</span>
        </p>
        <div className="sm:col-span-2"><TextArea label={t("leave.note")} rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
      </form>
    </Dialog>
  );
}

export function LeavePage() {
  const { t, lang } = useI18n();
  usePageTitle(t("leave.title"));
  const { user, can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") ?? "mine") as "mine" | "approvals" | "all";
  const page = Number(params.get("page") ?? 1);
  const [creating, setCreating] = useState(false);
  const status = view === "approvals" ? "PENDING" : undefined;
  const { data, error, loading, reload } = useApi<Paged<LeaveRequest>>(`/leave${qs({ view, status, page, pageSize: 20 })}`);
  useLiveEvent(["leave.updated", "notification"], reload);
  const isApprover = can("HR", "MANAGER");

  const decide = async (l: LeaveRequest, decision: "APPROVED" | "REJECTED") => {
    try {
      await api(`/leave/${l.id}/decision`, { method: "POST", body: { decision } });
      toast("success", t("leave.decided"));
      reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };
  const cancel = async (l: LeaveRequest) => {
    try {
      await api(`/leave/${l.id}/cancel`, { method: "POST" });
      reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  const columns: Column<LeaveRequest>[] = [
    ...(view !== "mine" ? [{ key: "who", header: t("hr.col.name"), cell: (l: LeaveRequest) => <span className="font-medium">{fullName(l.employee)}</span> }, { key: "dept", header: t("hr.col.department"), cell: (l: LeaveRequest) => <span className="text-ink-2">{l.employee.department.name}</span>, className: "hidden lg:table-cell" }] : []),
    { key: "type", header: t("leave.type"), cell: (l) => t(`leave.${l.type}`), className: view === "mine" ? "" : "hidden md:table-cell" },
    { key: "period", header: `${t("leave.from")} – ${t("leave.to")}`, cell: (l) => <span className="tabular whitespace-nowrap">{formatDate(l.startDate, lang)} – {formatDate(l.endDate, lang)}</span> },
    { key: "days", header: t("leave.days"), cell: (l) => l.workingDays, align: "end", className: "hidden sm:table-cell" },
    { key: "status", header: t("common.status"), cell: (l) => <Badge tone={STATUS_TONE[l.status]}>{t(`leaveStatus.${l.status}`)}</Badge> },
    {
      key: "actions",
      header: "",
      align: "end",
      cell: (l) =>
        view === "approvals" && l.status === "PENDING" && l.employee.id !== user?.employeeId ? (
          <span className="inline-flex gap-1.5">
            <Button size="sm" variant="primary" icon={Check} onClick={() => decide(l, "APPROVED")} aria-label={`${t("leave.approve")}: ${fullName(l.employee)}`}>{t("leave.approve")}</Button>
            <Button size="sm" icon={X} onClick={() => decide(l, "REJECTED")} aria-label={`${t("leave.reject")}: ${fullName(l.employee)}`}>{t("leave.reject")}</Button>
          </span>
        ) : view === "mine" && ["PENDING", "APPROVED"].includes(l.status) && new Date(l.startDate) > new Date() ? (
          <Button size="sm" variant="ghost" onClick={() => cancel(l)}>{t("leave.cancel")}</Button>
        ) : null,
    },
  ];

  const tabs = [["mine", t("leave.mine")], ...(isApprover ? [["approvals", t("leave.approvals")]] : []), ...(can("HR") ? [["all", t("leave.all")]] : [])];

  return (
    <>
      <PageHeader title={t("leave.title")} actions={user?.employeeId ? <Button variant="primary" icon={CalendarPlus} onClick={() => setCreating(true)}>{t("leave.new")}</Button> : null} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card bodyClass="">
          <div className="flex gap-1 border-b border-line px-3 pt-2" role="tablist">
            {tabs.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={view === key} onClick={() => setParams({ view: key! })} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === key ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          {error && <div className="p-3"><ErrorState error={error} onRetry={reload} /></div>}
          {!data && loading ? <Spinner /> : data && (
            <>
              <DataTable caption={t("leave.title")} columns={columns} rows={data.items} rowKey={(l) => l.id} empty={view === "approvals" ? <EmptyState icon={Check} title={t("leave.noApprovals")} /> : undefined} />
              {data.pages > 1 && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setParams({ view, page: String(p) })} />}
            </>
          )}
        </Card>
        {user?.employeeId && <Balance />}
      </div>
      <RequestDialog open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
    </>
  );
}
