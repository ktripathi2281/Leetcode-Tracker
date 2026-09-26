import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import type { AuthUser, LeetCodeAccount, Problem } from '@lct/shared';
import App from '../App';
import { api } from '../api/client';
import { setToken } from '../auth/tokenStorage';

export const alice: AuthUser = { id: 'u1', username: 'alice', email: 'alice@example.com' };
export const health = { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function apiError(status: number, data: object) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data, config, headers: {}, statusText: '' } as AxiosResponse;
  return new AxiosError('Request failed', String(status), config, null, response);
}

type Handler = (params?: Record<string, unknown>) => unknown;

/** Answers GET requests by exact URL; unknown URLs fail the test loudly. */
export function mockGet(routes: Record<string, Handler | object>) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: AxiosRequestConfig) => {
    if (!(url in routes)) throw new Error(`Unexpected GET ${url}`);
    const route = routes[url]!;
    const data = typeof route === 'function' ? (route as Handler)(config?.params as Record<string, unknown> | undefined) : route;
    if (data instanceof Error) throw data;
    return { data };
  });
}

export const disconnected: LeetCodeAccount = { username: null, lastSyncedAt: null, lastResult: null };

/** Answers POST requests by exact URL, like mockGet. */
export function mockPost(routes: Record<string, Handler | object>) {
  return vi.spyOn(api, 'post').mockImplementation(async (url: string, body?: unknown) => {
    if (!(url in routes)) throw new Error(`Unexpected POST ${url}`);
    const route = routes[url]!;
    const data = typeof route === 'function' ? (route as Handler)(body as Record<string, unknown>) : route;
    if (data instanceof Error) throw data;
    return { data };
  });
}

/**
 * Signed in as alice, with the auth check answered, no LeetCode account connected,
 * and the background auto-sync answered.
 */
export function signedIn(routes: Record<string, Handler | object> = {}) {
  setToken('tok');
  mockPost({ '/leetcode/sync': { status: 'not-connected' } });
  return mockGet({ '/auth/me': alice, '/health': health, '/leetcode/account': disconnected, ...routes });
}

export function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'p1',
    title: 'Two Sum',
    slug: 'two-sum',
    leetcodeNumber: 1,
    difficulty: 'Easy',
    status: 'Todo',
    link: 'https://leetcode.com/problems/two-sum/',
    tags: ['Array', 'Hash Table'],
    companyTags: [],
    language: 'python',
    code: '',
    approach: '',
    notes: '',
    timeTakenMinutes: null,
    lastSolvedAt: null,
    source: 'manual',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}
