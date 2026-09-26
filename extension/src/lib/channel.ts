import type { ExtensionSubmissionResult } from '@lct/shared';

/** Tags our window messages between page.ts and content.ts. */
export const CHANNEL = 'lct-extension-v1';

export type ToastReply =
  | { ok: true; outcome: ExtensionSubmissionResult['outcome']; title: string }
  | { ok: false; message: string; queued?: boolean; needsSetup?: boolean };

/** What the page shows after a submission is handled. */
export function toastText(reply: ToastReply): string {
  if (!reply.ok) {
    if (reply.needsSetup) return 'LeetCode Tracker: click the extension icon to connect it to your tracker.';
    if (reply.queued) return `LeetCode Tracker: couldn't save yet, will retry. (${reply.message})`;
    return `LeetCode Tracker: ${reply.message}`;
  }
  switch (reply.outcome) {
    case 'added':
      return `Added “${reply.title}” to your tracker ✓`;
    case 'solved':
      return `Marked “${reply.title}” solved ✓`;
    case 'reviewed':
      return `Review of “${reply.title}” recorded ✓`;
    case 'resolved':
      return `Saved your new solution to “${reply.title}” ✓`;
    case 'duplicate':
      return `“${reply.title}” is already up to date ✓`;
  }
}
