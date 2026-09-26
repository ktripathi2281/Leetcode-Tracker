// Runs in LeetCode's own page (MAIN world), because only there can it see the page's
// network calls. It reads responses from copies and never changes what the page sends
// or receives. Accepted submissions go to content.ts via window.postMessage.
import { createDetector, isInteresting } from './lib/detect';
import { CHANNEL } from './lib/channel';

const log = (message: string) => console.info(`[LeetCode Tracker] ${message}`);

const detector = createDetector(
  (submission) => {
    log(`accepted: sending ${submission.slug} to your tracker`);
    window.postMessage({ channel: CHANNEL, type: 'accepted', submission }, window.location.origin);
  },
  undefined,
  log,
);

const safely = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Never let the tracker break LeetCode.
  }
};

// fetch
const originalFetch = window.fetch;
window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
  const response = await originalFetch.call(this, input, init);
  safely(() => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isInteresting(url)) return;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    response
      .clone()
      .json()
      .then((json: unknown) => detector.observe(url, method, init?.body ?? null, json))
      .catch(() => log(`couldn't read the response of ${url}`));
  });
  return response;
};

// XMLHttpRequest, in case LeetCode uses it for these calls
const requests = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  safely(() => requests.set(this, { method, url: String(url) }));
  return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  safely(() => {
    const info = requests.get(this);
    if (!info || !isInteresting(info.url)) return;
    this.addEventListener('load', () =>
      safely(() => {
        const json: unknown = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
        detector.observe(info.url, info.method, body ?? null, json);
      }),
    );
  });
  return originalSend.call(this, body);
};

log('watching this page for accepted submissions');
