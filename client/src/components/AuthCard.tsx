import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';

export default function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  // Wake a sleeping server (free hosting) while the user is still typing.
  useEffect(() => {
    api.get('/health').catch(() => {});
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            LC
          </span>
          LeetCode Tracker
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
      <p className="auth-footer">
        <Link to="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
