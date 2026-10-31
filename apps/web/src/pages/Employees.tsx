import { Mail, Pencil, Phone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Badge, Button, Card, DataTable, Dialog, ErrorState, FilterSelect, PageHeader, Pagination, SearchInput, SelectField, Spinner, TextField, type Column } from "../components/ui";
import { api, qs, type Paged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, fullName } from "../lib/format";
import { useApi, useDebounced, usePageTitle } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { useToast } from "../lib/toast";
import type { Employee } from "../lib/types";

const DEPARTMENTS = ["MGMT", "HR", "SALES", "AFTERSALES", "ACCOUNTING", "FIELD"] as const;
const DEPT_NAMES: Record<string, string> = { MGMT: "Management", HR: "Human Resources", SALES: "Sales", AFTERSALES: "After-Sales", ACCOUNTING: "Accounting", FIELD: "Field Service" };

export function EmployeesPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  usePageTitle(t("hr.employees.title"));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const search = useDebounced(q);
  const department = params.get("department") ?? "";
  const page = Number(params.get("page") ?? 1);
  const { data, error, loading, reload } = useApi<Paged<Employee>>(`/employees${qs({ q: search, department, page, pageSize: 25 })}`);
  const isHr = can("HR");

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const columns: Column<Employee>[] = [
    { key: "name", header: t("hr.col.name"), cell: (e) => <Link to={`/hr/employees/${e.id}`} className="font-medium hover:underline" onClick={(ev) => ev.stopPropagation()}>{fullName(e)}</Link> },
    { key: "role", header: t("hr.col.role"), cell: (e) => <span className="text-ink-2">{e.jobTitle}</span> },
    { key: "dept", header: t("hr.col.department"), cell: (e) => e.department.name, className: "hidden md:table-cell" },
    { key: "company", header: t("common.company"), cell: (e) => <Badge>{e.company.code}</Badge>, className: "hidden lg:table-cell" },
    { key: "contact", header: t("hr.col.contact"), cell: (e) => <a href={`mailto:${e.email}`} className="text-ink-2 hover:text-accent" onClick={(ev) => ev.stopPropagation()}>{e.email}</a>, className: "hidden xl:table-cell" },
    ...(isHr
      ? [
          { key: "since", header: t("hr.col.since"), cell: (e: Employee) => (e.hireDate ? formatDate(e.hireDate, lang) : "—"), className: "hidden lg:table-cell" },
          { key: "status", header: t("common.status"), cell: (e: Employee) => <Badge tone={e.status === "ACTIVE" ? "green" : e.status === "LEFT" ? "neutral" : "amber"}>{t(`employee.${e.status}`)}</Badge> },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={t("hr.employees.title")} subtitle={t("hr.employees.subtitle")} />
      <Card bodyClass="">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label={t("common.search")} value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value); }} />
          <FilterSelect label={t("hr.col.department")} value={department} onChange={(e) => set("department", e.target.value)}>
            <option value="">{t("hr.department.all")}</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPT_NAMES[d]}</option>)}
          </FilterSelect>
        </div>
        {error && <div className="p-3"><ErrorState error={error} onRetry={reload} /></div>}
        {!data && loading ? <Spinner /> : data && (
          <>
            <DataTable caption={t("hr.employees.title")} columns={columns} rows={data.items} rowKey={(e) => e.id} onRowClick={(e) => navigate(`/hr/employees/${e.id}`)} />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => set("page", String(p))} />
          </>
        )}
      </Card>
    </>
  );
}

function EditEmployee({ employee, open, onClose, onSaved }: { employee: Employee; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ jobTitle: employee.jobTitle, status: employee.status, vacationDays: String(employee.vacationDays ?? 30), phone: employee.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/employees/${employee.id}`, { method: "PATCH", body: { jobTitle: form.jobTitle, status: form.status, vacationDays: Number(form.vacationDays), phone: form.phone || null } });
      toast("success", t("hr.profile.saved"));
      onSaved();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`${t("hr.profile.edit")}: ${fullName(employee)}`} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" type="submit" form="edit-employee" busy={busy}>{t("common.save")}</Button></>}>
      <form id="edit-employee" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><TextField label={t("hr.col.role")} required minLength={2} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
        <SelectField label={t("common.status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Employee["status"] })}>
          {(["ACTIVE", "ON_LEAVE", "LEFT"] as const).map((s) => <option key={s} value={s}>{t(`employee.${s}`)}</option>)}
        </SelectField>
        <TextField label={t("hr.profile.vacation")} type="number" min={0} max={60} value={form.vacationDays} onChange={(e) => setForm({ ...form, vacationDays: e.target.value })} />
        <div className="sm:col-span-2"><TextField label="Telefon / Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </form>
    </Dialog>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data, error, reload } = useApi<{ employee: Employee; reports: { id: number; firstName: string; lastName: string; jobTitle: string }[] }>(`/employees/${id}`);
  usePageTitle(data ? fullName(data.employee) : t("nav.employees"));
  if (error) return <ErrorState error={error} />;
  if (!data) return <Spinner />;
  const e = data.employee;
  return (
    <>
      <Link to="/hr/employees" className="text-sm text-ink-2 hover:text-ink">← {t("nav.employees")}</Link>
      <div className="mt-2 mb-5 flex flex-wrap items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-lg font-semibold text-accent" aria-hidden>{e.firstName[0]}{e.lastName[0]}</span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{fullName(e)}</h1>
          <p className="text-sm text-ink-2">{e.jobTitle} · {e.department.name} · {e.company.name}</p>
        </div>
        {can("HR") && <Button icon={Pencil} onClick={() => setEditing(true)}>{t("hr.profile.edit")}</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("hr.col.contact")}>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Mail className="size-4 text-ink-3" aria-hidden /><a href={`mailto:${e.email}`} className="hover:text-accent">{e.email}</a></li>
            {e.phone && <li className="flex items-center gap-2"><Phone className="size-4 text-ink-3" aria-hidden /><a href={`tel:${e.phone}`} className="hover:text-accent">{e.phone}</a></li>}
          </ul>
          <p className="mt-4 text-xs font-medium text-ink-2">{t("hr.profile.manager")}</p>
          <p className="text-sm">{e.manager ? <Link to={`/hr/employees/${e.manager.id}`} className="hover:underline">{fullName(e.manager)}</Link> : "—"}</p>
        </Card>
        <Card title={`${t("hr.profile.reports")} (${data.reports.length})`}>
          {data.reports.length === 0 ? <p className="text-sm text-ink-3">—</p> : (
            <ul className="max-h-60 space-y-1.5 overflow-y-auto text-sm">
              {data.reports.map((r) => <li key={r.id}><Link to={`/hr/employees/${r.id}`} className="font-medium hover:underline">{fullName(r)}</Link> <span className="text-ink-3">· {r.jobTitle}</span></li>)}
            </ul>
          )}
        </Card>
        {e.personnelNo && (
          <Card title={t("hr.profile.personnel")}>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-2">{t("hr.profile.personnelNo")}</dt><dd className="font-mono">{e.personnelNo}</dd>
              <dt className="text-ink-2">{t("hr.col.since")}</dt><dd>{e.hireDate ? formatDate(e.hireDate, lang) : "—"}</dd>
              <dt className="text-ink-2">{t("hr.profile.vacation")}</dt><dd>{e.vacationDays}</dd>
              <dt className="text-ink-2">{t("common.status")}</dt><dd><Badge tone={e.status === "ACTIVE" ? "green" : "neutral"}>{t(`employee.${e.status}`)}</Badge></dd>
              <dt className="text-ink-2">AD</dt><dd className="font-mono text-xs">{e.username}</dd>
            </dl>
          </Card>
        )}
      </div>
      {editing && <EditEmployee employee={e} open={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
