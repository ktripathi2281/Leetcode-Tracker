import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TIMEZONE_HEADER, type Problem, type ProblemListResponse } from '@lct/shared';
import { api } from '../api/client';
import { describeNextReview, isDueToday } from '../lib/format';
import { makeProblem, makeStats, mockPost, renderApp, signedIn } from '../test/utils';

const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();

const dueTwoSum = makeProblem({ status: 'Solved', nextReviewAt: daysFromNow(-2), lastSolvedAt: daysFromNow(-3), notes: 'Use a hash map' });
const dueLru = makeProblem({
  id: 'p2',
  title: 'LRU Cache',
  leetcodeNumber: 146,
  difficulty: 'Medium',
  status: 'Reviewing',
  reviewStep: 2,
  nextReviewAt: daysFromNow(-1),
  tags: ['Design'],
});
const listOf = (...problems: Problem[]): ProblemListResponse => ({ problems, total: problems.length, page: 1, pages: 1 });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('dates', () => {
  it('describes when the next review is', () => {
    const now = new Date(2026, 8, 26, 10, 0);
    expect(describeNextReview(new Date(2026, 8, 23, 9, 0).toISOString(), now)).toBe('Overdue by 3 days');
    expect(describeNextReview(new Date(2026, 8, 26, 22, 0).toISOString(), now)).toBe('Due today');
    expect(describeNextReview(new Date(2026, 8, 27, 1, 0).toISOString(), now)).toBe('Tomorrow');
    expect(describeNextReview(new Date(2026, 9, 2, 8, 0).toISOString(), now)).toBe('In 6 days');
    expect(isDueToday(new Date(2026, 8, 26, 23, 59).toISOString(), now)).toBe(true);
    expect(isDueToday(new Date(2026, 8, 27, 0, 1).toISOString(), now)).toBe(false);
  });
});

describe('dashboard', () => {
  it('shows the numbers, the due list and the charts', async () => {
    signedIn({
      '/stats/summary': makeStats({
        total: 10,
        byStatus: { Todo: 3, Attempted: 1, Solved: 4, Reviewing: 1, Mastered: 1 },
        byDifficulty: { Easy: { total: 4, solved: 3 }, Medium: { total: 5, solved: 3 }, Hard: { total: 1, solved: 0 } },
        dueNow: 2,
        dueThisWeek: 5,
        solvedThisWeek: 4,
      }),
      '/problems': listOf(dueTwoSum, dueLru),
    });
    renderApp('/');

    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(within(summary).getByRole('link', { name: /Due for review\s*2/ })).toHaveAttribute('href', '/reviews');
    expect(within(summary).getByText('of 10 tracked')).toBeInTheDocument();

    expect(await screen.findByRole('link', { name: 'Two Sum' })).toBeInTheDocument();
    expect(screen.getByText('Overdue by 2 days')).toBeInTheDocument();
    expect(screen.getByLabelText('Solved: 4 problems, 40%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Medium solved' })).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByText('3 of 5 solved')).toBeInTheDocument();

    // Nav shows how many are due.
    expect(screen.getByLabelText('2 due')).toBeInTheDocument();
  });

  it('invites you to start when nothing is tracked', async () => {
    signedIn();
    renderApp('/');
    expect(await screen.findByText('Start tracking your practice')).toBeInTheDocument();
  });

  it('sends the browser time zone with every request', async () => {
    let sent: string | undefined;
    await api.get('/anything', {
      // Capture the outgoing request instead of sending it.
      adapter: async (config) => {
        sent = config.headers[TIMEZONE_HEADER] as string;
        return { data: null, status: 200, statusText: 'OK', headers: {}, config };
      },
    });
    expect(sent).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('review session', () => {
  it('goes through due problems one at a time', async () => {
    let due = [dueTwoSum, dueLru];
    signedIn({
      '/problems': (params) => (params?.due ? listOf(...due) : listOf()),
      '/stats/summary': makeStats({ total: 2, dueNow: 2, dueThisWeek: 3 }),
    });
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/problems/p1/review': (body) => {
        due = due.filter((p) => p.id !== 'p1');
        return { ...dueTwoSum, status: 'Reviewing', reviewStep: 1, nextReviewAt: daysFromNow(3), outcome: body };
      },
      '/problems/p2/review': () => {
        due = [];
        return { ...dueLru, reviewStep: 0, nextReviewAt: daysFromNow(1) };
      },
    });
    renderApp('/reviews');

    expect(await screen.findByRole('heading', { name: '#1Two Sum' })).toBeInTheDocument();
    expect(screen.getByText('2 problems due')).toBeInTheDocument();
    expect(screen.getByText('Review 1 of 6 · after 1 day', { exact: false })).toBeInTheDocument();

    // Topics are a hint, hidden until asked for; notes are behind a disclosure.
    expect(screen.queryByText('Array')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show topics (hint)' }));
    expect(screen.getByText('Array')).toBeInTheDocument();
    expect(screen.getByText('Show my notes and solution')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'I solved it again' }));
    expect(api.post).toHaveBeenCalledWith('/problems/p1/review', { outcome: 'remembered' });
    expect(await screen.findByText('Nice. Next review of "Two Sum" in 3 days.')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: '#146LRU Cache' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I needed help' }));
    expect(api.post).toHaveBeenCalledWith('/problems/p2/review', { outcome: 'forgot' });
    expect(await screen.findByText('No problem. "LRU Cache" comes back tomorrow.')).toBeInTheDocument();

    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(screen.getByText('3 more reviews coming up this week.')).toBeInTheDocument();
  });

  it('can skip a problem and bring skipped ones back', async () => {
    signedIn({ '/problems': listOf(dueTwoSum), '/stats/summary': makeStats({ total: 1, dueNow: 1 }) });
    renderApp('/reviews');

    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show skipped problems' }));
    expect(await screen.findByRole('heading', { name: '#1Two Sum' })).toBeInTheDocument();
  });
});

describe('review card on the problem page', () => {
  it('lets you review a due problem', async () => {
    signedIn({ '/problems/p1': dueTwoSum });
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/problems/p1/review': { ...dueTwoSum, status: 'Reviewing', reviewStep: 1, nextReviewAt: daysFromNow(3) },
    });
    renderApp('/problems/p1');

    const section = await screen.findByRole('region', { name: 'Review' });
    expect(within(section).getByText('Overdue by 2 days')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'I solved it again' }));
    expect(await within(section).findByText('In 3 days')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'I solved it again' })).not.toBeInTheDocument();
  });

  it('explains when there is nothing to review', async () => {
    signedIn({ '/problems/p1': makeProblem({ status: 'Todo' }) });
    renderApp('/problems/p1');
    expect(await screen.findByText("Reviews start once you've solved it.")).toBeInTheDocument();
  });
});

describe('due filter on the problem list', () => {
  it('lists only problems due for review', async () => {
    const get = signedIn({
      '/problems': (params) => (params?.due ? listOf(dueTwoSum) : listOf(dueTwoSum, makeProblem({ id: 'p3', title: 'Unsolved' }))),
      '/problems/facets': { tags: [], companies: [] },
    });
    renderApp('/problems');
    await screen.findByText('Unsolved');

    await userEvent.click(screen.getByRole('button', { name: 'Due for review' }));
    expect(await screen.findByText('1 problem match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Due for review' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Sort by')).toBeDisabled();
    expect(get).toHaveBeenCalledWith('/problems', { params: expect.objectContaining({ due: true }) });
  });
});
