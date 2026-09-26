import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import axios from 'axios';
import { LANGUAGES, STATUSES, type Problem } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useDeleteProblem, useProblem, useUpdateProblem } from '../api/problems';
import { DifficultyBadge, StatusBadge } from '../components/Badges';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import { describeNextReview, formatDate, isDueToday } from '../lib/format';
import ReviewButtons, { reviewFeedback, reviewProgress } from '../components/ReviewButtons';
import PostMortemCard from '../components/PostMortemCard';
import TutorChat from '../components/TutorChat';


export default function ProblemDetailPage() {
  const id = useParams().id!;
  const navigate = useNavigate();
  const problem = useProblem(id);
  const update = useUpdateProblem(id);
  const remove = useDeleteProblem(id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showHints, setShowHints] = useState(false);

  if (problem.isPending) return <Loading />;
  if (problem.isError) {
    if (axios.isAxiosError(problem.error) && problem.error.response?.status === 404) {
      return (
        <EmptyState title="Problem not found">
          <p className="muted">It may have been deleted.</p>
          <Link to="/problems" className="btn btn-secondary">
            Back to problems
          </Link>
        </EmptyState>
      );
    }
    return <ErrorState error={problem.error} onRetry={() => problem.refetch()} />;
  }

  const p = problem.data;
  const onDelete = () => remove.mutate(undefined, { onSuccess: () => navigate('/problems', { replace: true }) });

  return (
    <article className="problem-detail">
      <Link to="/problems" className="back-link">
        ← Problems
      </Link>

      <div className="page-header">
        <div>
          <h1>
            {p.leetcodeNumber && <span className="title-number">#{p.leetcodeNumber}</span>}
            {p.title}
          </h1>
          <div className="meta-row">
            <DifficultyBadge difficulty={p.difficulty} />
            <StatusBadge status={p.status} />
            {p.link && (
              <a href={p.link} target="_blank" rel="noopener noreferrer">
                Open on LeetCode ↗
              </a>
            )}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" aria-expanded={showHints} onClick={() => setShowHints((v) => !v)}>
            {showHints ? 'Hide hints' : 'Get hints'}
          </button>
          <Link to={`/problems/${p.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          {confirmingDelete ? (
            <span className="confirm" role="group" aria-label="Confirm delete">
              <span>Delete this problem?</span>
              <button className="btn btn-danger" onClick={onDelete} disabled={remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost danger-text" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>

      {(update.isError || remove.isError) && (
        <p className="form-error" role="alert">
          {getErrorMessage(update.error ?? remove.error)}
        </p>
      )}

      <section className="card">
        <h2 id="status-label">Status</h2>
        <div className="segmented" role="group" aria-labelledby="status-label">
          {STATUSES.map((s) => (
            <button
              key={s}
              aria-pressed={p.status === s}
              disabled={update.isPending}
              onClick={() => p.status !== s && update.mutate({ status: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {showHints && <TutorChat problem={p} />}

      <ReviewSection problem={p} />

      <section className="card">
        <h2>Details</h2>
        <dl className="details">
          <dt>Topics</dt>
          <dd>{p.tags.length ? p.tags.map((t) => <span key={t} className="chip">{t}</span>) : '—'}</dd>
          <dt>Companies</dt>
          <dd>{p.companyTags.length ? p.companyTags.map((c) => <span key={c} className="chip chip-company">{c}</span>) : '—'}</dd>
          <dt>Last solved</dt>
          <dd>{p.lastSolvedAt ? formatDate(p.lastSolvedAt) : '—'}</dd>
          <dt>Time taken</dt>
          <dd>{p.timeTakenMinutes ? `${p.timeTakenMinutes} min` : '—'}</dd>
          <dt>Added</dt>
          <dd>
            {formatDate(p.createdAt)}
            {p.source === 'sync' && <span className="muted-inline"> · imported from LeetCode</span>}
          </dd>
          <dt>Last updated</dt>
          <dd>{formatDate(p.updatedAt)}</dd>
        </dl>
      </section>

      {p.approach && (
        <section className="card">
          <h2>Approach</h2>
          <p className="prose">{p.approach}</p>
        </section>
      )}

      <section className="card">
        <h2>
          Solution {p.code && <span className="muted-inline">· {LANGUAGES[p.language]}</span>}
        </h2>
        {p.code ? (
          <pre className="code-block">
            <code>{p.code}</code>
          </pre>
        ) : (
          <p className="muted">
            No code yet. <Link to={`/problems/${p.id}/edit`}>Add your solution</Link>
          </p>
        )}
      </section>

      <PostMortemCard problem={p} />

      {p.notes && (
        <section className="card">
          <h2>Notes</h2>
          <p className="prose">{p.notes}</p>
        </section>
      )}
    </article>
  );
}

function ReviewSection({ problem: p }: { problem: Problem }) {
  const [feedback, setFeedback] = useState('');

  let body;
  if (p.status === 'Todo' || p.status === 'Attempted') {
    body = <p className="muted">Reviews start once you've solved it.</p>;
  } else if (!p.nextReviewAt) {
    body = <p className="muted">Mastered. No more reviews scheduled.</p>;
  } else {
    body = (
      <>
        <dl className="details">
          <dt>Next review</dt>
          <dd>
            {describeNextReview(p.nextReviewAt)}
            <span className="muted-inline"> · {formatDate(p.nextReviewAt)}</span>
          </dd>
          <dt>Progress</dt>
          <dd>{reviewProgress(p)}</dd>
        </dl>
        {isDueToday(p.nextReviewAt) && (
          <ReviewButtons problem={p} onReviewed={(updated) => setFeedback(reviewFeedback(updated))} />
        )}
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      {feedback && (
        <p className="review-feedback" role="status">
          {feedback}
        </p>
      )}
      {body}
    </section>
  );
}
