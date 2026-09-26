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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
