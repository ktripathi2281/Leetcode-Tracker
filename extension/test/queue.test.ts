import { describe, expect, it, vi } from 'vitest';
import type { ExtensionSubmission } from '@lct/shared';
import { checkConnection } from '../src/lib/api';
import { toastText } from '../src/lib/channel';
import { flushQueue, getHistory, queuedCount, submit, type Storage } from '../src/lib/queue';

const settings = { apiUrl: 'http://localhost:5173/api/', token: 'lct_abc' };
const sub = (id: string, slug = 'two-sum'): ExtensionSubmission => ({ slug, submissionId: id, lang: 'python3', code: 'x' });

function memoryStorage(): Storage {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => void data.set(key, structuredClone(value)),
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('sending submissions', () => {
  it('posts to the tracker with the token and records the result', async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => json(200, { problemId: 'p1', title: 'Two Sum', outcome: 'added' }));

    const result = await submit(storage, settings, sub('1'), fetchImpl);
    expect(result).toEqual({ ok: true, result: { problemId: 'p1', title: 'Two Sum', outcome: 'added' } });

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:5173/api/extension/submissions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lct_abc');
    expect(JSON.parse(init.body as string)).toEqual(sub('1'));
    expect((await getHistory(storage))[0]).toMatchObject({ title: 'Two Sum', outcome: 'added' });
  });

  it('queues a submission when the tracker is unreachable, and sends it later', async () => {
    const storage = memoryStorage();
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await submit(storage, settings, sub('1'), offline);
    expect(result).toMatchObject({ ok: false, retry: true });
    expect(await queuedCount(storage)).toBe(1);
    expect((await getHistory(storage))[0]).toMatchObject({ outcome: 'queued', title: 'Two sum' });

    const online = vi.fn(async () => json(200, { problemId: 'p1', title: 'Two Sum', outcome: 'added' }));
    expect(await flushQueue(storage, settings, online)).toBe(1);
    expect(await queuedCount(storage)).toBe(0);
    expect((await getHistory(storage))[0]).toMatchObject({ outcome: 'added' });
  });

  it('queues on server errors and rate limits, but not on rejections', async () => {
    const storage = memoryStorage();
    await submit(storage, settings, sub('1'), async () => json(502, { message: "Couldn't reach LeetCode" }));
    await submit(storage, settings, sub('2'), async () => json(429, { message: 'Too many' }));
    expect(await queuedCount(storage)).toBe(2);

    const rejected = await submit(storage, settings, sub('3'), async () => json(401, { message: 'Token revoked' }));
    expect(rejected).toEqual({ ok: false, message: 'Token revoked', retry: false });
    expect(await queuedCount(storage)).toBe(2);
    expect((await getHistory(storage))[0]).toMatchObject({ outcome: 'failed', message: 'Token revoked' });
  });

  it('does not queue the same submission twice', async () => {
    const storage = memoryStorage();
    const down = async () => json(503, {});
    await submit(storage, settings, sub('1'), down);
    await submit(storage, settings, sub('1'), down);
    expect(await queuedCount(storage)).toBe(1);
  });

  it('stops flushing at the first submission that still cannot go through, keeping order', async () => {
    const storage = memoryStorage();
    const down = async () => json(503, {});
    for (const id of ['1', '2', '3']) await submit(storage, settings, sub(id), down);

    let calls = 0;
    const flaky = vi.fn(async () => (++calls === 2 ? json(503, {}) : json(200, { problemId: 'p', title: 'T', outcome: 'solved' })));
    expect(await flushQueue(storage, settings, flaky)).toBe(1);
    expect(await queuedCount(storage)).toBe(2);
    const sentIds = flaky.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).submissionId);
    expect(sentIds).toEqual(['1', '2']);
  });
});

describe('checking the connection', () => {
  it('reports the signed-in user, or why it failed', async () => {
    expect(await checkConnection(settings, async () => json(200, { username: 'alice' }))).toEqual({ ok: true, username: 'alice' });
    expect(await checkConnection(settings, async () => json(401, { message: 'Token revoked' }))).toEqual({
      ok: false,
      message: 'Token revoked',
    });
  });
});

describe('the on-page message', () => {
  it('says what happened', () => {
    expect(toastText({ ok: true, outcome: 'reviewed', title: 'Two Sum' })).toBe('Review of “Two Sum” recorded ✓');
    expect(toastText({ ok: false, message: 'Not set up', needsSetup: true })).toMatch(/click the extension icon/);
    expect(toastText({ ok: false, message: 'Offline', queued: true })).toMatch(/will retry/);
  });
});
