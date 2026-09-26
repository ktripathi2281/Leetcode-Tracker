import { useState } from 'react';
import { Link } from 'react-router';
import { ACTIVITY_WEEKS, STRUGGLE_WINDOW_DAYS, type ActivityDay, type CompanyStats, type TopicStats } from '@lct/shared';
import { useActivityStats, useCompanyStats, useTopicStats } from '../api/stats';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import { plural } from '../lib/format';

export default function AnalyticsPage() {
  return (
    <>
      <h1>Analytics</h1>
      <p className="muted">How your practice is going, and where to focus next.</p>
      <ActivitySection />
      <TopicsSection />
      <CompaniesSection />
    </>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

interface Week {
  start: string;
  solves: number;
  reviews: number;
}

/** Days arrive Monday-aligned, so every 7 is a week (the last may be partial). */
function toWeeks(days: ActivityDay[]): Week[] {
  const weeks: Week[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push({
      start: chunk[0]!.date,
      solves: chunk.reduce((n, d) => n + d.solves, 0),
      reviews: chunk.reduce((n, d) => n + d.reviews, 0),
    });
  }
  return weeks;
}

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A round axis maximum at or above the data, whose half (the middle gridline) is also a
 * whole number, since these are counts: 2, 4, 6, 8, 10, 20, 40…
 */
function niceMax(value: number) {
  if (value <= 2) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([2, 4, 6, 8, 10].find((m) => m * magnitude >= value) ?? 10) * magnitude;
}

function ActivitySection() {
  const activity = useActivityStats();

  return (
    <section className="analytics-section" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Activity</h2>
      {activity.isPending ? (
        <Loading />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : (
        <ActivityBody days={activity.data.days} current={activity.data.currentStreak} longest={activity.data.longestStreak} />
      )}
    </section>
  );
}

function ActivityBody({ days, current, longest }: { days: ActivityDay[]; current: number; longest: number }) {
  const weeks = toWeeks(days);
  const solves = weeks.reduce((n, w) => n + w.solves, 0);
  const reviews = weeks.reduce((n, w) => n + w.reviews, 0);
  const max = niceMax(Math.max(...weeks.map((w) => w.solves + w.reviews)));

  return (
    <>
      <div className="kpi-row">
        <Tile label={`Solved in ${ACTIVITY_WEEKS} weeks`} value={solves} />
        <Tile label={`Reviews in ${ACTIVITY_WEEKS} weeks`} value={reviews} />
        <Tile label="Current streak" value={current} unit={current === 1 ? 'day' : 'days'} />
        <Tile label="Longest streak" value={longest} unit={longest === 1 ? 'day' : 'days'} detail="in the last year" />
      </div>

      <figure className="card chart-card">
        <figcaption className="chart-head">
          <span className="chart-title">Solves and reviews per week</span>
          <span className="legend" aria-hidden="true">
            <span className="legend-item">
              <span className="swatch series-1" /> Solves
            </span>
            <span className="legend-item">
              <span className="swatch series-2" /> Reviews
            </span>
          </span>
        </figcaption>

        {/* The visual chart; the table below carries the same numbers for screen readers. */}
        <div className="column-chart" aria-hidden="true">
          <div className="y-axis">
            <span>{max}</span>
            <span>{max / 2}</span>
            <span>0</span>
          </div>
          <div className="plot">
            <div className="gridline" style={{ bottom: '100%' }} />
            <div className="gridline" style={{ bottom: '50%' }} />
            <div className="gridline baseline" style={{ bottom: 0 }} />
            {weeks.map((w, i) => (
              <div key={w.start} className="column-slot">
                <div className="column">
                  {w.reviews > 0 && (
                    <span className="segment series-2 top" style={{ height: `${(w.reviews / max) * 100}%` }} />
                  )}
                  {w.solves > 0 && (
                    <span
                      className={`segment series-1${w.reviews === 0 ? ' top' : ''}`}
                      style={{ height: `${(w.solves / max) * 100}%` }}
                    />
                  )}
                </div>
                <span className="chart-tip">
                  <strong>{w.solves}</strong> solved · <strong>{w.reviews}</strong> reviews
                  <br />
                  week of {shortDate(w.start)}
                  {i === weeks.length - 1 && ' (so far)'}
                </span>
                <span className={`x-label${i % 3 === 0 || i === weeks.length - 1 ? '' : ' minor'}`}>{shortDate(w.start)}</span>
              </div>
            ))}
          </div>
        </div>

        <details className="table-view">
          <summary>Show as table</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Solves</th>
                <th scope="col">Reviews</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.start}>
                  <th scope="row">{shortDate(w.start)}</th>
                  <td>{w.solves}</td>
                  <td>{w.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
    </>
  );
}

function Tile({ label, value, unit, detail }: { label: string; value: number; unit?: string; detail?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value.toLocaleString()}
        {unit && <span className="stat-unit"> {unit}</span>}
      </span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}

// ─── Topics ───────────────────────────────────────────────────────────────────

const TOPICS_SHOWN = 10;

function TopicsSection() {
  const topics = useTopicStats();
  const [showAll, setShowAll] = useState(false);

  return (
    <section className="analytics-section" aria-labelledby="topics-heading">
      <h2 id="topics-heading">Topics</h2>
      {topics.isPending ? (
        <Loading />
      ) : topics.isError ? (
        <ErrorState error={topics.error} onRetry={() => topics.refetch()} />
      ) : topics.data.length === 0 ? (
        <EmptyState title="No topics yet">
          <p className="muted">Topics come from the tags on your problems.</p>
        </EmptyState>
      ) : (
        <>
          <NeedsAttention topics={topics.data} />
          <TopicChart topics={showAll ? topics.data : topics.data.slice(0, TOPICS_SHOWN)} />
          {topics.data.length > TOPICS_SHOWN && (
            <button className="btn btn-ghost show-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer topics' : `Show all ${topics.data.length} topics`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** The topics where reviews went worst recently. */
function NeedsAttention({ topics }: { topics: TopicStats[] }) {
  const struggling = topics
    .filter((t) => t.neededHelp > 0)
    .sort((a, b) => b.neededHelp - a.neededHelp)
    .slice(0, 3);
  if (struggling.length === 0) return null;

  return (
    <p className="attention">
      <strong>Needs attention:</strong>{' '}
      {struggling.map((t, i) => (
        <span key={t.topic}>
          {i > 0 && ', '}
          <Link to={`/problems?tag=${encodeURIComponent(t.topic)}`}>{t.topic}</Link> (needed help {t.neededHelp}×)
        </span>
      ))}
    </p>
  );
}

const STAGES = [
  { key: 'mastered', label: 'Mastered', className: 'level-3' },
  { key: 'practicing', label: 'Practising', className: 'level-2' },
  { key: 'unsolved', label: 'Unsolved', className: 'level-1' },
] as const;

/**
 * One row per topic: bar length is the topic's size, split into mastered / practising /
 * unsolved (an ordered scale of one hue). A table, so the numbers are readable without the bars.
 */
function TopicChart({ topics }: { topics: TopicStats[] }) {
  const max = Math.max(...topics.map((t) => t.total));

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <span className="chart-title">Progress by topic</span>
        <span className="legend" aria-hidden="true">
          {STAGES.map((s) => (
            <span key={s.key} className="legend-item">
              <span className={`swatch ${s.className}`} /> {s.label}
            </span>
          ))}
        </span>
      </div>
      <table className="topic-chart">
        <thead>
          <tr>
            <th scope="col">Topic</th>
            <th scope="col">
              <span className="visually-hidden">Progress</span>
            </th>
            <th scope="col" className="num">
              Solved
            </th>
            <th scope="col" className="num" title={`"I needed help" reviews in the last ${STRUGGLE_WINDOW_DAYS} days`}>
              Needed help
            </th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => {
            const solved = t.mastered + t.practicing;
            return (
              <tr key={t.topic}>
                <th scope="row">
                  <Link to={`/problems?tag=${encodeURIComponent(t.topic)}`}>{t.topic}</Link>
                </th>
                <td className="stack-cell">
                  <span
                    className="stack"
                    tabIndex={0}
                    style={{ width: `${(t.total / max) * 100}%` }}
                    aria-label={`${t.topic}: ${t.mastered} mastered, ${t.practicing} practising, ${t.unsolved} unsolved`}
                  >
                    {/* Tooltip first, so the last segment is the :last-of-type that gets the rounded end. */}
                    <span className="chart-tip" role="tooltip">
                      <strong>{t.topic}</strong>
                      <br />
                      {t.mastered} mastered · {t.practicing} practising · {t.unsolved} unsolved
                    </span>
                    {STAGES.map((s) =>
                      t[s.key] > 0 ? (
                        <span key={s.key} className={`stack-segment ${s.className}`} style={{ flexGrow: t[s.key] }} />
                      ) : null,
                    )}
                  </span>
                </td>
                <td className="num">
                  {solved}/{t.total}
                </td>
                <td className="num">{t.neededHelp > 0 ? `${t.neededHelp}×` : <span className="muted-inline">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Companies ────────────────────────────────────────────────────────────────

function CompaniesSection() {
  const companies = useCompanyStats();

  return (
    <section className="analytics-section" aria-labelledby="companies-heading">
      <h2 id="companies-heading">Company readiness</h2>
      {companies.isPending ? (
        <Loading />
      ) : companies.isError ? (
        <ErrorState error={companies.error} onRetry={() => companies.refetch()} />
      ) : companies.data.length === 0 ? (
        <EmptyState title="No company tags yet">
          <p className="muted">Add companies to your problems to see how ready you are for each one.</p>
        </EmptyState>
      ) : (
        <CompanyMeters companies={companies.data} />
      )}
    </section>
  );
}

function CompanyMeters({ companies }: { companies: CompanyStats[] }) {
  return (
    <div className="card">
      <table className="meters">
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Company</th>
            <th scope="col">Solved</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.company}>
              <th scope="row">
                <Link to={`/problems?company=${encodeURIComponent(c.company)}`}>{c.company}</Link>
              </th>
              <td>
                <span className="meter-label">
                  {c.solved} of {plural(c.total, 'problem')} solved · {Math.round((c.solved / c.total) * 100)}%
                </span>
                <span
                  className="meter-track"
                  role="meter"
                  aria-label={`${c.company} readiness`}
                  aria-valuemin={0}
                  aria-valuemax={c.total}
                  aria-valuenow={c.solved}
                >
                  {c.solved > 0 && <span className="meter-fill" style={{ width: `${(c.solved / c.total) * 100}%` }} />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
