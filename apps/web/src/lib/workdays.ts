/** Mirrors the API's working-day rule (weekends + NRW public holidays) for instant feedback in forms. */
const FIXED = ["01-01", "05-01", "10-03", "11-01", "12-25", "12-26"];

function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return Date.UTC(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

export function holidays(year: number) {
  const e = easter(year);
  return new Set([...FIXED.map((md) => `${year}-${md}`), ...[-2, 1, 39, 50, 60].map((n) => new Date(e + n * 86_400_000).toISOString().slice(0, 10))]);
}

export function countWorkingDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  let n = 0;
  const cache = new Map<number, Set<string>>();
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const y = d.getUTCFullYear();
    if (!cache.has(y)) cache.set(y, holidays(y));
    if (!cache.get(y)!.has(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}
