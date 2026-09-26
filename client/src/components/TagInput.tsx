import { useId, useState, type KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  error?: string;
}

const MAX_SUGGESTIONS = 8;

/** Chips with a text box: Enter or comma adds, Backspace on an empty box removes the last one. */
export default function TagInput({ label, values, onChange, suggestions, placeholder, error }: TagInputProps) {
  const id = useId();
  const [text, setText] = useState('');

  const has = (tag: string) => values.some((v) => v.toLowerCase() === tag.toLowerCase());

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').trim();
    if (tag && !has(tag)) {
      // Reuse a suggestion's spelling, so "hash table" becomes "Hash Table".
      const known = suggestions.find((s) => s.toLowerCase() === tag.toLowerCase());
      onChange([...values, known ?? tag]);
    }
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const query = text.trim().toLowerCase();
  const matches = suggestions
    .filter((s) => !has(s) && (!query || s.toLowerCase().includes(query)))
    .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`tag-box${error ? ' invalid' : ''}`}>
        {values.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add(text)}
          placeholder={values.length ? '' : placeholder}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
      {matches.length > 0 && (
        <div className="suggestions" aria-label={`Suggested ${label.toLowerCase()}`}>
          {matches.map((s) => (
            <button type="button" key={s} className="suggestion" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
