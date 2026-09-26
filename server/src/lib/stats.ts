import type { Types } from 'mongoose';
import {
  ACTIVITY_WEEKS,
  DIFFICULTIES,
  STATUSES,
  STRUGGLE_WINDOW_DAYS,
  type ActivityDay,
  type ActivityStats,
  type CompanyStats,
  type Difficulty,
  type Status,
  type StatsSummary,
  type TopicStats,
} from '@lct/shared';
import { Activity } from '../models/Activity.js';
import { Problem } from '../models/Problem.js';
import { DAY_MS, addCalendarDays, addDays, daysSinceMonday, localDate, startOfNextLocalDay } from './time.js';

// Every query takes the user as an ObjectId: aggregation $match doesn't convert strings,
// so a string ID would silently match nothing.

const UNSOLVED: Status[] = ['Todo', 'Attempted'];
const countIf = (condition: object) => ({ $sum: { $cond: [condition, 1, 0] } });

export async function getSummary(user: Types.ObjectId, timeZone: string, now = new Date()): Promise<StatsSummary> {
  const endOfToday = startOfNextLocalDay(now, timeZone);
  const scheduledBefore = (date: Date) => ({ user, nextReviewAt: { $ne: null, $lt: date } });

  const [groups, dueNow, dueThisWeek, solvedThisWeek] = await Promise.all([
    Problem.aggregate<{ _id: { status: Status; difficulty: Difficulty }; count: number }>([
      { $match: { user } },
      { $group: { _id: { status: '$status', difficulty: '$difficulty' }, count: { $sum: 1 } } },
    ]),
    Problem.countDocuments(scheduledBefore(endOfToday)),
    Problem.countDocuments(scheduledBefore(addDays(endOfToday, 6))),
    Problem.countDocuments({ user, lastSolvedAt: { $gte: addDays(now, -7) } }),
  ]);

  const summary: StatsSummary = {
    total: 0,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatsSummary['byStatus'],
    byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, { total: 0, solved: 0 }])) as StatsSummary['byDifficulty'],
    dueNow,
    dueThisWeek,
    solvedThisWeek,
  };
  for (const { _id, count } of groups) {
    summary.total += count;
    summary.byStatus[_id.status] += count;
    summary.byDifficulty[_id.difficulty].total += count;
    if (!UNSOLVED.includes(_id.status)) summary.byDifficulty[_id.difficulty].solved += count;
  }
  return summary;
}

/** Solves and reviews per day in the user's calendar, plus streaks. */
export async function getActivityStats(user: Types.ObjectId, timeZone: string, now = new Date()): Promise<ActivityStats> {
  const today = localDate(now, timeZone);
  const chartStart = addCalendarDays(today, -daysSinceMonday(today) - (ACTIVITY_WEEKS - 1) * 7);
  const yearStart = addCalendarDays(today, -365);

  const rows = await Activity.aggregate<{ _id: { date: string; kind: 'solve' | 'review' }; count: number }>([
    // A day's margin either side of the year covers any time zone offset; dates are exact below.
    { $match: { user, at: { $gte: addDays(now, -367) } } },
    {
      $group: {
        _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: timeZone } }, kind: '$kind' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map<string, ActivityDay>();
  for (const { _id, count } of rows) {
    const day = byDate.get(_id.date) ?? { date: _id.date, solves: 0, reviews: 0 };
    if (_id.kind === 'solve') day.solves += count;
    else day.reviews += count;
    byDate.set(_id.date, day);
  }

  const days: ActivityDay[] = [];
  for (let date = chartStart; date <= today; date = addCalendarDays(date, 1)) {
    days.push(byDate.get(date) ?? { date, solves: 0, reviews: 0 });
  }

  // Streaks over the last year. Today still counts as "in progress" if empty.
  const active = (date: string) => byDate.has(date);
  let longestStreak = 0;
  let run = 0;
  for (let date = yearStart; date <= today; date = addCalendarDays(date, 1)) {
    run = active(date) ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  let currentStreak = 0;
  let date = active(today) ? today : addCalendarDays(today, -1);
  while (date >= yearStart && active(date)) {
    currentStreak++;
    date = addCalendarDays(date, -1);
  }

  return { days, currentStreak, longestStreak };
}

/** Per topic: how many problems are unsolved, being practised, or mastered, and recent struggles. */
export async function getTopicStats(user: Types.ObjectId, now = new Date()): Promise<TopicStats[]> {
  const [counts, struggles] = await Promise.all([
    Problem.aggregate<{ _id: string; total: number; unsolved: number; mastered: number }>([
      { $match: { user } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          total: { $sum: 1 },
          unsolved: countIf({ $in: ['$status', UNSOLVED] }),
          mastered: countIf({ $eq: ['$status', 'Mastered'] }),
        },
      },
    ]),
    Activity.aggregate<{ _id: string; count: number }>([
      { $match: { user, kind: 'review', outcome: 'forgot', at: { $gte: new Date(now.getTime() - STRUGGLE_WINDOW_DAYS * DAY_MS) } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]),
  ]);

  const neededHelp = new Map(struggles.map((s) => [s._id, s.count]));
  return counts
    .map((c) => ({
      topic: c._id,
      total: c.total,
      unsolved: c.unsolved,
      practicing: c.total - c.unsolved - c.mastered,
      mastered: c.mastered,
      neededHelp: neededHelp.get(c._id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic));
}

/** Per company tag: how many of its problems are solved. */
export async function getCompanyStats(user: Types.ObjectId): Promise<CompanyStats[]> {
  const rows = await Problem.aggregate<{ _id: string; total: number; solved: number }>([
    { $match: { user } },
    { $unwind: '$companyTags' },
    { $group: { _id: '$companyTags', total: { $sum: 1 }, solved: countIf({ $not: [{ $in: ['$status', UNSOLVED] }] }) } },
  ]);
  return rows
    .map((r) => ({ company: r._id, total: r.total, solved: r.solved }))
    .sort((a, b) => b.total - a.total || a.company.localeCompare(b.company));
}
