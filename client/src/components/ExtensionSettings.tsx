import { useId, useState, type FormEvent } from 'react';
import { createTokenSchema, type CreatedToken } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { extensionApiUrl, useCreateToken, useRevokeToken, useTokens } from '../api/tokens';
import { formatDate, timeAgo } from '../lib/format';

/** Connects the browser extension: create a personal access token, see and revoke tokens. */
export default function ExtensionSettings() {
  const tokens = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState('Chrome');
  const [nameError, setNameError] = useState('');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const nameId = useId();

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createTokenSchema.safeParse({ name });
    if (!parsed.success) return setNameError(parsed.error.issues[0]!.message);
    setNameError('');
    try {
      setCreated(await create.mutateAsync(parsed.data.name));
    } catch {
      // shown from create.error
    }
  };

  return (
    <section className="card" aria-labelledby="extension-heading">
      <h2 id="extension-heading">Browser extension</h2>
      <p className="muted settings-intro">
        The LeetCode Tracker extension saves your accepted LeetCode solutions here automatically: the problem, your code,
        and the solve. It connects with a personal access token, never your password.
      </p>

      {created ? (
        <div className="token-reveal" role="status">
          <p>
            <strong>Copy this token now.</strong> For your security it won't be shown again. Paste both values into the
            extension (click its icon):
          </p>
          <CopyField label="API address" value={extensionApiUrl()} />
          <CopyField label="Access token" value={created.token} />
          <button className="btn btn-secondary" onClick={() => setCreated(null)}>
            Done
          </button>
        </div>
      ) : (
        <form className="token-form" onSubmit={onCreate} noValidate>
          <div className="field">
            <label htmlFor={nameId}>Token name</label>
            <div className="input-row">
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError ? true : undefined}
                placeholder="e.g. Chrome on my laptop"
              />
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create token'}
              </button>
            </div>
            {(nameError || create.isError) && (
              <p className="field-error" role="alert">
                {nameError || getErrorMessage(create.error)}
              </p>
            )}
          </div>
        </form>
      )}

      {tokens.data && tokens.data.length > 0 && (
        <ul className="token-list" aria-label="Your tokens">
          {tokens.data.map((t) => (
            <li key={t.id}>
              <span className="token-main">
                <strong>{t.name}</strong>
                <code className="muted-inline">{t.preview}…</code>
              </span>
              <span className="token-meta">
                Created {formatDate(t.createdAt)} · {t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : 'never used'}
              </span>
              {confirming === t.id ? (
                <span className="confirm" role="group" aria-label={`Confirm revoking ${t.name}`}>
                  <button
                    className="btn btn-danger"
                    onClick={() => revoke.mutate(t.id, { onSettled: () => setConfirming(null) })}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="btn btn-ghost danger-text" onClick={() => setConfirming(t.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="install-steps">
        <summary>How to install the extension</summary>
        <ol>
          <li>
            Build it: run <code>npm run build -w extension</code> in the project folder.
          </li>
          <li>
            In Chrome, open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>.
          </li>
          <li>
            Click <strong>Load unpacked</strong> and choose the <code>extension/dist</code> folder.
          </li>
          <li>Click the extension's icon, paste the API address and your token, then Save and test.</li>
          <li>Submit a solution on LeetCode. When it's accepted, a note confirms it was saved here.</li>
        </ol>
      </details>
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const id = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard blocked: the field is selectable, so it can still be copied by hand.
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input id={id} value={value} readOnly onFocus={(e) => e.target.select()} className="mono" />
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
