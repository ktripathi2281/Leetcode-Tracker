import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { forgotPasswordSchema, resetPasswordSchema, PASSWORD_RESET_MINUTES } from '@lct/shared';
import { api } from '../api/client';
import AuthCard from '../components/AuthCard';
import TextField from '../components/TextField';
import { useForm } from '../lib/useForm';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState('');
  const { field, handleSubmit, formError, submitting } = useForm(forgotPasswordSchema, { email: '' }, async (input) => {
    const res = await api.post<{ message: string }>('/auth/forgot-password', input);
    setSent(res.data.message);
  });

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <>
          <p className="form-success" role="status">
            {sent}
          </p>
          <p className="muted">The link works for {PASSWORD_RESET_MINUTES} minutes. Check your spam folder if it doesn't arrive.</p>
        </>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <TextField label="Email" type="email" autoComplete="email" autoFocus {...field('email')} />
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState('');
  const { field, handleSubmit, formError, submitting } = useForm(
    resetPasswordSchema.pick({ password: true }),
    { password: '' },
    async ({ password }) => {
      const res = await api.post<{ message: string }>('/auth/reset-password', { token, password });
      setDone(res.data.message);
    },
  );

  const tokenOk = resetPasswordSchema.shape.token.safeParse(token).success;

  return (
    <AuthCard title="Choose a new password" subtitle="This also signs you out on every device.">
      {!tokenOk ? (
        <p className="form-error" role="alert">
          This reset link is incomplete. Open it straight from the email, or <Link to="/forgot-password">ask for a new one</Link>.
        </p>
      ) : done ? (
        <>
          <p className="form-success" role="status">
            {done}
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Sign in
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {formError && (
            <p className="form-error" role="alert">
              {formError} {/expired|used/i.test(String(formError)) && <Link to="/forgot-password">Get a new link</Link>}
            </p>
          )}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            hint="At least 8 characters"
            {...field('password')}
          />
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
