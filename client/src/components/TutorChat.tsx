import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { TUTOR_MAX_MESSAGE_LENGTH, TUTOR_MAX_MESSAGES, type Problem, type TutorMessage } from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { useAgentUsage, useTutor } from '../api/ai';

const STARTERS = ["I don't know where to start", "Here's my idea, is it on the right track?", 'My solution is too slow'];

// The conversation survives a reload for this tab, but isn't kept anywhere else.
const storageKey = (problemId: string) => `lct.tutor.${problemId}`;
function loadConversation(problemId: string): TutorMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(problemId)) ?? '[]') as TutorMessage[];
  } catch {
    return [];
  }
}
function saveConversation(problemId: string, messages: TutorMessage[]) {
  try {
    sessionStorage.setItem(storageKey(problemId), JSON.stringify(messages));
  } catch {
    // Not saved; the conversation still works for this visit.
  }
}

/** A hint-only chat about one problem. */
export default function TutorChat({ problem }: { problem: Problem }) {
  const [messages, setMessages] = useState<TutorMessage[]>(() => loadConversation(problem.id));
  const [draft, setDraft] = useState('');
  const [includeCode, setIncludeCode] = useState(true);
  const tutor = useTutor(problem.id);
  const usage = useAgentUsage('tutor');
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    saveConversation(problem.id, messages);
  }, [problem.id, messages]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, tutor.isPending]);

  const full = messages.length >= TUTOR_MAX_MESSAGES - 1;
  const left = usage ? usage.limit - usage.used : null;

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || tutor.isPending || full) return;
    const next: TutorMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(next);
    setDraft('');
    tutor.mutate(
      { messages: next, includeCode },
      {
        onSuccess: ({ reply }) => setMessages((m) => [...m, { role: 'tutor', text: reply }]),
        // Put the message back so it can be retried.
        onError: () => {
          setMessages(messages);
          setDraft(trimmed);
        },
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <section className="card tutor" aria-labelledby="tutor-heading">
      <div className="card-head">
        <h2 id="tutor-heading">Hints</h2>
        {messages.length > 0 && (
          <button className="btn btn-ghost small" onClick={() => setMessages([])} disabled={tutor.isPending}>
            New conversation
          </button>
        )}
      </div>

      <div className="tutor-log" role="log" aria-live="polite" aria-label="Conversation with the tutor">
        {messages.length === 0 && (
          <div className="tutor-intro">
            <p className="muted">
              Stuck? The tutor asks questions and gives small hints so you find the solution yourself. It won't
              hand you the answer.
            </p>
            <div className="suggestions">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => send(s)} disabled={left === 0}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-tutor'}`}>
            <span className="visually-hidden">{m.role === 'user' ? 'You:' : 'Tutor:'}</span>
            {m.text}
          </div>
        ))}
        {tutor.isPending && (
          <div className="bubble bubble-tutor typing" aria-label="The tutor is thinking">
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {tutor.isError && (
        <p className="form-error" role="alert">
          {getErrorMessage(tutor.error)}
        </p>
      )}
      {full && <p className="field-hint">This conversation is long. Start a new one to keep going.</p>}

      <form className="tutor-form" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="visually-hidden">
          Message to the tutor
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={draft}
          maxLength={TUTOR_MAX_MESSAGE_LENGTH}
          placeholder="Describe where you're stuck…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          disabled={full}
        />
        <button className="btn btn-primary" type="submit" disabled={tutor.isPending || !draft.trim() || full || left === 0}>
          Send
        </button>
      </form>
      <div className="tutor-foot">
        {problem.code.trim() && (
          <label className="checkbox">
            <input type="checkbox" checked={includeCode} onChange={(e) => setIncludeCode(e.target.checked)} />
            Let the tutor read my saved code
          </label>
        )}
        {left !== null && (
          <span className="field-hint">
            {left} of {usage!.limit} messages left today
          </span>
        )}
      </div>
    </section>
  );
}
