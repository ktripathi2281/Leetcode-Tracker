import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { HealthResponse } from '@lct/shared';
import { api } from '../api/client';
import { useCurrentUser } from '../auth/AuthContext';

type Status = { label: string; tone?: 'good' | 'bad' };

export default function HomePage() {
  const user = useCurrentUser();
  const [health, setHealth] = useState<HealthResponse | 'down' | null>(null);

  useEffect(() => {
    api
      .get<HealthResponse>('/health')
      .then((res) => setHealth(res.data))
      .catch(() => setHealth('down'));
  }, []);

  const checking: Status = { label: 'Checking…' };
  const server: Status =
    health === null ? checking : health === 'down' ? { label: 'Not reachable', tone: 'bad' } : { label: 'Running', tone: 'good' };
  const database: Status =
    health === null
      ? checking
      : health === 'down'
        ? { label: 'Unknown' }
        : health.db === 'connected'
          ? { label: 'Connected', tone: 'good' }
          : { label: 'Disconnected', tone: 'bad' };

  return (
    <>
      <h1>Welcome back, {user.username}</h1>
      <p className="muted">
        Track what you're working on in <Link to="/problems">Problems</Link>. Reviews and analytics are coming next.
      </p>

      <section className="card" aria-labelledby="status-heading">
        <h2 id="status-heading">System status</h2>
        <dl className="status-list">
          <dt>Server</dt>
          <dd className={server.tone}>{server.label}</dd>
          <dt>Database</dt>
          <dd className={database.tone}>{database.label}</dd>
        </dl>
      </section>
    </>
  );
}
