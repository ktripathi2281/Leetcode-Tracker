export const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ─── Calendar dates as YYYY-MM-DD strings ─────────────────────────────────────
// Date arithmetic on strings (via UTC) is exact: no time zone or DST can shift a day.

/** The user's calendar date for an instant, e.g. "2026-09-26". */
export function localDate(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

const fromDateString = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function addCalendarDays(date: string, days: number): string {
  return new Date(fromDateString(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days since the Monday on or before the date: 0 for Monday … 6 for Sunday. */
export const daysSinceMonday = (date: string) => (new Date(fromDateString(date)).getUTCDay() + 6) % 7;

/** Calendar date and time of an instant, as seen in a time zone. */
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/**
 * The instant the user's next calendar day begins, e.g. midnight tonight in Asia/Kolkata.
 * Reviews due before this count as "due today", so they appear from the morning rather
 * than at the exact hour. (Ignores a DST change falling within the same day.)
 */
export function startOfNextLocalDay(now: Date, timeZone: string): Date {
  const p = localParts(now, timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - offset);
}
