import { Bell, BriefcaseBusiness, Building2, Database, FileText, Gauge, Headset, LogOut, Menu, Moon, ScrollText, ShieldCheck, Sun, Users, CalendarDays, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelative } from "../lib/format";
import { useApi } from "../lib/hooks";
import { useI18n, type TKey } from "../lib/i18n";
import { useLiveEvent, useLiveStatus } from "../lib/live";
import type { Notification, Role } from "../lib/types";
import { clsx } from "./ui";

interface NavItem {
  to: string;
  label: TKey;
  icon: LucideIcon;
  roles?: Role[];
}
interface NavGroup {
  label?: TKey;
  items: NavItem[];
}

/** Navigation; items are hidden when the user lacks the role (the API enforces it as well). */
export const NAV: NavGroup[] = [
  { items: [{ to: "/", label: "nav.dashboard", icon: Gauge }] },
  { label: "nav.hr", items: [{ to: "/hr/employees", label: "nav.employees", icon: Users }, { to: "/hr/leave", label: "nav.leave", icon: CalendarDays }] },
  {
    label: "nav.sales",
    items: [
      { to: "/sales/pipeline", label: "nav.pipeline", icon: BriefcaseBusiness, roles: ["SALES", "MANAGER", "ACCOUNTING"] },
      { to: "/sales/customers", label: "nav.customers", icon: Building2, roles: ["SALES", "MANAGER", "ACCOUNTING", "AFTERSALES"] },
    ],
  },
  { label: "nav.aftersales", items: [{ to: "/after-sales/tickets", label: "nav.tickets", icon: Headset, roles: ["AFTERSALES", "MANAGER", "SALES"] }] },
  { label: "nav.accounting", items: [{ to: "/accounting/invoices", label: "nav.invoices", icon: FileText, roles: ["ACCOUNTING", "MANAGER"] }] },
  { label: "nav.data", items: [{ to: "/data/pipelines", label: "nav.pipelines", icon: Database, roles: ["ADMIN", "ACCOUNTING", "SALES"] }] },
  {
    label: "nav.admin",
    items: [
      { to: "/admin/audit", label: "nav.audit", icon: ScrollText, roles: ["ADMIN"] },
      { to: "/admin/privacy", label: "nav.privacy", icon: ShieldCheck },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("kompass.theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  return (
    <nav aria-label={t("shell.menu")} className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV.map((group, i) => {
        const items = group.items.filter((it) => !it.roles || can(...it.roles));
        if (!items.length) return null;
        return (
          <div key={i}>
            {group.label && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{t(group.label)}</p>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) => clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition lg:py-2", isActive ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink")}
                  >
                    <it.icon className="size-[18px]" aria-hidden /> {t(it.label)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Notifications() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, reload, setData } = useApi<{ items: Notification[]; unread: number }>("/notifications");
  useLiveEvent(["notification"], reload);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    reload();
    if (n.link) navigate(n.link);
  };
  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" });
    if (data) setData({ unread: 0, items: data.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) });
  };
  const unread = data?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label={`${t("shell.notifications")}${unread ? ` (${unread})` : ""}`} aria-expanded={open}>
        <Bell className="size-4.5" />
        {unread > 0 && <span aria-hidden className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white" data-testid="unread">{unread}</span>}
      </button>
      {open && (
        <div className="animate-pop-in fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-panel shadow-pop sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{t("shell.notifications")}</p>
            {unread > 0 && <button onClick={markAll} className="text-xs font-medium text-accent hover:underline">{t("shell.notifications.markAll")}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {!data?.items.length && <li className="px-3 py-6 text-center text-sm text-ink-3">{t("shell.notifications.empty")}</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className="block w-full px-4 py-3 text-start transition-colors hover:bg-sunken">
                  <p className={clsx("text-sm", !n.readAt && "font-semibold")}>
                    {!n.readAt && <span className="me-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden />}
                    {n.title}
                  </p>
                  {n.body && <p className="truncate text-xs text-ink-2">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-ink-3">{formatRelative(n.createdAt, lang)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Shell() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const live = useLiveStatus();
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);

  const brand = (
    <Link to="/" className="flex items-center gap-3 px-5 py-5">
      <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
      <span>
        <span className="block text-base font-semibold leading-tight text-ink">Kompass</span>
        <span className="block text-xs text-ink-3">Rheinwerk Gruppe</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:start-3 focus:top-3">{t("shell.skip")}</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line bg-nav lg:flex">
        {brand}
        <Sidebar />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-gray-950/50 backdrop-blur-sm" onClick={() => setMobile(false)} />
          <aside className="animate-slide-in absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-nav shadow-pop">
            <div className="flex items-center justify-between pe-3">{brand}<button onClick={() => setMobile(false)} className="rounded-lg p-2 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t("common.close")}><X className="size-5" /></button></div>
            <Sidebar onNavigate={() => setMobile(false)} />
            <div className="flex items-center gap-1 border-t border-line p-3 text-xs" role="group" aria-label={t("shell.language")}>
              {(["de", "en"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("flex-1 rounded-lg py-2 font-semibold uppercase", lang === l ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-sunken")}>{l}</button>
              ))}
            </div>
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-line bg-panel/85 px-3 backdrop-blur-md sm:gap-2 sm:px-6">
          <button onClick={() => setMobile(true)} className="rounded-lg p-2 text-ink-2 hover:bg-sunken lg:hidden" aria-label={t("shell.menu")}><Menu className="size-5" /></button>
          <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="Kompass"><img src="/favicon.svg" alt="" className="size-7 rounded-md" /><span className="hidden font-semibold min-[400px]:inline">Kompass</span></Link>
          <div className="flex-1" />
          <span className="me-2 hidden items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-xs text-ink-2 sm:flex" role="status" title={t(live ? "shell.live.on" : "shell.live.off")}>
            <span className={clsx("size-2 rounded-full", live ? "bg-emerald-500" : "animate-pulse bg-amber-500")} aria-hidden />
            {t(live ? "shell.live.on" : "shell.live.off")}
          </span>
          <div className="hidden items-center rounded-lg bg-sunken p-0.5 text-xs sm:flex" role="group" aria-label={t("shell.language")}>
            {(["de", "en"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("rounded-md px-2 py-1 font-semibold uppercase transition", lang === l ? "bg-panel text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>{l}</button>
            ))}
          </div>
          <button onClick={toggle} className="rounded-lg p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label={t(dark ? "shell.theme.light" : "shell.theme.dark")}>
            {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
          <Notifications />
          <div className="ms-1 flex items-center gap-2 border-s border-line ps-2 sm:ps-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent" aria-hidden>
              {user?.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="hidden text-sm leading-tight md:block">
              <span className="block font-medium">{user?.displayName}</span>
              <span className="block text-[11px] text-ink-3">{user?.roles.filter((r) => r !== "EMPLOYEE").join(" · ") || "Employee"}</span>
            </span>
            <button onClick={logout} className="rounded-lg p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label={t("shell.logout")} title={t("shell.logout")}>
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
