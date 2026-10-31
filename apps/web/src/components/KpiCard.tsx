import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { formatPercent } from "../lib/format";
import { clsx } from "./ui";

/**
 * A KPI tile: value, change vs. previous period, and a supporting line.
 * `goodWhen` decides whether up or down is coloured as an improvement (e.g. DSO: lower is better).
 */
export function KpiCard({ label, value, current, previous, goodWhen = "up", sub, mode = "relative" }: {
  label: string;
  value: ReactNode;
  current?: number | null;
  previous?: number | null;
  goodWhen?: "up" | "down";
  sub?: ReactNode;
  /** relative: % change; points: difference of two ratios in percentage points */
  mode?: "relative" | "points";
}) {
  const { t, lang } = useI18n();
  let delta: number | null = null;
  if (current != null && previous != null) {
    if (mode === "points") delta = current - previous;
    else if (previous !== 0) delta = (current - previous) / Math.abs(previous);
  }
  const flat = delta === null || Math.abs(delta) < 0.005;
  const good = !flat && (delta! > 0) === (goodWhen === "up");
  const Icon = flat ? Minus : delta! > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaText = delta === null ? null : mode === "points" ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1).replace(".", lang === "de" ? "," : ".")} pp` : `${delta > 0 ? "+" : ""}${formatPercent(delta, lang, Math.abs(delta) < 0.1 ? 1 : 0)}`;

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-card transition hover:shadow-pop sm:p-5">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-2xl font-semibold sm:text-[28px] tracking-tight tabular">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {deltaText && (
          <span className={clsx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", flat ? "bg-sunken text-ink-3" : good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400")}>
            <Icon className="size-3.5" aria-hidden />
            {deltaText}
            <span className="sr-only">{t("dash.vsPrevious")}</span>
          </span>
        )}
        {sub && <span className="text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}
