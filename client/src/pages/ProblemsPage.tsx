import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  DIFFICULTIES,
  PROBLEM_SORTS,
  STATUSES,
  problemListQuerySchema,
  type ProblemListQuery,
} from '@lct/shared';
import { useProblemFacets, useProblemList } from '../api/problems';
import { DifficultyBadge, StatusBadge } from '../components/Badges';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import SyncBar from '../components/SyncBar';

const FILTER_KEYS = ['status', 'difficulty', 'tag', 'company', 'search', 'due'] as const;
const SEARCH_DELAY_MS = 300;

/** Filters live in the URL, so they survive reloads, can be shared, and work with Back. */
function useListQuery() {
  const [params, setParams] = useSearchParams();
  const parsed = problemListQuerySchema.safeParse(Object.fromEntries(params));
  const query: ProblemListQuery = parsed.success ? parsed.data : { sort: 'recent', page: 1, limit: 20 };

  const update = (key: string, value: string | number | undefined, { replace = false } = {}) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
        if (key !== 'page') next.delete('page'); // new filters start at page 1
        return next;
      },
      { replace },
    );
  };

  const clear = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of [...FILTER_KEYS, 'page']) next.delete(key);
      return next;
    });

  const filtered = FILTER_KEYS.some((key) => query[key]);
  return { query, update, clear, filtered };
}

export default function ProblemsPage() {
  const { query, update, clear, filtered } = useListQuery();
  const list = useProblemList(query);
  const facets = useProblemFacets();

  // Search box updates the URL after a short pause in typing.
  const [search, setSearch] = useState(query.search ?? '');
  useEffect(() => {
    setSearch(query.search ?? '');
  }, [query.search]);
  useEffect(() => {
    if (search.trim() === (query.search ?? '')) return;
    const timer = setTimeout(() => update('search', search.trim(), { replace: true }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]); // only react to typing; `update` and `query` change on every render

  const data = list.data;
  const page = query.page;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Problems</h1>
          <p className="muted">
            {data ? `${data.total} ${data.total === 1 ? 'problem' : 'problems'}${filtered ? ' match' : ' tracked'}` : ' '}
          </p>
        </div>
        <Link to="/problems/new" className="btn btn-primary">
          Add problem
        </Link>
      </div>

      <SyncBar />

      <div className="filters" role="search">
        <input
          type="search"
          className="filter-search"
          aria-label="Search problems"
          placeholder="Search by title or number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Status" value={query.status ?? ''} onChange={(e) => update('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Difficulty"
          value={query.difficulty ?? ''}
          onChange={(e) => update('difficulty', e.target.value)}
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {!!facets.data?.tags.length && (
          <select aria-label="Topic" value={query.tag ?? ''} onChange={(e) => update('tag', e.target.value)}>
            <option value="">All topics</option>
            {facets.data.tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        {!!facets.data?.companies.length && (
          <select aria-label="Company" value={query.company ?? ''} onChange={(e) => update('company', e.target.value)}>
            <option value="">All companies</option>
            {facets.data.companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Sort by"
          value={query.sort}
          onChange={(e) => update('sort', e.target.value)}
          disabled={!!query.due} // due problems are always listed most overdue first
        >
          {Object.entries(PROBLEM_SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary filter-toggle"
          aria-pressed={!!query.due}
          onClick={() => update('due', query.due ? undefined : 'true')}
        >
          Due for review
        </button>
        {filtered && (
          <button className="btn btn-ghost" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : data!.problems.length === 0 ? (
        filtered ? (
          <EmptyState title="No problems match these filters">
            <button className="btn btn-secondary" onClick={clear}>
              Clear filters
            </button>
          </EmptyState>
        ) : (
          <EmptyState title="No problems yet">
            <p className="muted">
              Add a problem you're working on, or <Link to="/settings">import your recent LeetCode solves</Link>.
            </p>
            <Link to="/problems/new" className="btn btn-primary">
              Add your first problem
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <ul className={`problem-list${list.isPlaceholderData ? ' stale' : ''}`}>
            {data!.problems.map((p) => (
              <li key={p.id}>
                <Link to={`/problems/${p.id}`} className="problem-row">
                  <span className="problem-number">{p.leetcodeNumber ? `#${p.leetcodeNumber}` : ''}</span>
                  <span className="problem-main">
                    <span className="problem-title">{p.title}</span>
                    {p.tags.length > 0 && (
                      <span className="problem-tags">
                        {p.tags.slice(0, 3).join(' · ')}
                        {p.tags.length > 3 && ` +${p.tags.length - 3}`}
                      </span>
                    )}
                  </span>
                  <DifficultyBadge difficulty={p.difficulty} />
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>

          {data!.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => update('page', page - 1)}>
                Previous
              </button>
              <span className="muted">
                Page {page} of {data!.pages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={page >= data!.pages}
                onClick={() => update('page', page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
