import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentLogDetail, AgentLogListResponse, AgentLogSummary, AgentStats } from '@lct/shared';
import { renderApp, signedIn } from '../test/utils';

const run = (fields: Partial<AgentLogSummary> & { id: string }): AgentLogSummary => ({
  agent: 'tutor',
  status: 'ok',
  problem: null,
  preview: 'A run',
  toolCallCount: 0,
  model: 'gemini-3.8-flash',
  inputTokens: 1_000,
  outputTokens: 200,
  durationMs: 2_300,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...fields,
});

const planRun = run({ id: 'r1', agent: 'planner', preview: 'Clear reviews first.', toolCallCount: 2, durationMs: 41_000 });
const failedRun = run({ id: 'r2', status: 'error', preview: 'Gemini is not responding right now' });
const tutorRun = run({ id: 'r3', preview: '“Any hint?”', problem: { id: 'p1', title: 'Two Sum' } });

const listOf = (...logs: AgentLogSummary[]): AgentLogListResponse => ({ logs, total: logs.length, page: 1, pages: 1 });

const stats: AgentStats[] = [
  { agent: 'post-mortem', runs: 0, errors: 0, inputTokens: 0, outputTokens: 0, avgDurationMs: 0 },
  // 2 successful tutor runs at 2.3 s and 1 planner run at 41 s: the overall average is weighted, 15.2 s.
  { agent: 'tutor', runs: 3, errors: 1, inputTokens: 2_000, outputTokens: 400, avgDurationMs: 2_300 },
  { agent: 'planner', runs: 1, errors: 0, inputTokens: 9_000, outputTokens: 3_000, avgDurationMs: 41_000 },
];

const planDetail: AgentLogDetail = {
  ...planRun,
  input: { minutesPerDay: 45 },
  toolCalls: [
    { name: 'get_overview', args: {}, result: { total: 20, dueNow: 16 } },
    { name: 'submit_plan', args: { days: 7 }, result: 'accepted' },
  ],
  output: { summary: 'Clear reviews first.' },
  error: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AI activity page', () => {
  it('lists runs with totals for the last 30 days', async () => {
    signedIn({ '/ai/logs': listOf(planRun, failedRun, tutorRun), '/ai/logs/stats': stats });
    renderApp('/ai-activity');

    expect(await screen.findByText('Clear reviews first.')).toBeInTheDocument();
    expect(screen.getByText('Gemini is not responding right now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Two Sum' })).toHaveAttribute('href', '/problems/p1');

    const totals = await screen.findByRole('table');
    const totalRow = within(totals).getByRole('rowheader', { name: 'Total' }).closest('tr')!;
    expect(within(totalRow).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4', '1', '14.4K', '15.2 s']);
  });

  it('opens a run to show its full trace', async () => {
    signedIn({ '/ai/logs': listOf(planRun), '/ai/logs/stats': stats, '/ai/logs/r1': planDetail });
    renderApp('/ai-activity');

    const head = await screen.findByRole('button', { name: /Clear reviews first/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');

    expect(await screen.findByText('get_overview')).toBeInTheDocument();
    expect(screen.getByText('submit_plan')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.8-flash')).toBeInTheDocument();
    expect(screen.getByText(/"minutesPerDay": 45/)).toBeInTheDocument();
  });

  it('filters by agent and result through the URL', async () => {
    const get = signedIn({ '/ai/logs': listOf(failedRun), '/ai/logs/stats': stats });
    renderApp('/ai-activity');
    await screen.findByText('Gemini is not responding right now');

    await userEvent.selectOptions(screen.getByLabelText('Agent'), 'tutor');
    await userEvent.selectOptions(screen.getByLabelText('Result'), 'error');
    expect(get).toHaveBeenLastCalledWith('/ai/logs', { params: expect.objectContaining({ agent: 'tutor', status: 'error' }) });
  });

  it('explains when there are no runs yet', async () => {
    signedIn({
      '/ai/logs': listOf(),
      '/ai/logs/stats': stats.map((s) => ({ ...s, runs: 0, errors: 0 })),
    });
    renderApp('/ai-activity');
    expect(await screen.findByText('No AI runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('AI usage in settings', () => {
  it("shows today's use of each agent and links to the activity page", async () => {
    signedIn({
      '/ai/usage': [
        { agent: 'post-mortem', used: 3, limit: 20, resetsAt: '2030-01-01T00:00:00.000Z' },
        { agent: 'tutor', used: 0, limit: 60, resetsAt: '2030-01-01T00:00:00.000Z' },
        { agent: 'planner', used: 5, limit: 5, resetsAt: '2030-01-01T00:00:00.000Z' },
      ],
    });
    renderApp('/settings');

    expect(await screen.findByRole('meter', { name: 'Weekly planner used today' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByText('3 of 20 used')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all AI runs' })).toHaveAttribute('href', '/ai-activity');
  });
});
