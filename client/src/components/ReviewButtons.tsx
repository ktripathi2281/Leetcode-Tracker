import { REVIEW_INTERVALS_DAYS, type Problem, type ReviewOutcome } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useReviewProblem } from '../api/problems';
import { describeNextReview, plural } from '../lib/format';

/** What happens next, in words, after a review is recorded. */
export function reviewFeedback(p: Problem): string {
  if (p.status === 'Mastered') return `"${p.title}" is mastered. No more reviews.`;
  if (!p.nextReviewAt) return 'Review recorded.';
  if (p.reviewStep === 0) return `No problem. "${p.title}" comes back tomorrow.`;
  return `Nice. Next review of "${p.title}" ${describeNextReview(p.nextReviewAt).toLowerCase()}.`;
}

/** Progress through the review intervals, e.g. "Review 2 of 6 · every 3 days". */
export function reviewProgress(p: Problem): string {
  const total = REVIEW_INTERVALS_DAYS.length;
  const step = Math.min(p.reviewStep, total - 1);
  return `Review ${step + 1} of ${total} · after ${plural(REVIEW_INTERVALS_DAYS[step]!, 'day')}`;
}

interface ReviewButtonsProps {
  problem: Problem;
  onReviewed: (updated: Problem, outcome: ReviewOutcome) => void;
  children?: React.ReactNode;
}

/** "I solved it again" / "I needed help", plus any extra actions passed as children. */
export default function ReviewButtons({ problem, onReviewed, children }: ReviewButtonsProps) {
  const review = useReviewProblem();

  const rate = (outcome: ReviewOutcome) =>
    review.mutate({ id: problem.id, outcome }, { onSuccess: (updated) => onReviewed(updated, outcome) });

  return (
    <>
      <div className="form-actions review-actions">
        <button className="btn btn-primary" onClick={() => rate('remembered')} disabled={review.isPending}>
          I solved it again
        </button>
        <button className="btn btn-secondary" onClick={() => rate('forgot')} disabled={review.isPending}>
          I needed help
        </button>
        {children}
      </div>
      {review.isError && (
        <p className="form-error" role="alert">
          {getErrorMessage(review.error)}
        </p>
      )}
    </>
  );
}
