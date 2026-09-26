import { Link, useLocation } from 'react-router';
import { loginSchema } from '@lct/shared';
import { useAuth } from '../auth/AuthContext';
import AuthCard from '../components/AuthCard';
import TextField from '../components/TextField';
import { useForm } from '../lib/useForm';

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const { field, handleSubmit, formError, submitting } = useForm(
    loginSchema,
    { email: '', password: '' },
    login,
  );

  return (
    <AuthCard title="Sign in" subtitle="Welcome back. Pick up where you left off.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <TextField label="Email" type="email" autoComplete="email" autoFocus {...field('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" {...field('password')} />
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">
        New here?{' '}
        {/* Keep the "return to" page when switching between sign in and sign up. */}
        <Link to="/register" state={location.state}>
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
