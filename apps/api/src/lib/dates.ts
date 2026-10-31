/** Fixed public holidays in North Rhine-Westphalia (month-day). Movable feasts are computed below. */
const FIXED_HOLIDAYS = ["01-01", "05-01", "10-03", "11-01", "12-25", "12-26"];

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function holidaysNRW(year: number): Set<string> {
  const easter = easterSunday(year);
  // Good Friday, Easter Monday, Ascension, Whit Monday, Corpus Christi
  const movable = [-2, 1, 39, 50, 60].map((n) => iso(addDays(easter, n)));
  return new Set([...FIXED_HOLIDAYS.map((md) => `${year}-${md}`), ...movable]);
}

/** Working days between two dates (inclusive), excluding weekends and NRW public holidays. */
export function workingDaysBetween(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const cache = new Map<number, Set<string>>();
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const y = d.getUTCFullYear();
    if (!cache.has(y)) cache.set(y, holidaysNRW(y));
    if (!cache.get(y)!.has(iso(d))) count++;
  }
  return count;
}

export const toDateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
