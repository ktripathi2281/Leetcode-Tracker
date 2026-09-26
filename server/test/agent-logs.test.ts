import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_LOG_RETENTION_DAYS, type AgentLogDetail, type AgentLogSummary, type AgentStats } from '@lct/shared';
import { createApp } from '../src/app.js';
import { AgentLog } from '../src/models/AgentLog.js';
import { AiUnavailableError } from '../src/lib/ai/client.js';
import { fakeAi } from './fakeAi.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000, aiBurstLimit: 1000 });

afterEach(() => vi.restoreAllMocks());

type User = Awaited<ReturnType<typeof signUp>>;

const analysis = {
  timeComplexity: 'O(n): one pass',
  spaceComplexity: 'O(n)',
  isOptimal: false,
  assessment: 'Fine.',
  betterApproach: 'Use a set.',
  edgeCases: [],
  keyTakeaway: 'Sets are fast.',
};

/** A user with one run of each kind: a tutor reply, a post-mortem, a failed tutor call, and a plan. */
async function withRuns(): Promise<{ alice: User; problemId: string }> {
  const alice = await signUp(app);
  const { body: p } = await alice.post('/api/problems', { title: 'Two Sum', difficulty: 'Easy', code: 'x = 1' });

  fakeAi(
    'What have you tried?',
    { json: analysis },
    new AiUnavailableError(),
    { calls: [{ id: 'c1', name: 'get_overview', args: {} }] },
    {
      calls: [
        {
          id: 'c2',
          name: 'submit_plan',
          args: {
            summary: 'Review, then practise arrays.',
            focusTopics: [],
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
              day,
              minutes: 30,
              tasks: [],
            })),
          },
        },
      ],
    },
  );
  await alice.post(`/api/ai/tutor/${p.id}`, { messages: [{ role: 'user', text: 'Any hint?' }] });
  await alice.post(`/api/ai/post-mortem/${p.id}`);
  await alice.post(`/api/ai/tutor/${p.id}`, { messages: [{ role: 'user', text: 'Again?' }] });
  await alice.post('/api/ai/weekly-plan', {});
  return { alice, problemId: p.id };
}

const list = async (u: User, query = '') => (await u.get(`/api/ai/logs${query}`)).body as { logs: AgentLogSummary[]; total: number; pages: number };

describe('GET /api/ai/logs', () => {
  it('lists runs newest first, with a preview of each', async () => {
    const { alice, problemId } = await withRuns();
    const { logs, total } = await list(alice);

    expect(total).toBe(4);
    expect(logs.map((l) => [l.agent, l.status, l.preview])).toEqual([
      ['planner', 'ok', 'Review, then practise arrays.'],
      ['tutor', 'error', 'Gemini is not responding right now'],
      ['post-mortem', 'ok', 'O(n): one pass · can be improved'],
      ['tutor', 'ok', '“Any hint?”'],
    ]);
    expect(logs[3]).toMatchObject({ problem: { id: problemId, title: 'Two Sum' }, model: 'fake-model', inputTokens: 100 });
    expect(logs[0]!.toolCallCount).toBe(2);
    expect(logs[0]).not.toHaveProperty('output');
  });

  it('filters by agent and status, and pages', async () => {
    const { alice } = await withRuns();
    expect((await list(alice, '?agent=tutor')).total).toBe(2);
    expect((await list(alice, '?status=error')).logs.map((l) => l.agent)).toEqual(['tutor']);

    const page2 = await list(alice, '?limit=3&page=2');
    expect(page2.logs).toHaveLength(1);
    expect(page2.pages).toBe(2);
    expect((await alice.get('/api/ai/logs?agent=robot')).status).toBe(400);
  });

  it('only shows your own runs', async () => {
    await withRuns();
    const bob = await signUp(app);
    expect((await list(bob)).total).toBe(0);
  });

  it('keeps a run whose problem was deleted', async () => {
    const { alice, problemId } = await withRuns();
    await alice.delete(`/api/problems/${problemId}`);
    const { logs } = await list(alice, '?agent=post-mortem');
    expect(logs[0]!.problem).toBeNull();
    expect(logs[0]!.preview).toContain('O(n)');
  });
});

describe('GET /api/ai/logs/:id', () => {
  it('returns the full trace of a run', async () => {
    const { alice } = await withRuns();
    const planRun = (await list(alice, '?agent=planner')).logs[0]!;
    const { body } = await alice.get(`/api/ai/logs/${planRun.id}`);
    const detail = body as AgentLogDetail;

    expect(detail.input).toEqual({ minutesPerDay: 60 });
    expect(detail.toolCalls.map((t) => t.name)).toEqual(['get_overview', 'submit_plan']);
    expect(detail.toolCalls[0]!.result).toMatchObject({ total: 1 });
    expect(detail.output).toMatchObject({ summary: 'Review, then practise arrays.' });
    expect(detail.error).toBeNull();
  });

  it('includes the error of a failed run', async () => {
    const { alice } = await withRuns();
    const failed = (await list(alice, '?status=error')).logs[0]!;
    expect((await alice.get(`/api/ai/logs/${failed.id}`)).body.error).toBe('Gemini is not responding right now');
  });

  it('hides other users’ runs', async () => {
    const { alice } = await withRuns();
    const bob = await signUp(app);
    const run = (await list(alice)).logs[0]!;
    expect((await bob.get(`/api/ai/logs/${run.id}`)).status).toBe(404);
    expect((await alice.get('/api/ai/logs/not-an-id')).status).toBe(404);
  });
});

describe('GET /api/ai/logs/stats', () => {
  it('totals runs, failures, tokens and speed per agent', async () => {
    const { alice } = await withRuns();
    const stats = (await alice.get('/api/ai/logs/stats')).body as AgentStats[];
    const tutor = stats.find((s) => s.agent === 'tutor')!;
    expect(tutor).toMatchObject({ runs: 2, errors: 1, inputTokens: 100, outputTokens: 50 });
    expect(stats.find((s) => s.agent === 'planner')).toMatchObject({ runs: 1, inputTokens: 200, outputTokens: 100 });
    expect(stats.map((s) => s.agent)).toEqual(['post-mortem', 'tutor', 'planner']);
  });

  it('ignores runs older than 30 days', async () => {
    const { alice } = await withRuns();
    // Via the driver: Mongoose won't let createdAt change.
    await AgentLog.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    const stats = (await alice.get('/api/ai/logs/stats')).body as AgentStats[];
    expect(stats.every((s) => s.runs === 0)).toBe(true);
  });
});

describe('retention', () => {
  it('has MongoDB delete runs after the retention period', async () => {
    const indexes = await AgentLog.collection.indexes();
    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.key).toEqual({ createdAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(AGENT_LOG_RETENTION_DAYS * 86_400);
  });
});
