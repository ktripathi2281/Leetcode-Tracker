import type { Problem } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useAgentUsage, usePostMortem } from '../api/ai';
import { timeAgo } from '../lib/format';

/** The AI's review of the saved solution: complexity, assessment, edge cases. */
export default function PostMortemCard({ problem: p }: { problem: Problem }) {
  const analyze = usePostMortem(p.id);
  const usage = useAgentUsage('post-mortem');
  const pm = p.postMortem;
  const left = usage ? usage.limit - usage.used : null;

  const button = (label: string) => (
    <div className="form-actions ai-actions">
      <button className="btn btn-primary" onClick={() => analyze.mutate()} disabled={analyze.isPending || left === 0}>
        {analyze.isPending ? 'Analyzing…' : label}
      </button>
      {left !== null && <span className="field-hint">{left} of {usage!.limit} left today</span>}
    </div>
  );

  return (
    <section className="card" aria-labelledby="analysis-heading" aria-busy={analyze.isPending}>
      <h2 id="analysis-heading">Solution analysis</h2>

      {analyze.isPending && (
        <p className="muted" role="status">
          Reading your code. This usually takes 10 to 20 seconds.
        </p>
      )}
      {analyze.isError && (
        <p className="form-error" role="alert">
          {getErrorMessage(analyze.error)}
        </p>
      )}

      {!p.code.trim() ? (
        <p className="muted">Add your solution code to get an AI review of its complexity and edge cases.</p>
      ) : !pm ? (
        <>
          <p className="muted">
            Get an AI review of your saved solution: its time and space complexity, whether there's a better approach,
            and edge cases to test.
          </p>
          {button('Analyze my solution')}
        </>
      ) : (
        <>
          {!pm.current && (
            <p className="notice" role="note">
              Your code has changed since this analysis.
            </p>
          )}
          <dl className="details analysis">
            <dt>Time</dt>
            <dd>{pm.timeComplexity}</dd>
            <dt>Space</dt>
            <dd>{pm.spaceComplexity}</dd>
            <dt>Verdict</dt>
            <dd>
              <span className={`badge ${pm.isOptimal ? 'verdict-optimal' : 'verdict-improvable'}`}>
                {pm.isOptimal ? '✓ Optimal' : 'Can be improved'}
              </span>
            </dd>
          </dl>
          <p className="prose analysis-text">{pm.assessment}</p>
          {pm.betterApproach && (
            <div className="analysis-block">
              <h3>A better approach</h3>
              <p className="prose">{pm.betterApproach}</p>
            </div>
          )}
          {pm.edgeCases.length > 0 && (
            <div className="analysis-block">
              <h3>Edge cases to test</h3>
              <ul>
                {pm.edgeCases.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="takeaway">
            <strong>Remember:</strong> {pm.keyTakeaway}
          </p>
          <p className="field-hint">Analyzed {timeAgo(pm.analyzedAt)} · AI-generated, may contain mistakes</p>
          {button(pm.current ? 'Analyze again' : 'Analyze the new code')}
        </>
      )}
    </section>
  );
}
