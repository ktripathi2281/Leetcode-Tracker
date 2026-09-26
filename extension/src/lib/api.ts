import type { ApiError, ExtensionMe, ExtensionSubmission, ExtensionSubmissionResult } from '@lct/shared';

export interface Settings {
  /** Base address of the tracker's API, e.g. http://localhost:5173/api */
  apiUrl: string;
  token: string;
}

export type SendResult =
  | { ok: true; result: ExtensionSubmissionResult }
  /** retry: worth trying again later (server or LeetCode down, rate limited, offline). */
  | { ok: false; message: string; retry: boolean };

const endpoint = (settings: Settings, path: string) => `${settings.apiUrl.replace(/\/+$/, '')}/extension${path}`;

async function call<T>(settings: Settings, path: string, init: RequestInit, fetchImpl: typeof fetch) {
  let res: Response;
  try {
    res = await fetchImpl(endpoint(settings, path), {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}`, ...init.headers },
    });
  } catch {
    return { ok: false as const, message: "Can't reach the tracker. Is it running, and is the API address right?", retry: true };
  }
  const body = (await res.json().catch(() => null)) as (T & ApiError) | null;
  if (res.ok) return { ok: true as const, body: body as T };
  return {
    ok: false as const,
    message: body?.message ?? `The tracker answered with an error (${res.status})`,
    retry: res.status === 429 || res.status >= 500,
  };
}

export async function sendSubmission(settings: Settings, submission: ExtensionSubmission, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const res = await call<ExtensionSubmissionResult>(settings, '/submissions', { method: 'POST', body: JSON.stringify(submission) }, fetchImpl);
  return res.ok ? { ok: true, result: res.body } : res;
}

export async function checkConnection(settings: Settings, fetchImpl: typeof fetch = fetch) {
  const res = await call<ExtensionMe>(settings, '/me', { method: 'GET' }, fetchImpl);
  return res.ok ? { ok: true as const, username: res.body.username } : { ok: false as const, message: res.message };
}
