import { useState } from 'react';
import { Link } from 'react-router';
import { LANGUAGES, type Problem } from '@lct/shared';
import { useProblemList, useStatsSummary } from '../api/problems';
import { DifficultyBadge } from '../components/Badges';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import ReviewButtons, { reviewFeedback, reviewProgress } from '../components/ReviewButtons';
import { plural, timeAgo } from '../lib/format';

const DUE_QUERY = { due: true, sort: 'recent', page: 1, limit: 50 } as const;

/** A review session: one due problem at a time, most overdue first. */
export default function ReviewsPage() {
  const list = useProblemList(DUE_QUERY);
  const stats = useStatsSummary();
  // Hidden right away, before the refreshed list arrives, so nothing is rated twice.
  const [handled, setHandled] = useState<string[]>([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [feedback, setFeedback] = useState('');

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  const queue = list.data.problems.filter((p) => !handled.includes(p.id));
  const current = queue[0];
  // The queue shows up to 50; any beyond that are still due.
  const remaining = queue.length + Math.max(0, list.data.total - list.data.problems.length);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reviews</h1>
          <p className="muted">
            {current ? `${plural(remaining, 'problem')} due` : 'Nothing due right now'}
            {reviewedCount > 0 && ` · ${reviewedCount} reviewed this session`}
          </p>
        </div>
      </div>

      {feedback && (
        <p className="review-feedback" role="status">
          {feedback}
        </p>
      )}

      {current ? (
        <ReviewCard
          key={current.id}
          problem={current}
          onDone={(message, counted) => {
            setHandled((h) => [...h, current.id]);
            if (counted) setReviewedCount((n) => n + 1);
            setFeedback(message);
          }}
        />
      ) : (
        <EmptyState title="All caught up">
          <p className="muted">
            {stats.data && stats.data.dueThisWeek > 0
              ? `${plural(stats.data.dueThisWeek, 'more review')} coming up this week.`
              : 'Solve problems and they will come back here for review.'}
          </p>
          {handled.length > reviewedCount && (
            <button className="btn btn-secondary" onClick={() => setHandled([])}>
              Show skipped problems
            </button>
          )}
          <Link to="/problems" className="btn btn-secondary">
            Browse problems
          </Link>
        </EmptyState>
      )}
    </>
  );
}

function ReviewCard({ problem: p, onDone }: { problem: Problem; onDone: (feedback: string, counted: boolean) => void }) {
  const [showTopics, setShowTopics] = useState(false);

  return (
    <article className="card review-card" aria-labelledby="review-title">
      <div className="review-card-head">
        <h2 id="review-title">
          {p.leetcodeNumber && <span className="title-number">#{p.leetcodeNumber}</span>}
          <Link to={`/problems/${p.id}`}>{p.title}</Link>
        </h2>
        <DifficultyBadge difficulty={p.difficulty} />
      </div>
      <p className="muted review-meta">
        {reviewProgress(p)}
        {p.lastSolvedAt && ` · last solved ${timeAgo(p.lastSolvedAt)}`}
      </p>

      <p className="review-instructions">
        Solve it again from scratch, then say how it went.
        {p.link && (
          <>
            {' '}
            <a href={p.link} target="_blank" rel="noopener noreferrer">
              Open on LeetCode ↗
            </a>
          </>
        )}
      </p>

      {p.tags.length > 0 &&
        (showTopics ? (
          <p className="review-topics">
            {p.tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </p>
        ) : (
          // Topics give away the approach, so they're hidden until asked for.
          <button className="btn btn-ghost small" onClick={() => setShowTopics(true)}>
            Show topics (hint)
          </button>
        ))}

      {(p.approach || p.code || p.notes) && (
        <details className="review-reveal">
          <summary>Show my notes and solution</summary>
          {p.approach && <p className="prose">{p.approach}</p>}
          {p.code && (
            <pre className="code-block" aria-label={`Solution in ${LANGUAGES[p.language]}`}>
              <code>{p.code}</code>
            </pre>
          )}
          {p.notes && <p className="prose">{p.notes}</p>}
        </details>
      )}

      <ReviewButtons problem={p} onReviewed={(updated) => onDone(reviewFeedback(updated), true)}>
        <button className="btn btn-ghost" onClick={() => onDone('', false)}>
          Skip for now
        </button>
      </ReviewButtons>
    </article>
  );
}
