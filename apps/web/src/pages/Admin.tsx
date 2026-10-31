import { Database, Download, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Badge, Button, Card, DataTable, Dialog, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Spinner, TextField, type Column, type Tone } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime, formatPercent, fullName } from "../lib/format";
import { useApi, useDebounced, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useLiveEvent } from "../lib/live";
import { useToast } from "../lib/toast";
import type { Employee } from "../lib/types";

interface Run {
  id: number;
  pipeline: string;
  batchId: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  received: number;
  inserted: number;
  updated: number;
  rejected: number;
  errors: { record: number; message: string }[];
  startedAt: string;
  finishedAt: string | null;
}
const RUN_TONE: Record<Run["status"], Tone> = { RUNNING: "blue", SUCCEEDED: "green", PARTIAL: "amber", FAILED: "red" };

export function PipelinesPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("pipelines.title"));
  const summary = useApi<{ pipelines: { name: string; description: string; lastRun: Run | null; successRate14d: number | null; recordsReceived14d: number; rejectionRate14d: number | null }[] }>("/pipelines");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const runs = useApi<Paged<Run>>(`/pipelines/runs${qs({ page, pageSize: 15 })}`);
  const [open, setOpen] = useState<Run | null>(null);
  useLiveEvent(["ingestion.finished"], () => {
    summary.reload();
    runs.reload();
  });

  const columns: Column<Run>[] = [
    { key: "pipeline", header: "Pipeline", cell: (r) => <span className="font-mono text-xs">{r.pipeline}</span> },
    { key: "batch", header: t("pipelines.col.batch"), cell: (r) => <span className="font-mono text-xs text-ink-2">{r.batchId}</span>, className: "hidden lg:table-cell" },
    { key: "started", header: t("pipelines.col.started"), cell: (r) => formatDateTime(r.startedAt, lang), className: "tabular" },
    { key: "received", header: t("pipelines.col.received"), cell: (r) => r.received, align: "end" },
    { key: "inserted", header: t("pipelines.col.inserted"), cell: (r) => r.inserted, align: "end", className: "hidden md:table-cell" },
    { key: "updated", header: t("pipelines.col.updated"), cell: (r) => r.updated, align: "end", className: "hidden md:table-cell" },
    { key: "rejected", header: t("pipelines.rejected"), cell: (r) => (r.rejected ? <button onClick={() => setOpen(r)} className="font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-400">{r.rejected}</button> : 0), align: "end" },
    { key: "status", header: t("common.status"), cell: (r) => <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge> },
  ];

  return (
    <>
      <PageHeader title={t("pipelines.title")} subtitle={t("pipelines.subtitle")} />
      {summary.error && <ErrorState error={summary.error} />}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {summary.data?.pipelines.map((p) => (
          <Card key={p.name}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-accent-soft text-accent" aria-hidden><Database className="size-4.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-medium">{p.name}</p>
                <p className="text-xs text-ink-2">{p.description}</p>
              </div>
              {p.lastRun && <Badge tone={RUN_TONE[p.lastRun.status]}>{p.lastRun.status}</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-ink-2">{t("pipelines.lastRun")}</dt><dd className="tabular">{p.lastRun ? formatDateTime(p.lastRun.startedAt, lang) : "—"}</dd></div>
              <div><dt className="text-xs text-ink-2">{t("pipelines.success")}</dt><dd className="font-medium tabular">{p.successRate14d === null ? "—" : formatPercent(p.successRate14d, lang)}</dd></div>
              <div><dt className="text-xs text-ink-2">{t("pipelines.records")}</dt><dd className="tabular">{p.recordsReceived14d}{p.rejectionRate14d ? <span className="text-ink-3"> · {formatPercent(p.rejectionRate14d, lang, 1)} {t("pipelines.rejected").toLowerCase()}</span> : null}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <Card title={t("pipelines.runs")} bodyClass="">
        {!runs.data ? <Spinner /> : (
          <>
            <DataTable caption={t("pipelines.runs")} columns={columns} rows={runs.data.items} rowKey={(r) => r.id} />
            <Pagination page={runs.data.page} pages={runs.data.pages} total={runs.data.total} onPage={(p) => setParams({ page: String(p) })} />
          </>
        )}
      </Card>
      <Dialog open={!!open} onClose={() => setOpen(null)} wide title={`${t("pipelines.errors")}: ${open?.batchId ?? ""}`}>
        <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {open?.errors.map((e, i) => <li key={i} className="rounded border border-line p-2"><span className="font-mono text-xs text-ink-3">#{e.record}</span> {e.message}</li>)}
        </ul>
      </Dialog>
    </>
  );
}

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  personalData: boolean;
  ip?: string;
  at: string;
}

export function AuditPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("audit.title"));
  const [params, setParams] = useSearchParams();
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const actorQ = useDebounced(actor);
  const personal = params.get("personalData") === "true";
  const page = Number(params.get("page") ?? 1);
  const { data, error } = useApi<Paged<AuditItem>>(`/admin/audit${qs({ actor: actorQ, personalData: personal ? "true" : undefined, page, pageSize: 30 })}`);
  const columns: Column<AuditItem>[] = [
    { key: "at", header: t("audit.col.time"), cell: (e) => <span className="tabular whitespace-nowrap">{formatDateTime(e.at, lang)}</span> },
    { key: "actor", header: t("audit.col.actor"), cell: (e) => <span className="font-mono text-xs">{e.actor}</span> },
    { key: "action", header: t("audit.col.action"), cell: (e) => <><span className="font-mono text-xs">{e.action}</span>{e.personalData && <> <Badge tone="amber">DSGVO</Badge></>}</> },
    { key: "entity", header: t("audit.col.entity"), cell: (e) => <span className="text-ink-2">{e.entityType}{e.entityId ? ` #${e.entityId}` : ""}</span> },
    { key: "ip", header: "IP", cell: (e) => <span className="font-mono text-xs text-ink-3">{e.ip}</span>, className: "hidden lg:table-cell" },
  ];
  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle", { days: 400 })} />
      <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <SearchInput label={t("audit.col.actor")} value={actor} onChange={(e) => setActor(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={personal} onChange={(e) => setParams(e.target.checked ? { personalData: "true" } : {})} className="accent-[var(--accent)]" /> {t("audit.personalOnly")}
          </label>
        </div>
        {error && <div className="p-3"><ErrorState error={error} /></div>}
        {!data ? <Spinner /> : (
          <>
            <DataTable caption={t("audit.title")} columns={columns} rows={data.items} rowKey={(e) => e.id} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setParams({ ...(personal ? { personalData: "true" } : {}), page: String(p) })} />
          </>
        )}
      </Card>
    </>
  );
}

export function PrivacyPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("privacy.title"));
  const { user, can } = useAuth();
  const toast = useToast();
  const leavers = useApi<Paged<Employee>>(can("HR") ? "/employees?status=LEFT&pageSize=50" : null);
  const [erasing, setErasing] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const erase = async () => {
    if (!erasing) return;
    setBusy(true);
    try {
      await api(`/gdpr/employees/${erasing.id}/erase`, { method: "POST", body: { confirm } });
      toast("success", t("privacy.erase.done", { name: fullName(erasing) }));
      setErasing(null);
      setConfirm("");
      leavers.reload();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const runRetention = async () => {
    try {
      const r = await api<{ leaveDeleted: number; employeesPseudonymized: number }>("/gdpr/retention/run", { method: "POST" });
      toast("success", t("privacy.retention.result", { leave: r.leaveDeleted, people: r.employeesPseudonymized }));
      leavers.reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  const pending = leavers.data?.items.filter((e) => !e.pseudonymizedAt) ?? [];

  return (
    <>
      <PageHeader title={t("privacy.title")} subtitle={t("privacy.subtitle")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("privacy.myData")}>
          <p className="mb-4 text-sm text-ink-2">{t("privacy.myData.text")}</p>
          {user?.employeeId && (
            <a href={`/api/gdpr/employees/${user.employeeId}/export`} download className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:brightness-110">
              <Download className="size-4" aria-hidden /> {t("privacy.download")}
            </a>
          )}
        </Card>
        {can("ADMIN") && (
          <Card title={t("privacy.retention")}>
            <ul className="mb-4 list-disc space-y-1 ps-5 text-sm text-ink-2">
              <li>{lang === "de" ? "Abwesenheiten ehemaliger Mitarbeitender: 3 Jahre" : "Leave records of former employees: 3 years"}</li>
              <li>{lang === "de" ? "Audit-Log: 400 Tage (automatisch, MongoDB TTL)" : "Audit log: 400 days (automatic, MongoDB TTL)"}</li>
              <li>{lang === "de" ? "Benachrichtigungen: 90 Tage · Rohdaten aus NiFi: 30 Tage" : "Notifications: 90 days · raw NiFi payloads: 30 days"}</li>
            </ul>
            <Button icon={Play} onClick={runRetention}>{t("privacy.retention.run")}</Button>
          </Card>
        )}
        {can("HR") && (
          <Card title={t("privacy.erase")} className="lg:col-span-2" bodyClass="">
            <p className="border-b border-line p-4 text-sm text-ink-2">{t("privacy.erase.text")}</p>
            {!leavers.data ? <Spinner /> : pending.length === 0 ? <EmptyState icon={ShieldAlert} title={t("privacy.none")} /> : (
              <ul className="divide-y divide-line">
                {pending.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><span className="font-medium">{fullName(e)}</span> <span className="text-ink-3">· {e.jobTitle} · {e.exitDate ? formatDate(e.exitDate, lang) : ""}</span></span>
                    <Button size="sm" variant="danger" onClick={() => setErasing(e)}>{t("privacy.erase.action")}</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
      <Dialog open={!!erasing} onClose={() => setErasing(null)} title={`${t("privacy.erase.action")}: ${erasing ? fullName(erasing) : ""}`} footer={<><Button onClick={() => setErasing(null)}>{t("common.cancel")}</Button><Button variant="danger" busy={busy} disabled={confirm !== "ERASE"} onClick={erase}>{t("privacy.erase.action")}</Button></>}>
        <p className="mb-3 text-sm text-ink-2">{t("privacy.erase.text")}</p>
        <TextField label={t("privacy.erase.confirm")} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Dialog>
    </>
  );
}
