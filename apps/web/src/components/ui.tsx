import { clsx } from "clsx";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useI18n } from "../lib/i18n";

export { clsx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "border border-line bg-panel text-ink shadow-sm hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

export function Button({ variant = "secondary", busy, icon: Icon, size = "md", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; icon?: LucideIcon; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm sm:py-2",
        VARIANT[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

const control = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-base shadow-sm transition sm:py-2 sm:text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-sunken aria-[invalid=true]:border-red-600";

function FieldShell({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? <p id={`${id}-err`} className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p> : hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, error, ...props }: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input id={id} {...props} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={control} />
    </FieldShell>
  );
}

export function TextArea({ label, hint, ...props }: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea id={id} {...props} className={clsx(control, "min-h-24")} />
    </FieldShell>
  );
}

export function SelectField({ label, children, ...props }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <select id={id} {...props} className={control}>{children}</select>
    </FieldShell>
  );
}

/** Compact select for toolbars; label is visually hidden but available to screen readers. */
export function FilterSelect({ label, children, className, ...props }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={clsx("block", className)}>
      <span className="sr-only">{label}</span>
      <select {...props} className="w-full rounded-lg border border-line bg-panel py-2 ps-3 pe-8 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20">{children}</select>
    </label>
  );
}

export function SearchInput({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="relative block min-w-48 flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input type="search" placeholder={label} {...props} className="w-full rounded-lg border border-line bg-panel py-2 ps-9 pe-3 text-sm shadow-sm outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20" />
    </label>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx("overflow-hidden rounded-xl border border-line bg-panel shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={clsx(bodyClass ?? "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-3" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label ?? t("common.loading")}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-sunken", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-sunken"><Icon className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden /></span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{t("error.title")}</p>
        <p>{error.message}</p>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-2 sm:px-5" aria-label="Pagination">
      <span>{t("common.results", { n: total })}</span>
      <div className="flex items-center gap-2">
        <span>{t("common.page", { page, pages })}</span>
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("common.previous")} />
        <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("common.next")} />
      </div>
    </nav>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "start" | "end";
}

/** Accessible data table: real <table> semantics, caption for screen readers, optional row click. */
export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; caption: string; onRowClick?: (r: T) => void; empty?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-sunken/60 text-xs tracking-wide text-ink-3 uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={clsx("px-4 py-2.5 font-semibold whitespace-nowrap first:ps-5 last:pe-5", c.align === "end" ? "text-end" : "text-start", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <EmptyState title={t("common.empty")} />}</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={clsx("transition-colors", onRowClick && "cursor-pointer hover:bg-accent-soft/40")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx("px-4 py-3 align-middle first:ps-5 last:pe-5", c.align === "end" && "text-end tabular", c.className)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Modal built on <dialog>: focus trapping, Escape to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // jsdom lacks showModal/close, so fall back to the open attribute there.
    if (open && !d.open) {
      if (d.showModal) d.showModal();
      else d.setAttribute("open", "");
    }
    if (!open && d.open) {
      if (d.close) d.close();
      else d.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className={clsx("m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] rounded-2xl border border-line bg-panel p-0 text-ink shadow-pop backdrop:bg-gray-950/50 backdrop:backdrop-blur-sm", wide ? "max-w-2xl" : "max-w-lg")}
    >
      {open && (
        <>
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="dialog-title" className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </header>
          <div className="px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/40 px-5 py-3">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
