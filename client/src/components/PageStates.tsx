import type { ReactNode } from 'react';
import { getErrorMessage } from '../api/client';

export function Loading() {
  return <div className="page-spinner" role="status" aria-label="Loading" />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <p className="empty-title">Couldn't load this</p>
      <p className="muted">{getErrorMessage(error)}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
