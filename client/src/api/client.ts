import axios from 'axios';
import { TIMEZONE_HEADER, type ApiError } from '@lct/shared';
import { getToken } from '../auth/tokenStorage';

// Same-origin '/api' in development (proxied by Vite); set VITE_API_URL in production.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

// The browser's time zone, so the server's "due today" matches the user's calendar day.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (timeZone) config.headers[TIMEZONE_HEADER] = timeZone;
  return config;
});

// Called when a signed-in request comes back 401 (expired token, deleted account).
let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler;
}

api.interceptors.response.use(undefined, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.headers?.Authorization) {
    onUnauthorized?.();
  }
  return Promise.reject(error);
});

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.response?.data?.message) return error.response.data.message;
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
