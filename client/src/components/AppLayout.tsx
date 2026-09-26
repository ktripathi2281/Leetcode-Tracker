import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthContext';
import { useAutoSync } from '../api/leetcode';
import { useStatsSummary } from '../api/problems';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/problems', label: 'Problems', end: false },
  { to: '/reviews', label: 'Reviews', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
];

export default function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  useAutoSync();
  const dueNow = useStatsSummary().data?.dueNow ?? 0;

  // Start each new page at the top (filter changes keep the same path, so they don't jump).
  // Block body: newer browsers return a Promise from scrollTo, which React would treat as a cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              LC
            </span>
            <span className="brand-name">LeetCode Tracker</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
                {item.to === '/reviews' && dueNow > 0 && (
                  <span className="nav-count" aria-label={`${dueNow} due`}>
                    {dueNow}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="topbar-user">
          {/* Account settings live behind your name, the usual place to look. */}
          <NavLink to="/settings" className="user-link" title="Settings" aria-label={`Settings for ${user.username}`}>
            <span className="avatar" aria-hidden="true">
              {user.username.charAt(0).toUpperCase()}
            </span>
            <span className="topbar-username">{user.username}</span>
          </NavLink>
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
