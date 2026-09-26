import { Link, Outlet } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthContext';

export default function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            LC
          </span>
          LeetCode Tracker
        </Link>
        <div className="topbar-user">
          <span className="avatar" aria-hidden="true">
            {user.username.charAt(0).toUpperCase()}
          </span>
          <span className="topbar-username">{user.username}</span>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
