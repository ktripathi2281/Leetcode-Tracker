// Spots accepted submissions in LeetCode's own network traffic. No browser APIs here,
// so it can be tested with recorded requests and responses.
//
// LeetCode's flow when you press Submit:
//   1. POST /problems/<slug>/submit/            body {lang, question_id, typed_code} → {submission_id}
//   2. GET  /submissions/detail/<id>/check/     polled until {state: "SUCCESS", status_msg, ...}
// The code comes from step 1; step 2 says whether it was accepted.

export interface AcceptedSubmission {
  slug: string;
  submissionId: string;
  lang: string;
  code: string;
  acceptedAt: string;
  runtime?: string;
  memory?: string;
}

interface Pending {
  slug: string;
  lang: string;
  code: string;
}

const SUBMIT_URL = /\/problems\/([a-z0-9-]+)\/submit\/?(?:[?#]|$)/;
const CHECK_URL = /\/submissions\/detail\/(\d+)\/check\/?(?:[?#]|$)/;
const MAX_PENDING = 20;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

function parseJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return asRecord(text);
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

const str = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

/** Progress notes for the console, so a user can see where detection stops. */
export type Log = (message: string) => void;

export function createDetector(
  onAccepted: (submission: AcceptedSubmission) => void,
  now = () => new Date(),
  log: Log = () => {},
) {
  const pending = new Map<string, Pending>();

  /** A finished request: its URL and method, the body sent, and the parsed JSON response. */
  function observe(url: string, method: string, requestBody: unknown, response: unknown) {
    const submit = SUBMIT_URL.exec(url);
    if (submit && method.toUpperCase() === 'POST') {
      const sent = parseJson(requestBody);
      const id = str(asRecord(response)?.submission_id);
      const code = sent?.typed_code;
      const lang = sent?.lang;
      if (id && typeof code === 'string' && typeof lang === 'string') {
        log(`saw a submission of ${submit[1]} (#${id}, ${lang})`);
        pending.set(id, { slug: submit[1]!, lang, code });
        // Keep memory bounded if checks never arrive.
        if (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value!);
      } else {
        log(
          `saw a submit request but couldn't read it (submission id: ${id ?? 'missing'}, code: ${typeof code}, lang: ${typeof lang})`,
        );
      }
      return;
    }

    const check = CHECK_URL.exec(url);
    if (!check) return;
    const result = asRecord(response);
    if (result?.state !== 'SUCCESS') return; // still judging
    const id = check[1]!;
    const submitted = pending.get(id);
    pending.delete(id);
    log(`result for #${id}: ${str(result.status_msg) ?? 'unknown'}${submitted ? '' : ' (no matching submission seen)'}`);
    if (!submitted || result.status_msg !== 'Accepted') return;

    const finished = typeof result.task_finish_time === 'number' ? new Date(result.task_finish_time) : now();
    onAccepted({
      ...submitted,
      submissionId: id,
      acceptedAt: (Number.isNaN(finished.getTime()) ? now() : finished).toISOString(),
      runtime: str(result.status_runtime),
      memory: str(result.status_memory),
    });
  }

  return { observe, pendingCount: () => pending.size };
}

/** Only these requests are worth reading the body of. */
export const isInteresting = (url: string) => SUBMIT_URL.test(url) || CHECK_URL.test(url);
