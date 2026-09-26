import type { Difficulty, Status } from '@lct/shared';

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`badge diff-${difficulty.toLowerCase()}`}>{difficulty}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{status}</span>;
}
