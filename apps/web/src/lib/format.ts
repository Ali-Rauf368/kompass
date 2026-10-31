import type { Lang } from "./i18n";

const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-GB");

export const formatEur = (value: number, lang: Lang, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts.compact || Math.abs(value) >= 1000 ? 0 : 2,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);

export const formatCents = (cents: number, lang: Lang) => formatEur(cents / 100, lang);

export const formatNumber = (value: number, lang: Lang, digits = 0) =>
  new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export const formatPercent = (value: number, lang: Lang, digits = 0) =>
  new Intl.NumberFormat(locale(lang), { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export const formatDate = (iso: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

export const formatDateTime = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const formatMonth = (yyyyMm: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${yyyyMm}-01T00:00:00Z`));

/** "in 3 h", "2 days ago" */
export function formatRelative(iso: string, lang: Lang, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export const fullName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : "—");
