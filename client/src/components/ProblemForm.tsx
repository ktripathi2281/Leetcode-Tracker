import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import {
  COMMON_COMPANIES,
  COMMON_TAGS,
  DIFFICULTIES,
  LANGUAGES,
  STATUSES,
  createProblemSchema,
  parseLeetCodeInput,
  slugFromLeetCodeUrl,
  type ApiError,
  type CreateProblemInput,
  type Difficulty,
  type Language,
  type Problem,
  type Status,
} from '@lct/shared';
import { getErrorMessage } from '../api/client';
import { lookupLeetCodeProblem, useProblemFacets } from '../api/problems';
import TagInput from './TagInput';

interface FormValues {
  link: string;
  title: string;
  leetcodeNumber: string;
  difficulty: Difficulty | '';
  status: Status;
  tags: string[];
  companyTags: string[];
  language: Language;
  timeTakenMinutes: string;
  approach: string;
  code: string;
  notes: string;
}

type Field = keyof FormValues;
type Errors = Partial<Record<Field, string>>;

function toValues(p?: Problem): FormValues {
  return {
    link: p?.link ?? '',
    title: p?.title ?? '',
    leetcodeNumber: p?.leetcodeNumber?.toString() ?? '',
    difficulty: p?.difficulty ?? '',
    status: p?.status ?? 'Todo',
    tags: p?.tags ?? [],
    companyTags: p?.companyTags ?? [],
    language: p?.language ?? 'python',
    timeTakenMinutes: p?.timeTakenMinutes?.toString() ?? '',
    approach: p?.approach ?? '',
    code: p?.code ?? '',
    notes: p?.notes ?? '',
  };
}

const optionalNumber = (s: string) => (s.trim() === '' ? null : Number(s));

function toInput(v: FormValues) {
  return {
    ...v,
    difficulty: v.difficulty || undefined,
    leetcodeNumber: optionalNumber(v.leetcodeNumber),
    timeTakenMinutes: optionalNumber(v.timeTakenMinutes),
  };
}

const mergeTags = (current: string[], extra: string[]) => [
  ...current,
  ...extra.filter((t) => !current.some((c) => c.toLowerCase() === t.toLowerCase())),
];

type Lookup = { state: 'idle' } | { state: 'loading' } | { state: 'done' | 'error'; message: string };

interface ProblemFormProps {
  initial?: Problem;
  submitLabel: string;
  onSubmit: (input: CreateProblemInput) => Promise<unknown>;
  onCancel: () => void;
}

export default function ProblemForm({ initial, submitLabel, onSubmit, onCancel }: ProblemFormProps) {
  const [values, setValues] = useState(() => toValues(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<ReactNode>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  // The form is long: bring a save error into view (and focus, for screen readers)
  // instead of leaving it off-screen above. Instant, since a smooth scroll gets cancelled
  // by the layout shift of the message appearing.
  useEffect(() => {
    const el = formErrorRef.current;
    if (!formError || !el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'center' });
  }, [formError]);
  const [submitting, setSubmitting] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const facets = useProblemFacets();

  const set = <K extends Field>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const autoFill = async (linkOrSlug: string) => {
    const slug = parseLeetCodeInput(linkOrSlug);
    if (!slug) {
      setLookup({ state: 'error', message: 'Paste a link like https://leetcode.com/problems/two-sum/' });
      return;
    }
    setLookup({ state: 'loading' });
    try {
      const info = await lookupLeetCodeProblem(slug);
      setValues((v) => ({
        ...v,
        link: info.link,
        title: info.title,
        leetcodeNumber: info.leetcodeNumber?.toString() ?? v.leetcodeNumber,
        difficulty: info.difficulty,
        tags: mergeTags(v.tags, info.tags),
      }));
      setErrors({});
      setLookup({
        state: 'done',
        message: `Filled in from LeetCode${info.isPaidOnly ? ' · Premium problem' : ''}`,
      });
    } catch (err) {
      setLookup({ state: 'error', message: getErrorMessage(err) });
    }
  };

  // Pasting a LeetCode link fills in the details straight away.
  const onLinkPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (slugFromLeetCodeUrl(pasted)) {
      e.preventDefault();
      set('link', pasted.trim());
      void autoFill(pasted);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const result = createProblemSchema.safeParse(toInput(values));
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as Field;
        next[key] ??= issue.code === 'invalid_type' && issue.expected === 'number' ? 'Enter a number' : issue.message;
      }
      setErrors(next);
      // Move focus to the first field that needs fixing (after React marks it invalid).
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(result.data);
    } catch (err) {
      const existingId = axios.isAxiosError<ApiError>(err) ? err.response?.data?.existingId : undefined;
      setFormError(
        existingId ? (
          <>
            You're already tracking this problem. <Link to={`/problems/${existingId}`}>Open it</Link>
          </>
        ) : (
          getErrorMessage(err)
        ),
      );
      setSubmitting(false);
    }
  };

  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const tagSuggestions = mergeTags(facets.data?.tags ?? [], COMMON_TAGS);
  const companySuggestions = mergeTags(facets.data?.companies ?? [], COMMON_COMPANIES);

  const err = (key: Field) =>
    errors[key] ? (
      <p className="field-error" id={fid(`${key}-error`)}>
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: Field) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': fid(`${key}-error`) } : {});

  return (
    <form ref={formRef} className="problem-form" onSubmit={handleSubmit} noValidate>
      {formError && (
        <p ref={formErrorRef} className="form-error" role="alert" tabIndex={-1}>
          {formError}
        </p>
      )}

      <section className="card form-section">
        <div className="field">
          <label htmlFor={fid('link')}>LeetCode link</label>
          <div className="input-row">
            <input
              id={fid('link')}
              value={values.link}
              onChange={(e) => set('link', e.target.value)}
              onPaste={onLinkPaste}
              placeholder="https://leetcode.com/problems/two-sum/"
              inputMode="url"
              {...invalid('link')}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => autoFill(values.link)}
              disabled={lookup.state === 'loading' || !values.link.trim()}
            >
              {lookup.state === 'loading' ? 'Fetching…' : 'Auto-fill'}
            </button>
          </div>
          {err('link')}
          {lookup.state === 'done' || lookup.state === 'error' ? (
            <p className={lookup.state === 'done' ? 'field-hint good' : 'field-error'} role="status">
              {lookup.message}
            </p>
          ) : (
            <p className="field-hint">Paste a link to fill in the title, number, difficulty and topics.</p>
          )}
        </div>

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor={fid('title')}>Title</label>
            <input id={fid('title')} value={values.title} onChange={(e) => set('title', e.target.value)} {...invalid('title')} />
            {err('title')}
          </div>
          <div className="field">
            <label htmlFor={fid('number')}>Problem number</label>
            <input
              id={fid('number')}
              type="number"
              min={1}
              value={values.leetcodeNumber}
              onChange={(e) => set('leetcodeNumber', e.target.value)}
              {...invalid('leetcodeNumber')}
            />
            {err('leetcodeNumber')}
          </div>
          <div className="field">
            <label htmlFor={fid('difficulty')}>Difficulty</label>
            <select
              id={fid('difficulty')}
              value={values.difficulty}
              onChange={(e) => set('difficulty', e.target.value as Difficulty)}
              {...invalid('difficulty')}
            >
              <option value="" disabled>
                Choose…
              </option>
              {DIFFICULTIES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            {err('difficulty')}
          </div>
          <div className="field">
            <label htmlFor={fid('status')}>Status</label>
            <select id={fid('status')} value={values.status} onChange={(e) => set('status', e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={fid('time')}>Time taken (minutes)</label>
            <input
              id={fid('time')}
              type="number"
              min={1}
              value={values.timeTakenMinutes}
              onChange={(e) => set('timeTakenMinutes', e.target.value)}
              {...invalid('timeTakenMinutes')}
            />
            {err('timeTakenMinutes')}
          </div>
        </div>

        <TagInput
          label="Topics"
          values={values.tags}
          onChange={(tags) => set('tags', tags)}
          suggestions={tagSuggestions}
          placeholder="Add a topic…"
          error={errors.tags}
        />
        <TagInput
          label="Companies"
          values={values.companyTags}
          onChange={(companyTags) => set('companyTags', companyTags)}
          suggestions={companySuggestions}
          placeholder="Add a company…"
          error={errors.companyTags}
        />
      </section>

      <section className="card form-section">
        <div className="field">
          <label htmlFor={fid('approach')}>Approach</label>
          <textarea
            id={fid('approach')}
            rows={3}
            value={values.approach}
            onChange={(e) => set('approach', e.target.value)}
            placeholder="The key idea in a sentence or two"
            {...invalid('approach')}
          />
          {err('approach')}
        </div>
        <div className="field">
          <div className="label-row">
            <label htmlFor={fid('code')}>Solution code</label>
            <select
              aria-label="Language"
              id={fid('language')}
              value={values.language}
              onChange={(e) => set('language', e.target.value as Language)}
            >
              {Object.entries(LANGUAGES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            id={fid('code')}
            className="code-input"
            rows={12}
            spellCheck={false}
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="Paste your solution"
            {...invalid('code')}
          />
          {err('code')}
        </div>
        <div className="field">
          <label htmlFor={fid('notes')}>Notes</label>
          <textarea
            id={fid('notes')}
            rows={4}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Gotchas, edge cases, things to remember"
            {...invalid('notes')}
          />
          {err('notes')}
        </div>
      </section>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
