// Runs alongside LeetCode's page (isolated from its scripts). Passes accepted submissions
// from page.ts to the background worker, and shows a short confirmation on the page.
import { CHANNEL, toastText, type ToastReply } from './lib/channel';

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as { channel?: string; type?: string; submission?: unknown } | null;
  if (data?.channel !== CHANNEL || data.type !== 'accepted') return;

  chrome.runtime.sendMessage({ type: 'submission', submission: data.submission }, (reply: ToastReply | undefined) => {
    if (chrome.runtime.lastError || !reply) return; // extension reloaded; nothing to show
    showToast(toastText(reply), reply.ok);
  });
});

/** A small notice in the corner, in a shadow root so LeetCode's styles can't touch it. */
function showToast(text: string, ok: boolean) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.textContent = text;
  box.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483647',
    'max-width:360px',
    'padding:10px 14px',
    'border-radius:10px',
    'font:500 14px/1.4 system-ui,sans-serif',
    'color:#fff',
    `background:${ok ? '#4f46e5' : '#b91c1c'}`,
    'box-shadow:0 8px 24px rgba(0,0,0,.25)',
  ].join(';');
  root.append(box);
  document.body.append(host);
  setTimeout(() => host.remove(), ok ? 5_000 : 9_000);
}
