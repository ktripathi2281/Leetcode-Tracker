// Types and constants shared by the server, client and (later) the extension.

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const STATUSES = ['Todo', 'Attempted', 'Solved', 'Reviewing', 'Mastered'] as const;
export type Status = (typeof STATUSES)[number];

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  message: string;
  issues?: { path: string; message: string }[];
}
