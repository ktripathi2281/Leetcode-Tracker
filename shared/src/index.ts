// Types, constants and validation shared by the server, client and (later) the extension.

export * from './ai';
export * from './auth';
export * from './constants';
export * from './extension';
export * from './leetcode';
export * from './problems';
export * from './reviews';
export * from './stats';
export * from './sync';

export interface HealthResponse {
  status: 'ok';
  db: 'connected' | 'disconnected';
  timestamp: string;
}

export interface ApiError {
  message: string;
  issues?: { path: string; message: string }[];
  /** On a 409 for a problem that's already tracked: the existing problem's ID. */
  existingId?: string;
}
