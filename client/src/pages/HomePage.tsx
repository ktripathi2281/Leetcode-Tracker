import { Link } from 'react-router';
import { DIFFICULTIES, STATUSES, type StatsSummary } from '@lct/shared';
import { useProblemList, useStatsSummary } from '../api/problems';
import { useCurrentUser } from '../auth/AuthContext';
import { DifficultyBadge } from '../components/Badges';
import { ErrorState, Loading } from '../components/PageStates';
import { describeNextReview } from '../lib/format';
import { useLatestPlan } from '../api/ai';
import { TaskTitle } from './PlanPage';

const DUE_PREVIEW = { due: true, sort: 'recent', page: 1, limit: 5 } as const;

export default function HomePage() {
  const user = useCurrentUser();
  const stats = useStatsSummary();

  return (
    <>
      <h1>Welcome back, {user.username}</h1>
      <p className="muted">Here's where your practice stands.</p>

      {stats.isPending ? (
        <Loading />
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : stats.data.total === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Start tracking your practice</p>
          <p className="muted">
            Add a problem you're working on, or <Link to="/settings">import your recent LeetCode solves</Link>.
          </p>
          <Link to="/problems/new" className="btn btn-primary">
            Add a problem
          </Link>
        </div>
      ) : (
        <Dashboard stats={stats.data} />
      )}
    </>
  );
}

function Dashboard({ stats }: { stats: StatsSummary }) {
  const solved = stats.total - stats.byStatus.Todo - stats.byStatus.Attempted;

  return (
    <>
      <section className="kpi-row" aria-label="Summary">
        <StatTile label="Due for review" value={stats.dueNow} to={stats.dueNow > 0 ? '/reviews' : undefined} />
        <StatTile label="Solved this week" value={stats.solvedThisWeek} />
        <StatTile label="Solved" value={solved} detail={`of ${stats.total} tracked`} />
        <StatTile label="Mastered" value={stats.byStatus.Mastered} />
      </section>

      <div className="dashboard-grid">
        <DueNow count={stats.dueNow} upcoming={stats.dueThisWeek - stats.dueNow} />
        <TodaysPlan />
        <StatusChart stats={stats} />
        <DifficultyMeters stats={stats} />
      </div>
    </>
  );
}

/** Today's tasks from the weekly plan, or an invitation to make one. */
function TodaysPlan() {
  const plan = useLatestPlan().data;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const fresh = plan && Date.now() - Date.parse(plan.createdAt) < 7 * 86_400_000;
  const tasks = fresh ? (plan.days.find((d) => d.day === today)?.tasks ?? []) : [];

  return (
    <section className="card" aria-labelledby="plan-heading">
      <div className="card-head">
        <h2 id="plan-heading">Today's plan</h2>
        <Link to="/plan" className="btn btn-secondary">
          {fresh ? 'Full week' : 'Plan my week'}
        </Link>
      </div>
      {!fresh ? (
        <p className="muted">Let the AI coach plan your week around your reviews and weak topics.</p>
      ) : tasks.length === 0 ? (
        <p className="muted">Nothing planned today. Enjoy the rest.</p>
      ) : (
        <ul className="due-list">
          {tasks.map((t, i) => (
            <li key={i}>
              <TaskTitle task={t} />
              <span className={`badge task-${t.kind}`}>{t.kind === 'new' ? 'New' : t.kind === 'review' ? 'Review' : 'Practice'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatTile({ label, value, detail, to }: { label: string; value: number; detail?: string; to?: string }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString()}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="stat-tile stat-tile-link">
      {body}
    </Link>
  ) : (
    <div className="stat-tile">{body}</div>
  );
}

function DueNow({ count, upcoming }: { count: number; upcoming: number }) {
  const due = useProblemList(DUE_PREVIEW);

  return (
    <section className="card" aria-labelledby="due-heading">
      <div className="card-head">
        <h2 id="due-heading">Due for review</h2>
        {count > 0 && (
          <Link to="/reviews" className="btn btn-primary">
            Start reviewing
          </Link>
        )}
      </div>
      {count === 0 ? (
        <p className="muted">
          Nothing due today.
          {upcoming > 0 && ` ${upcoming} more coming up this week.`}
        </p>
      ) : (
        <ul className="due-list">
          {due.data?.problems.map((p) => (
            <li key={p.id}>
              <Link to={`/problems/${p.id}`}>{p.title}</Link>
              <span className="due-when">{describeNextReview(p.nextReviewAt!)}</span>
              <DifficultyBadge difficulty={p.difficulty} />
            </li>
          ))}
          {count > DUE_PREVIEW.limit && (
            <li className="muted">
              <Link to="/reviews">and {count - DUE_PREVIEW.limit} more</Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Problems per status: one series, so one color and no legend; each bar carries its
 * count at the tip, and its share on hover/focus. Built as a table so screen readers
 * get the numbers directly.
 */
function StatusChart({ stats }: { stats: StatsSummary }) {
  const max = Math.max(...STATUSES.map((s) => stats.byStatus[s]), 1);

  return (
    <section className="card" aria-labelledby="status-chart-heading">
      <h2 id="status-chart-heading">Problems by status</h2>
      <table className="bar-chart">
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Problems</th>
          </tr>
        </thead>
        <tbody>
          {STATUSES.map((status) => {
            const count = stats.byStatus[status];
            const share = Math.round((count / stats.total) * 100);
            return (
              <tr key={status}>
                <th scope="row">
                  <Link to={`/problems?status=${status}`}>{status}</Link>
                </th>
                <td>
                  <span className="bar-track" tabIndex={0} aria-label={`${status}: ${count} problems, ${share}%`}>
                    {count > 0 && <span className="bar" style={{ width: `${(count / max) * 100}%` }} />}
                    <span className="bar-value">{count}</span>
                    <span className="chart-tip" role="tooltip">
                      <strong>{count}</strong> {status.toLowerCase()} · {share}% of tracked
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Solved out of tracked, per difficulty: a meter each, fill and track from the same hue. */
function DifficultyMeters({ stats }: { stats: StatsSummary }) {
  return (
    <section className="card" aria-labelledby="difficulty-heading">
      <h2 id="difficulty-heading">Solved by difficulty</h2>
      <table className="meters">
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Difficulty</th>
            <th scope="col">Solved</th>
          </tr>
        </thead>
        <tbody>
          {DIFFICULTIES.map((d) => {
            const { total, solved } = stats.byDifficulty[d];
            return (
              <tr key={d}>
                <th scope="row">
                  <DifficultyBadge difficulty={d} />
                </th>
                <td>
                  <span className="meter-label">
                    {solved} of {total} solved
                  </span>
                  <span
                    className="meter-track"
                    role="meter"
                    aria-label={`${d} solved`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(total, 1)}
                    aria-valuenow={solved}
                  >
                    {solved > 0 && <span className="meter-fill" style={{ width: `${(solved / Math.max(total, 1)) * 100}%` }} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
