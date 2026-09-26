import { Link } from 'react-router';
import { getErrorMessage } from '../api/client';
import { useLeetCodeAccount, useSyncNow } from '../api/leetcode';
import { describeSyncResult, timeAgo } from '../lib/format';

/** One-line LeetCode sync status for the problem list, or an invitation to connect. */
export default function SyncBar() {
  const account = useLeetCodeAccount();
  const sync = useSyncNow();

  if (!account.data) return null;
  const { username, lastSyncedAt } = account.data;

  if (!username) {
    return (
      <p className="sync-bar">
        <span>Already solving on LeetCode?</span>
        <Link to="/settings">Import your recent solves</Link>
      </p>
    );
  }

  let status: string;
  if (sync.isPending) status = 'Syncing with LeetCode…';
  else if (sync.isError) status = getErrorMessage(sync.error);
  else if (sync.data?.status === 'synced') status = describeSyncResult(sync.data.result);
  else status = lastSyncedAt ? `Synced from LeetCode ${timeAgo(lastSyncedAt)}` : 'Not synced yet';

  return (
    <p className="sync-bar" role="status">
      <span className={sync.isError ? 'bad' : undefined}>{status}</span>
      <button className="btn btn-ghost" onClick={() => sync.mutate()} disabled={sync.isPending}>
        Sync now
      </button>
    </p>
  );
}
