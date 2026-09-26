import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LeetCodeAccount, SyncResponse, SyncResult } from '@lct/shared';
import { api } from '../api/client';
import { apiError, makeProblem, mockPost, renderApp, signedIn } from '../test/utils';

const result = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  added: 0,
  updated: 0,
  unchanged: 0,
  tooOld: 0,
  failed: 0,
  syncedAt: new Date().toISOString(),
  ...overrides,
});

const connectedAccount: LeetCodeAccount = {
  username: 'CodeFan',
  lastSyncedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  lastResult: result({ added: 3 }),
};

const emptyList = { problems: [], total: 0, page: 1, pages: 1 };
const noFacets = { tags: [], companies: [] };

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('auto-sync', () => {
  it('runs in the background when the app opens', async () => {
    signedIn();
    renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, alice' });
    // The sync starts in an effect, which can run just after the first paint.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/leetcode/sync', { auto: true }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the problem list when it imported something', async () => {
    let imported = false;
    signedIn({
      '/leetcode/account': connectedAccount,
      '/problems': () => (imported ? { ...emptyList, problems: [makeProblem()], total: 1 } : emptyList),
      '/problems/facets': noFacets,
    });
    mockPost({
      '/leetcode/sync': () => {
        imported = true;
        return { status: 'synced', result: result({ added: 1 }) } satisfies SyncResponse;
      },
    });
    renderApp('/problems');
    expect(await screen.findByText('Two Sum')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('connects a LeetCode account and imports straight away', async () => {
    let account: LeetCodeAccount = { username: null, lastSyncedAt: null, lastResult: null };
    signedIn({ '/leetcode/account': () => account });
    const put = vi.spyOn(api, 'put').mockImplementation(async () => {
      account = { username: 'CodeFan', lastSyncedAt: null, lastResult: null };
      return { data: account };
    });
    mockPost({ '/leetcode/sync': { status: 'synced', result: result({ added: 2, tooOld: 1 }) } });
    renderApp('/settings');

    await userEvent.type(await screen.findByLabelText('LeetCode username'), ' codefan ');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(put).toHaveBeenCalledWith('/leetcode/account', { username: 'codefan' });
    expect(await screen.findByRole('link', { name: 'CodeFan ↗' })).toHaveAttribute('href', 'https://leetcode.com/u/CodeFan/');
    expect(await screen.findByText('2 new problems added (1 older than 3 months skipped)')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/leetcode/sync', {});
  });

  it('shows why a username was rejected', async () => {
    signedIn();
    vi.spyOn(api, 'put').mockRejectedValue(apiError(404, { message: 'No LeetCode user named "ghost"' }));
    renderApp('/settings');
    await userEvent.type(await screen.findByLabelText('LeetCode username'), 'ghost');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No LeetCode user named "ghost"');
  });

  it('checks the username format before asking the server', async () => {
    signedIn();
    const put = vi.spyOn(api, 'put');
    renderApp('/settings');
    await userEvent.type(await screen.findByLabelText('LeetCode username'), 'bad name!');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('LeetCode usernames only use');
    expect(put).not.toHaveBeenCalled();
  });

  it('shows the connected account and can disconnect', async () => {
    signedIn({ '/leetcode/account': connectedAccount });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined });
    renderApp('/settings');

    expect(await screen.findByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('3 new problems added')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(del).toHaveBeenCalledWith('/leetcode/account');
    expect(await screen.findByLabelText('LeetCode username')).toBeInTheDocument();
  });
});

describe('sync bar on the problem list', () => {
  it('invites you to connect when no account is linked', async () => {
    signedIn({ '/problems': emptyList, '/problems/facets': noFacets });
    renderApp('/problems');
    expect(await screen.findByRole('link', { name: 'Import your recent solves' })).toHaveAttribute('href', '/settings');
  });

  it('shows the last sync and syncs on demand', async () => {
    signedIn({ '/leetcode/account': connectedAccount, '/problems': emptyList, '/problems/facets': noFacets });
    renderApp('/problems');
    expect(await screen.findByText('Synced from LeetCode 2 hours ago')).toBeInTheDocument();

    mockPost({ '/leetcode/sync': { status: 'synced', result: result({ unchanged: 4 }) } });
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Already up to date')).toBeInTheDocument();
  });

  it('reports sync errors', async () => {
    signedIn({ '/leetcode/account': connectedAccount, '/problems': emptyList, '/problems/facets': noFacets });
    renderApp('/problems');
    await screen.findByText('Synced from LeetCode 2 hours ago');

    mockPost({ '/leetcode/sync': () => apiError(429, { message: 'Synced a moment ago. Try again in a minute.' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByText('Synced a moment ago. Try again in a minute.')).toBeInTheDocument());
  });
});
