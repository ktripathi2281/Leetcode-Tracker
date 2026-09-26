import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { PlanTask, WeeklyPlan } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useAgentUsage, useGeneratePlan, useLatestPlan } from '../api/ai';
import { EmptyState, ErrorState, Loading } from '../components/PageStates';
import { formatDate } from '../lib/format';

const BUDGETS = [30, 45, 60, 90, 120];
const TASK_LABELS: Record<PlanTask['kind'], string> = { review: 'Review', practice: 'Practice', new: 'New' };

const todayName = () => new Date().toLocaleDateString('en-US', { weekday: 'long' });
const ageInDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

export default function PlanPage() {
  const latest = useLatestPlan();
  const generate = useGeneratePlan();
  const usage = useAgentUsage('planner');
  const [minutes, setMinutes] = useState(60);
  const selectId = useId();
  const left = usage ? usage.limit - usage.used : null;

  const plan = latest.data;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Weekly plan</h1>
          <p className="muted">An AI coach plans your next 7 days from your reviews, weak topics and pace.</p>
        </div>
      </div>

      <section className="card plan-controls" aria-label="Make a plan">
        <div className="field">
          <label htmlFor={selectId}>Time per day</label>
          <select id={selectId} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {BUDGETS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => generate.mutate(minutes)} disabled={generate.isPending || left === 0}>
          {generate.isPending ? 'Planning…' : plan ? 'Make a new plan' : 'Plan my week'}
        </button>
        {left !== null && (
          <span className="field-hint">
            {left} of {usage!.limit} plans left today
          </span>
        )}
      </section>

      {generate.isPending && (
        <p className="plan-progress" role="status">
          Looking at your reviews, topics and recent practice, then planning your week. This usually takes under a
          minute.
        </p>
      )}
      {generate.isError && (
        <p className="form-error" role="alert">
          {getErrorMessage(generate.error)}
        </p>
      )}

      {latest.isPending ? (
        <Loading />
      ) : latest.isError ? (
        <ErrorState error={latest.error} onRetry={() => latest.refetch()} />
      ) : !plan ? (
        !generate.isPending && (
          <EmptyState title="No plan yet">
            <p className="muted">Choose how much time you have each day, then plan your week.</p>
          </EmptyState>
        )
      ) : (
        <PlanView plan={plan} />
      )}
    </>
  );
}

function PlanView({ plan }: { plan: WeeklyPlan }) {
  const age = ageInDays(plan.createdAt);

  return (
    <article className="plan" aria-label="Your plan">
      {age >= 7 && (
        <p className="notice" role="note">
          This plan is from {formatDate(plan.createdAt)}. Make a new one for this week.
        </p>
      )}
      <section className="card">
        <p className="plan-summary">{plan.summary}</p>
        {plan.focusTopics.length > 0 && (
          <ul className="focus-topics" aria-label="Focus topics">
            {plan.focusTopics.map((f) => (
              <li key={f.topic}>
                <Link to={`/problems?tag=${encodeURIComponent(f.topic)}`} className="chip">
                  {f.topic}
                </Link>
                <span className="muted-inline">{f.why}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">Made {formatDate(plan.createdAt)} · AI-generated, adjust it to your week</p>
      </section>

      <ol className="plan-days">
        {plan.days.map((d) => (
          <li key={d.day} className={`card plan-day${d.day === todayName() && age < 7 ? ' today' : ''}`}>
            <div className="plan-day-head">
              <h2>
                {d.day}
                {d.day === todayName() && age < 7 && <span className="today-tag">Today</span>}
              </h2>
              <span className="muted-inline">{d.tasks.length ? `${d.minutes} min` : 'Rest'}</span>
            </div>
            {d.tasks.length > 0 && (
              <ul className="plan-tasks">
                {d.tasks.map((t, i) => (
                  <li key={i}>
                    <span className={`badge task-${t.kind}`}>{TASK_LABELS[t.kind]}</span>
                    <span className="task-body">
                      <TaskTitle task={t} />
                      <span className="task-why">{t.why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

export function TaskTitle({ task }: { task: PlanTask }) {
  if (task.problemId) return <Link to={`/problems/${task.problemId}`}>{task.title}</Link>;
  if (task.link) {
    return (
      <a href={task.link} target="_blank" rel="noopener noreferrer">
        {task.title} ↗
      </a>
    );
  }
  return <span>{task.title}</span>;
}
