// The extension's service worker: holds the settings, talks to the tracker, and retries
// submissions that couldn't be sent.
import type { ExtensionSubmission } from '@lct/shared';
import { checkConnection, type Settings } from './lib/api';
import type { ToastReply } from './lib/channel';
import { flushQueue, submit, type Storage } from './lib/queue';

/**
 * A quick shape check before sending. The tracker validates everything properly; this
 * keeps the extension small (no validation library) and drops obvious garbage early.
 */
function isSubmission(value: unknown): value is ExtensionSubmission {
  const v = value as Record<string, unknown> | null;
  return (
    !!v &&
    typeof v.slug === 'string' &&
    typeof v.submissionId === 'string' &&
    typeof v.lang === 'string' &&
    typeof v.code === 'string' &&
    v.code.length > 0
  );
}

const storage: Storage = {
  get: async <T>(key: string) => (await chrome.storage.local.get(key))[key] as T | undefined,
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
};

async function getSettings(): Promise<Settings | null> {
  const s = await storage.get<Settings>('settings');
  return s?.apiUrl && s.token ? s : null;
}

type Message =
  | { type: 'submission'; submission: unknown }
  | { type: 'test'; settings: Settings }
  | { type: 'retry' };

async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'submission': {
      // Only accept submissions reported from LeetCode's pages.
      if (!sender.url?.startsWith('https://leetcode.com/')) return { ok: false, message: 'Ignored' };
      const settings = await getSettings();
      if (!settings) return { ok: false, message: 'Not set up', needsSetup: true } satisfies ToastReply;
      if (!isSubmission(message.submission)) return { ok: false, message: "That submission didn't look right" } satisfies ToastReply;

      await flushQueue(storage, settings); // send older ones first
      const result = await submit(storage, settings, message.submission);
      return (
        result.ok
          ? { ok: true, outcome: result.result.outcome, title: result.result.title }
          : { ok: false, message: result.message, queued: result.retry }
      ) satisfies ToastReply;
    }
    case 'test':
      return checkConnection(message.settings);
    case 'retry': {
      const settings = await getSettings();
      return settings ? { sent: await flushQueue(storage, settings) } : { sent: 0 };
    }
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message, sender).then(sendResponse, (err: unknown) => sendResponse({ ok: false, message: String(err) }));
  return true; // answering asynchronously
});

// Retry queued submissions every few minutes.
const RETRY_ALARM = 'retry-queue';
chrome.runtime.onInstalled.addListener(() => void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 5 }));
chrome.runtime.onStartup.addListener(() => void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 5 }));
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RETRY_ALARM) return;
  const settings = await getSettings();
  if (settings) await flushQueue(storage, settings);
});
