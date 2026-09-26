import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthContext';
import { useAutoSync } from '../api/leetcode';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/problems', label: 'Problems', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export default function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  useAutoSync();

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
              </NavLink>
            ))}
          </nav>
        </div>
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
