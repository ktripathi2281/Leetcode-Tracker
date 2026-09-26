import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  AGENT_LABELS,
  AUTO_SYNC_AFTER_HOURS,
  LEETCODE_RECENT_LIMIT,
  SYNC_WINDOW_DAYS,
  leetCodeUsernameSchema,
} from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useConnectLeetCode, useDisconnectLeetCode, useLeetCodeAccount, useSyncNow } from '../api/leetcode';
import { useAiUsage } from '../api/ai';
import { ErrorState, Loading } from '../components/PageStates';
import { describeSyncResult, timeAgo } from '../lib/format';

const MONTHS = Math.round(SYNC_WINDOW_DAYS / 30);

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Your connected accounts and AI usage.</p>
      <LeetCodeSettings />
      <AiUsageSettings />
    </>
  );
}

function LeetCodeSettings() {
  const account = useLeetCodeAccount();
  const connect = useConnectLeetCode();
  const disconnect = useDisconnectLeetCode();
  const sync = useSyncNow();
  const [username, setUsername] = useState('');
  const [inputError, setInputError] = useState('');
  const inputId = useId();

  if (account.isPending) return <Loading />;
  if (account.isError) return <ErrorState error={account.error} onRetry={() => account.refetch()} />;
  const { username: connectedAs, lastSyncedAt, lastResult } = account.data;

  const onConnect = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = leetCodeUsernameSchema.safeParse(username);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]!.message);
      return;
    }
    setInputError('');
    try {
      await connect.mutateAsync({ username: parsed.data });
      setUsername('');
      sync.mutate(); // import straight away
    } catch {
      // Shown below from connect.error.
    }
  };

  const latest = sync.data?.status === 'synced' ? sync.data.result : lastResult;

  return (
    <section className="card" aria-labelledby="leetcode-heading">
      <h2 id="leetcode-heading">LeetCode account</h2>
      <p className="muted settings-intro">
        Import problems you've solved on LeetCode in the last {MONTHS} months. Only your public profile is used: we
        never ask for your LeetCode password.
      </p>

      {connectedAs ? (
        <>
          <dl className="details">
            <dt>Connected as</dt>
            <dd>
              <a href={`https://leetcode.com/u/${connectedAs}/`} target="_blank" rel="noopener noreferrer">
                {connectedAs} ↗
              </a>
            </dd>
            <dt>Last synced</dt>
            <dd>{sync.isPending ? 'Syncing…' : lastSyncedAt ? timeAgo(lastSyncedAt) : 'Not yet'}</dd>
            {latest && !sync.isPending && (
              <>
                <dt>Result</dt>
                <dd>{describeSyncResult(latest)}</dd>
              </>
            )}
          </dl>

          {sync.isError && (
            <p className="form-error" role="alert">
              {getErrorMessage(sync.error)}
            </p>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn btn-secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Disconnect
            </button>
          </div>
          <p className="field-hint note">
            LeetCode only shares your {LEETCODE_RECENT_LIMIT} most recent accepted solutions, so the tracker syncs
            automatically when you open it (at most every {AUTO_SYNC_AFTER_HOURS} hours). Disconnecting keeps the
            problems you've imported.
          </p>
        </>
      ) : (
        <form onSubmit={onConnect} noValidate>
          <div className="field">
            <label htmlFor={inputId}>LeetCode username</label>
            <div className="input-row">
              <input
                id={inputId}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setInputError('');
                }}
                placeholder="e.g. neetcode"
                autoComplete="off"
                aria-invalid={inputError || connect.isError ? true : undefined}
              />
              <button type="submit" className="btn btn-primary" disabled={connect.isPending}>
                {connect.isPending ? 'Checking…' : 'Connect'}
              </button>
            </div>
            {inputError || connect.isError ? (
              <p className="field-error" role="alert">
                {inputError || getErrorMessage(connect.error)}
              </p>
            ) : (
              <p className="field-hint">The name in your profile link: leetcode.com/u/your-name</p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** Today's use of each AI agent against its daily limit. */
function AiUsageSettings() {
  const usage = useAiUsage();

  return (
    <section className="card" aria-labelledby="ai-usage-heading">
      <div className="card-head">
        <h2 id="ai-usage-heading">AI usage today</h2>
        <Link to="/ai-activity" className="btn btn-secondary">
          See all AI runs
        </Link>
      </div>
      {usage.data ? (
        <>
          <table className="meters">
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Used today</th>
              </tr>
            </thead>
            <tbody>
              {usage.data.map((u) => (
                <tr key={u.agent}>
                  <th scope="row">{AGENT_LABELS[u.agent]}</th>
                  <td>
                    <span className="meter-label">
                      {u.used} of {u.limit} used
                    </span>
                    <span
                      className="meter-track"
                      role="meter"
                      aria-label={`${AGENT_LABELS[u.agent]} used today`}
                      aria-valuemin={0}
                      aria-valuemax={u.limit}
                      aria-valuenow={u.used}
                    >
                      {u.used > 0 && <span className="meter-fill" style={{ width: `${(u.used / u.limit) * 100}%` }} />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="field-hint note">
            Limits reset at midnight UTC ({new Date(usage.data[0]!.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{' '}
            your time). Failed runs don't count.
          </p>
        </>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </section>
  );
}
