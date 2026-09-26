import { Link, useLocation } from 'react-router';
import { registerSchema } from '@lct/shared';
import { useAuth } from '../auth/AuthContext';
import AuthCard from '../components/AuthCard';
import TextField from '../components/TextField';
import { useForm } from '../lib/useForm';

export default function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const { field, handleSubmit, formError, submitting } = useForm(
    registerSchema,
    { username: '', email: '', password: '' },
    register,
  );

  return (
    <AuthCard title="Create your account" subtitle="Track problems, review on schedule, and get AI hints.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <TextField
          label="Username"
          autoComplete="username"
          autoFocus
          hint="Letters, numbers, _ and -"
          {...field('username')}
        />
        <TextField label="Email" type="email" autoComplete="email" {...field('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          {...field('password')}
        />
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account?{' '}
        <Link to="/login" state={location.state}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
