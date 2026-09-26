import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';

export interface FromState {
  from?: string;
}

/** Only signed-in users; others go to /login and come back afterwards. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <div className="page-spinner" aria-label="Loading" />;
  if (state.status === 'anonymous') {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from } satisfies FromState} />;
  }
  return <Outlet />;
}

/** Only signed-out users (login/register); signed-in users go to where they were headed. */
export function GuestOnly() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <div className="page-spinner" aria-label="Loading" />;
  if (state.status === 'authenticated') {
    const from = (location.state as FromState | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}
