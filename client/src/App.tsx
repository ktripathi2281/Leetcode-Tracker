import { useEffect, useState } from 'react';
import type { HealthResponse } from '@lct/shared';
import { api } from './api/client';

type ServerState = { kind: 'checking' } | { kind: 'ok'; at: string } | { kind: 'down' };

export default function App() {
  const [server, setServer] = useState<ServerState>({ kind: 'checking' });

  useEffect(() => {
    api
      .get<HealthResponse>('/health')
      .then((res) => setServer({ kind: 'ok', at: res.data.timestamp }))
      .catch(() => setServer({ kind: 'down' }));
  }, []);

  return (
    <main className="shell">
      <h1>LeetCode Tracker</h1>
      <p className="muted">Stage 1 — project setup</p>
      <p className={`status status-${server.kind}`} role="status">
        {server.kind === 'checking' && 'Checking server…'}
        {server.kind === 'ok' && 'Server is running'}
        {server.kind === 'down' && 'Server is not reachable'}
      </p>
    </main>
  );
}
