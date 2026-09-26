// Settings popup: the tracker's API address and the access token, plus recent activity.
import type { Settings } from './lib/api';
import type { HistoryEntry } from './lib/queue';

const DEFAULT_API_URL = 'http://localhost:5173/api';
const OUTCOMES: Record<HistoryEntry['outcome'], string> = {
  added: 'Added',
  solved: 'Marked solved',
  reviewed: 'Review recorded',
  resolved: 'New solution saved',
  duplicate: 'Already up to date',
  queued: 'Waiting to retry',
  failed: 'Not saved',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('settings');
const apiUrl = $<HTMLInputElement>('apiUrl');
const token = $<HTMLInputElement>('token');
const status = $<HTMLParagraphElement>('status');
const history = $<HTMLUListElement>('history');
const retry = $<HTMLButtonElement>('retry');

function setStatus(text: string, tone?: 'good' | 'bad') {
  status.textContent = text;
  status.className = tone ?? '';
}

/** localhost is allowed up front; any other address asks for permission, as Chrome requires. */
async function ensurePermission(url: string): Promise<boolean> {
  const origin = `${new URL(url).origin}/*`;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings: Settings = { apiUrl: apiUrl.value.trim().replace(/\/+$/, ''), token: token.value.trim() };
  if (!/^https?:\/\/.+/.test(settings.apiUrl)) return setStatus('Enter the API address, starting with http:// or https://', 'bad');
  if (!settings.token.startsWith('lct_')) return setStatus('Paste the access token from the tracker (it starts with lct_)', 'bad');

  const button = form.querySelector('button')!;
  button.disabled = true;
  setStatus('Checking…');
  try {
    if (!(await ensurePermission(settings.apiUrl))) return setStatus('The extension needs permission to reach that address.', 'bad');
    const result = (await chrome.runtime.sendMessage({ type: 'test', settings })) as
      | { ok: true; username: string }
      | { ok: false; message: string };
    if (result.ok) {
      await chrome.storage.local.set({ settings });
      setStatus(`Connected as ${result.username} ✓`, 'good');
    } else {
      setStatus(result.message, 'bad');
    }
  } finally {
    button.disabled = false;
  }
});

retry.addEventListener('click', async () => {
  retry.disabled = true;
  await chrome.runtime.sendMessage({ type: 'retry' });
  retry.disabled = false;
  await render();
});

async function render() {
  const stored = await chrome.storage.local.get(['settings', 'history', 'queue']);
  const settings = stored.settings as Settings | undefined;
  apiUrl.value ||= settings?.apiUrl ?? DEFAULT_API_URL;
  token.value ||= settings?.token ?? '';
  if (!settings) setStatus('Not connected yet.');

  const entries = (stored.history as HistoryEntry[] | undefined) ?? [];
  history.replaceChildren(
    ...(entries.length
      ? entries.map((entry) => {
          const li = document.createElement('li');
          li.className = entry.outcome;
          const what = document.createElement('div');
          what.className = 'what';
          what.textContent = `${OUTCOMES[entry.outcome]}: ${entry.title}`;
          const when = document.createElement('div');
          when.className = 'when';
          when.textContent = new Date(entry.at).toLocaleString() + (entry.message ? ` · ${entry.message}` : '');
          li.append(what, when);
          return li;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'Accepted solutions will show up here.' })]),
  );
  retry.hidden = ((stored.queue as unknown[] | undefined) ?? []).length === 0;
}

void render();
