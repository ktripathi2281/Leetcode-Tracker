import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { changePasswordSchema, type AuthResponse } from '@lct/shared';
import { api, getErrorMessage } from '../api/client';
import { useAuth, useCurrentUser } from '../auth/AuthContext';
import TextField from './TextField';
import { useForm } from '../lib/useForm';

/** Password, sessions, data export, and account deletion. */
export default function AccountSettings() {
  const user = useCurrentUser();

  return (
    <section className="card" aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <p className="muted settings-intro">
        Signed in as <strong>{user.username}</strong> ({user.email}).
      </p>
      <ChangePassword />
      <Sessions />
      <ExportData />
      <DeleteAccount />
    </section>
  );
}

function ChangePassword() {
  const { replaceSession } = useAuth();
  const [done, setDone] = useState(false);
  const { field, handleSubmit, formError, submitting } = useForm(
    changePasswordSchema,
    { currentPassword: '', newPassword: '' },
    async (input) => {
      const res = await api.post<AuthResponse>('/account/change-password', input);
      replaceSession(res.data); // this device stays signed in
      setDone(true);
    },
  );

  return (
    <form className="account-block" onSubmit={handleSubmit} noValidate>
      <h3>Change password</h3>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {done && (
        <p className="form-success" role="status">
          Password changed. You've been signed out on your other devices.
        </p>
      )}
      <div className="form-grid">
        <TextField label="Current password" type="password" autoComplete="current-password" {...field('currentPassword')} />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          {...field('newPassword')}
        />
      </div>
      <button type="submit" className="btn btn-secondary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

function Sessions() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await api.post('/account/sign-out-everywhere');
      logout();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="account-block">
      <h3>Sessions</h3>
      <p className="muted">Lost a device, or signed in somewhere public? Sign out everywhere, including here.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-secondary" onClick={signOutEverywhere} disabled={busy}>
        Sign out everywhere
      </button>
    </div>
  );
}

function ExportData() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.get('/account/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `leetcode-tracker-${new Date().toISOString().slice(0, 10)}.json`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-block">
      <h3>Your data</h3>
      <p className="muted">Download everything stored about you (problems, notes, code, history, AI runs) as a JSON file.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-secondary" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download my data'}
      </button>
    </div>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const user = useCurrentUser();

  const onDelete = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.delete('/account', { data: { password } });
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="account-block danger-zone">
      <h3>Delete account</h3>
      <p className="muted">
        Deletes your account and everything in it: problems, notes, code, history and AI runs. This can't be undone, so
        download your data first if you want a copy.
      </p>
      {!open ? (
        <button className="btn btn-ghost danger-text" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onDelete} noValidate>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-grid">
            <TextField
              label="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label={`Type ${user.username} to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-danger" disabled={busy || !password || confirmText !== user.username}>
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
