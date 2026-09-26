import { SYNC_WINDOW_DAYS, type SyncResult } from '@lct/shared';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "just now", "5 minutes ago", "yesterday", then a date after a week. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (Math.abs(seconds) < 60) return 'just now';
  if (Math.abs(seconds) >= 7 * 86_400) return formatDate(iso);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole calendar days from today to the date (0 = today, negative = past), in local time. */
function calendarDaysFromToday(iso: string, now: Date) {
  return Math.round((startOfLocalDay(new Date(iso)).getTime() - startOfLocalDay(now).getTime()) / 86_400_000);
}

/** Due by the end of today, like the server's due list. */
export const isDueToday = (iso: string | null, now = new Date()) => iso !== null && calendarDaysFromToday(iso, now) <= 0;

/** "Due today", "Overdue by 3 days", "Tomorrow", "In 6 days". */
export function describeNextReview(iso: string, now = new Date()): string {
  const days = calendarDaysFromToday(iso, now);
  if (days < 0) return `Overdue by ${plural(-days, 'day')}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function describeSyncResult(r: SyncResult): string {
  const changes: string[] = [];
  if (r.added) changes.push(`${plural(r.added, 'new problem')} added`);
  if (r.updated) changes.push(`${r.updated} updated`);
  const summary = changes.length ? changes.join(', ') : 'Already up to date';

  const notes: string[] = [];
  if (r.tooOld) notes.push(`${r.tooOld} older than ${Math.round(SYNC_WINDOW_DAYS / 30)} months skipped`);
  if (r.failed) notes.push(`${r.failed} couldn't be loaded`);
  return notes.length ? `${summary} (${notes.join('; ')})` : summary;
}
