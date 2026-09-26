import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AGENTS,
  AGENT_LABELS,
  AGENT_LOG_RETENTION_DAYS,
  AGENT_STATS_DAYS,
  agentLogQuerySchema,
  type AgentLogQuery,
  type AgentLogSummary,
  type AgentStats,
} from '@lct/shared';
import { useAgentLog, useAgentLogs, useAgentStats } from '../api/ai';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import { formatCount, formatDuration, timeAgo } from '../lib/format';

export default function AiActivityPage() {
  const [params, setParams] = useSearchParams();
  const parsed = agentLogQuerySchema.safeParse(Object.fromEntries(params));
  const query: AgentLogQuery = parsed.success ? parsed.data : { page: 1, limit: 20 };
  const logs = useAgentLogs(query);

  const update = (key: string, value: string | number | undefined) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      return next;
    });

  return (
    <>
      <Link to="/settings" className="back-link">
        ← Settings
      </Link>
      <h1>AI activity</h1>
      <p className="muted">
        Every AI run on your account: what was asked, the tools the planner used, and what came back. Runs are deleted
        automatically after {AGENT_LOG_RETENTION_DAYS} days.
      </p>

      <StatsSection />

      <div className="filters">
        <select aria-label="Agent" value={query.agent ?? ''} onChange={(e) => update('agent', e.target.value)}>
          <option value="">All agents</option>
          {AGENTS.map((a) => (
            <option key={a} value={a}>
              {AGENT_LABELS[a]}
            </option>
          ))}
        </select>
        <select aria-label="Result" value={query.status ?? ''} onChange={(e) => update('status', e.target.value)}>
          <option value="">All results</option>
          <option value="ok">Succeeded</option>
          <option value="error">Failed</option>
        </select>
      </div>

      {logs.isPending ? (
        <Loading />
      ) : logs.isError ? (
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      ) : logs.data.logs.length === 0 ? (
        <EmptyState title={query.agent || query.status ? 'No runs match these filters' : 'No AI runs yet'}>
          <p className="muted">Analyze a solution, ask for hints, or plan your week, and the runs show up here.</p>
        </EmptyState>
      ) : (
        <>
          <ul className={`run-list${logs.isPlaceholderData ? ' stale' : ''}`}>
            {logs.data.logs.map((log) => (
              <RunRow key={log.id} log={log} />
            ))}
          </ul>
          {logs.data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button className="btn btn-secondary" disabled={query.page <= 1} onClick={() => update('page', query.page - 1)}>
                Newer
              </button>
              <span className="muted">
                Page {query.page} of {logs.data.pages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={query.page >= logs.data.pages}
                onClick={() => update('page', query.page + 1)}
              >
                Older
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

function StatsSection() {
  const stats = useAgentStats();
  if (!stats.data) return null;

  const total = (key: keyof Omit<AgentStats, 'agent'>) => stats.data.reduce((n, s) => n + s[key], 0);
  const runs = total('runs');
  if (runs === 0) return null;
  // Overall average: each agent's average weighted by its successful runs.
  const okRuns = stats.data.reduce((n, s) => n + (s.runs - s.errors), 0);
  const avgMs = okRuns > 0 ? Math.round(stats.data.reduce((n, s) => n + s.avgDurationMs * (s.runs - s.errors), 0) / okRuns) : 0;

  return (
    <section className="analytics-section" aria-labelledby="ai-stats-heading">
      <h2 id="ai-stats-heading">Last {AGENT_STATS_DAYS} days</h2>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col" className="num">
                Runs
              </th>
              <th scope="col" className="num">
                Failed
              </th>
              <th scope="col" className="num">
                Tokens
              </th>
              <th scope="col" className="num">
                Avg. time
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.data.map((s) => (
              <tr key={s.agent}>
                <th scope="row">{AGENT_LABELS[s.agent]}</th>
                <td className="num">{s.runs}</td>
                <td className="num">{s.errors || '—'}</td>
                <td className="num">{formatCount(s.inputTokens + s.outputTokens)}</td>
                <td className="num">{s.avgDurationMs ? formatDuration(s.avgDurationMs) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{runs}</td>
              <td className="num">{total('errors') || '—'}</td>
              <td className="num">{formatCount(total('inputTokens') + total('outputTokens'))}</td>
              <td className="num">{avgMs ? formatDuration(avgMs) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function RunRow({ log }: { log: AgentLogSummary }) {
  const [open, setOpen] = useState(false);
  const detailId = `run-${log.id}`;

  return (
    <li className={`run${log.status === 'error' ? ' run-failed' : ''}`}>
      <button className="run-head" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((v) => !v)}>
        <span className={`badge agent-${log.agent}`}>{AGENT_LABELS[log.agent]}</span>
        <span className="run-preview">{log.preview}</span>
        <span className="run-meta">
          {log.status === 'error' && <span className="badge run-error">Failed</span>}
          {timeAgo(log.createdAt)} · {formatDuration(log.durationMs)}
          {log.inputTokens + log.outputTokens > 0 && ` · ${formatCount(log.inputTokens + log.outputTokens)} tokens`}
        </span>
      </button>
      {log.problem && (
        <Link to={`/problems/${log.problem.id}`} className="run-problem">
          {log.problem.title}
        </Link>
      )}
      {open && <RunDetail id={log.id} domId={detailId} />}
    </li>
  );
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

function RunDetail({ id, domId }: { id: string; domId: string }) {
  const detail = useAgentLog(id);

  return (
    <div id={domId} className="run-detail">
      {detail.isPending ? (
        <p className="muted">Loading…</p>
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <>
          <dl className="details">
            <dt>When</dt>
            <dd>{new Date(detail.data.createdAt).toLocaleString()}</dd>
            <dt>Model</dt>
            <dd>{detail.data.model ?? '—'}</dd>
            <dt>Tokens</dt>
            <dd>
              {detail.data.inputTokens.toLocaleString()} in · {detail.data.outputTokens.toLocaleString()} out
            </dd>
            <dt>Time</dt>
            <dd>{formatDuration(detail.data.durationMs)}</dd>
          </dl>

          <h3>Request</h3>
          <pre className="code-block">{json(detail.data.input)}</pre>

          {detail.data.toolCalls.length > 0 && (
            <>
              <h3>Tool calls</h3>
              <ol className="tool-calls">
                {detail.data.toolCalls.map((t, i) => (
                  <li key={i}>
                    <code className="tool-name">{t.name}</code>
                    <details>
                      <summary>Arguments</summary>
                      <pre className="code-block">{json(t.args)}</pre>
                    </details>
                    <details>
                      <summary>Result</summary>
                      <pre className="code-block">{typeof t.result === 'string' ? t.result : json(t.result)}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}

          {detail.data.error ? (
            <>
              <h3>Error</h3>
              <p className="form-error">{detail.data.error}</p>
            </>
          ) : (
            <>
              <h3>Response</h3>
              {typeof detail.data.output === 'string' ? (
                <p className="prose run-output">{detail.data.output}</p>
              ) : (
                <pre className="code-block">{json(detail.data.output)}</pre>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
