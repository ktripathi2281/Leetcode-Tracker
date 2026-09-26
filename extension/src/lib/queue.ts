import type { ExtensionSubmission, ExtensionSubmissionResult } from '@lct/shared';
import { sendSubmission, type SendResult, type Settings } from './api';

// Submissions that couldn't be sent (tracker offline, LeetCode down) wait here and are
// retried later, so an accepted solution isn't lost. Storage is injected for testing.

export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface HistoryEntry {
  title: string;
  slug: string;
  outcome: ExtensionSubmissionResult['outcome'] | 'queued' | 'failed';
  message?: string;
  at: string;
}

const QUEUE_KEY = 'queue';
const HISTORY_KEY = 'history';
const MAX_QUEUE = 50;
const MAX_HISTORY = 10;

async function remember(storage: Storage, entry: HistoryEntry) {
  const history = (await storage.get<HistoryEntry[]>(HISTORY_KEY)) ?? [];
  await storage.set(HISTORY_KEY, [entry, ...history].slice(0, MAX_HISTORY));
}

const titleOf = (slug: string) => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Sends a submission; if it can be retried, queues it instead of dropping it. */
export async function submit(storage: Storage, settings: Settings, submission: ExtensionSubmission, fetchImpl?: typeof fetch): Promise<SendResult> {
  const result = await sendSubmission(settings, submission, fetchImpl);
  const at = new Date().toISOString();

  if (result.ok) {
    await remember(storage, { title: result.result.title, slug: submission.slug, outcome: result.result.outcome, at });
  } else if (result.retry) {
    const queue = (await storage.get<ExtensionSubmission[]>(QUEUE_KEY)) ?? [];
    if (!queue.some((q) => q.submissionId === submission.submissionId)) {
      await storage.set(QUEUE_KEY, [...queue, submission].slice(-MAX_QUEUE));
    }
    await remember(storage, { title: titleOf(submission.slug), slug: submission.slug, outcome: 'queued', message: result.message, at });
  } else {
    await remember(storage, { title: titleOf(submission.slug), slug: submission.slug, outcome: 'failed', message: result.message, at });
  }
  return result;
}

/** Retries queued submissions in order; stops at the first that still can't go through. */
export async function flushQueue(storage: Storage, settings: Settings, fetchImpl?: typeof fetch): Promise<number> {
  const queue = (await storage.get<ExtensionSubmission[]>(QUEUE_KEY)) ?? [];
  let sent = 0;
  while (queue.length > 0) {
    const result = await sendSubmission(settings, queue[0]!, fetchImpl);
    if (!result.ok && result.retry) break;
    const done = queue.shift()!;
    sent++;
    await remember(storage, {
      title: result.ok ? result.result.title : titleOf(done.slug),
      slug: done.slug,
      outcome: result.ok ? result.result.outcome : 'failed',
      message: result.ok ? undefined : result.message,
      at: new Date().toISOString(),
    });
  }
  await storage.set(QUEUE_KEY, queue);
  return sent;
}

export const queuedCount = async (storage: Storage) => ((await storage.get<unknown[]>(QUEUE_KEY)) ?? []).length;
export const getHistory = async (storage: Storage) => (await storage.get<HistoryEntry[]>(HISTORY_KEY)) ?? [];
