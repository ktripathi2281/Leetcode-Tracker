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
