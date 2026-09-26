import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PLAN_DAYS, type PostMortem, type WeeklyPlan } from '@lct/shared';
import { api } from '../api/client';
import { apiError, makeProblem, mockPost, renderApp, signedIn } from '../test/utils';

const withCode = makeProblem({ code: 'def two_sum(nums, target): ...' });
const analysis: PostMortem = {
  timeComplexity: 'O(n): one pass',
  spaceComplexity: 'O(n): the map',
  isOptimal: false,
  assessment: 'Works, but scans twice.',
  betterApproach: 'Check the complement while inserting.',
  edgeCases: ['Duplicates: [3,3]'],
  keyTakeaway: 'Look up before you insert.',
  analyzedAt: new Date().toISOString(),
  current: true,
};
const usage = { agent: 'post-mortem', used: 1, limit: 20, resetsAt: '2030-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('solution analysis', () => {
  it('asks for code before it can analyze', async () => {
    signedIn({ '/problems/p1': makeProblem() });
    renderApp('/problems/p1');
    expect(await screen.findByText(/Add your solution code to get an AI review/)).toBeInTheDocument();
  });

  it('analyzes the solution and shows the result', async () => {
    signedIn({ '/problems/p1': withCode });
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/ai/post-mortem/p1': { problem: { ...withCode, postMortem: analysis }, usage },
    });
    renderApp('/problems/p1');

    const card = await screen.findByRole('region', { name: 'Solution analysis' });
    expect(await within(card).findByText('20 of 20 left today')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Analyze my solution' }));

    expect(await within(card).findByText('O(n): one pass')).toBeInTheDocument();
    expect(within(card).getByText('Can be improved')).toBeInTheDocument();
    expect(within(card).getByText('Check the complement while inserting.')).toBeInTheDocument();
    expect(within(card).getByText('Duplicates: [3,3]')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/ai/post-mortem/p1');
  });

  it('flags an analysis of older code', async () => {
    signedIn({ '/problems/p1': { ...withCode, postMortem: { ...analysis, current: false } } });
    renderApp('/problems/p1');
    expect(await screen.findByText('Your code has changed since this analysis.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze the new code' })).toBeInTheDocument();
  });

  it('shows the daily limit message', async () => {
    signedIn({ '/problems/p1': withCode });
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/ai/post-mortem/p1': () => apiError(429, { message: "You've used all 20 solution post-mortem runs for today." }),
    });
    renderApp('/problems/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze my solution' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You've used all 20");
  });
});

describe('tutor', () => {
  it('holds a hint conversation about the problem', async () => {
    signedIn({ '/problems/p1': withCode });
    const post = mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/ai/tutor/p1': (body) => ({
        reply: (body as { messages: unknown[] }).messages.length === 1 ? 'What have you tried?' : 'Good. What about duplicates?',
        usage,
      }),
    });
    renderApp('/problems/p1');

    await userEvent.click(await screen.findByRole('button', { name: 'Get hints' }));
    await userEvent.click(screen.getByRole('button', { name: "I don't know where to start" }));
    expect(await screen.findByText('What have you tried?')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Message to the tutor'), 'A hash map{Enter}');
    expect(await screen.findByText('Good. What about duplicates?')).toBeInTheDocument();
    expect(post).toHaveBeenLastCalledWith('/ai/tutor/p1', {
      messages: [
        { role: 'user', text: "I don't know where to start" },
        { role: 'tutor', text: 'What have you tried?' },
        { role: 'user', text: 'A hash map' },
      ],
      includeCode: true,
    });
  });

  it('can keep the code private', async () => {
    signedIn({ '/problems/p1': withCode });
    const post = mockPost({ '/leetcode/sync': { status: 'not-connected' }, '/ai/tutor/p1': { reply: 'Ok.', usage } });
    renderApp('/problems/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Get hints' }));
    await userEvent.click(screen.getByLabelText('Let the tutor read my saved code'));
    await userEvent.type(screen.getByLabelText('Message to the tutor'), 'Hi{Enter}');
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/ai/tutor/p1', expect.objectContaining({ includeCode: false })));
  });

  it('puts the message back if sending fails', async () => {
    signedIn({ '/problems/p1': withCode });
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/ai/tutor/p1': () => apiError(502, { message: 'Gemini is busy right now. Please try again in a minute.' }),
    });
    renderApp('/problems/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Get hints' }));
    await userEvent.type(screen.getByLabelText('Message to the tutor'), 'Help{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini is busy');
    expect(screen.getByLabelText('Message to the tutor')).toHaveValue('Help');
  });
});

describe('weekly plan', () => {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const start = PLAN_DAYS.indexOf(today as (typeof PLAN_DAYS)[number]);
  const plan: WeeklyPlan = {
    id: 'plan1',
    createdAt: new Date().toISOString(),
    summary: 'Clear your reviews and work on Two Pointers.',
    focusTopics: [{ topic: 'Two Pointers', why: 'You needed help twice' }],
    days: PLAN_DAYS.map((_, i) => PLAN_DAYS[(start + i) % 7]!).map((day, i) => ({
      day,
      minutes: 45,
      tasks:
        i === 0
          ? [
              { kind: 'review', title: 'Two Sum', problemId: 'p1', link: null, why: 'Due today' },
              { kind: 'new', title: '3Sum', problemId: null, link: 'https://leetcode.com/problems/3sum/', why: 'Two pointers' },
            ]
          : [],
    })),
  };

  it('makes a plan with the chosen time budget', async () => {
    signedIn();
    const post = mockPost({ '/leetcode/sync': { status: 'not-connected' }, '/ai/weekly-plan': { plan, usage } });
    renderApp('/plan');

    expect(await screen.findByText('No plan yet')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Time per day'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Plan my week' }));

    expect(await screen.findByText('Clear your reviews and work on Two Pointers.')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/ai/weekly-plan', { minutesPerDay: 45 });

    const todayCard = screen.getByText('Today').closest('li')!;
    expect(within(todayCard).getByRole('link', { name: 'Two Sum' })).toHaveAttribute('href', '/problems/p1');
    expect(within(todayCard).getByRole('link', { name: '3Sum ↗' })).toHaveAttribute('href', 'https://leetcode.com/problems/3sum/');
    expect(screen.getAllByText('Rest')).toHaveLength(6);
  });

  it("shows today's tasks on the dashboard", async () => {
    signedIn({
      '/ai/weekly-plan/latest': { plan },
      '/stats/summary': {
        total: 1,
        byStatus: { Todo: 1, Attempted: 0, Solved: 0, Reviewing: 0, Mastered: 0 },
        byDifficulty: { Easy: { total: 1, solved: 0 }, Medium: { total: 0, solved: 0 }, Hard: { total: 0, solved: 0 } },
        dueNow: 0,
        dueThisWeek: 0,
        solvedThisWeek: 0,
      },
    });
    renderApp('/');
    const card = await screen.findByRole('region', { name: "Today's plan" });
    expect(await within(card).findByRole('link', { name: 'Two Sum' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Full week' })).toHaveAttribute('href', '/plan');
  });
});
