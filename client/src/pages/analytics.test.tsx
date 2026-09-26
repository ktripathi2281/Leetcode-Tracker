import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActivityDay, ActivityStats, TopicStats } from '@lct/shared';
import { renderApp, signedIn } from '../test/utils';

/** 12 Monday-aligned weeks ending today (a Wednesday, so the last week is partial). */
function makeActivity(overrides: Partial<ActivityStats> = {}): ActivityStats {
  const days: ActivityDay[] = [];
  const start = new Date(2026, 6, 6); // a Monday
  for (let i = 0; i < 11 * 7 + 3; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ date, solves: 0, reviews: 0 });
  }
  days[0]!.solves = 2; // first week: 2 solves
  days[days.length - 1]!.solves = 1; // this week: 1 solve, 3 reviews
  days[days.length - 1]!.reviews = 3;
  return { days, currentStreak: 1, longestStreak: 4, ...overrides };
}

const topic = (t: Partial<TopicStats> & { topic: string }): TopicStats => ({
  total: 0,
  unsolved: 0,
  practicing: 0,
  mastered: 0,
  neededHelp: 0,
  ...t,
});

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderAnalytics(routes: Record<string, object> = {}) {
  signedIn({
    '/stats/activity': makeActivity(),
    '/stats/topics': [],
    '/stats/companies': [],
    ...routes,
  });
  renderApp('/analytics');
}

describe('analytics', () => {
  it('summarizes activity and streaks, with a table view of the weekly chart', async () => {
    renderAnalytics();
    expect(await screen.findByText('Solved in 12 weeks')).toBeInTheDocument();
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Solved in 12 weeks')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Reviews in 12 weeks')).getByText('3')).toBeInTheDocument();
    expect(tile('Current streak')).toHaveTextContent('1 day');
    expect(tile('Longest streak')).toHaveTextContent('4 days');

    await userEvent.click(screen.getByText('Show as table'));
    const rows = within(screen.getByRole('table', { name: '' })).getAllByRole('row');
    expect(rows).toHaveLength(13); // header + 12 weeks
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '0']);
    expect(within(rows[12]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '3']);
  });

  it('shows topic progress and what needs attention', async () => {
    renderAnalytics({
      '/stats/topics': [
        topic({ topic: 'Array', total: 5, unsolved: 1, practicing: 2, mastered: 2, neededHelp: 3 }),
        topic({ topic: 'Graph', total: 2, unsolved: 2 }),
        topic({ topic: 'Stack', total: 1, practicing: 1, neededHelp: 1 }),
      ],
    });

    const attention = await screen.findByText('Needs attention:');
    expect(attention.parentElement).toHaveTextContent('Needs attention: Array (needed help 3×), Stack (needed help 1×)');

    const row = screen.getByRole('rowheader', { name: 'Array' }).closest('tr')!;
    expect(within(row).getByLabelText('Array: 2 mastered, 2 practising, 1 unsolved')).toBeInTheDocument();
    expect(within(row).getByText('4/5')).toBeInTheDocument();
    expect(within(row).getByText('3×')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Array' })).toHaveAttribute('href', '/problems?tag=Array');
  });

  it('shows the first 10 topics, with a button for the rest', async () => {
    const many = Array.from({ length: 13 }, (_, i) => topic({ topic: `Topic ${i + 1}`, total: 13 - i, unsolved: 13 - i }));
    renderAnalytics({ '/stats/topics': many });

    expect(await screen.findByRole('link', { name: 'Topic 10' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Topic 11' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 13 topics' }));
    expect(screen.getByRole('link', { name: 'Topic 13' })).toBeInTheDocument();
  });

  it('shows readiness per company', async () => {
    renderAnalytics({ '/stats/companies': [{ company: 'Google', total: 4, solved: 3 }] });
    expect(await screen.findByText('3 of 4 problems solved · 75%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Google readiness' })).toHaveAttribute('aria-valuenow', '3');
  });

  it('explains empty sections', async () => {
    renderAnalytics();
    expect(await screen.findByText('No topics yet')).toBeInTheDocument();
    expect(screen.getByText('No company tags yet')).toBeInTheDocument();
  });
});
