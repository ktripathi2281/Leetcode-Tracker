import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiTokenSummary } from '@lct/shared';
import { api } from '../api/client';
import { mockPost, renderApp, signedIn } from '../test/utils';

const chrome: ApiTokenSummary = {
  id: 't1',
  name: 'Chrome',
  preview: 'lct_Ab12Cd',
  createdAt: '2026-09-20T10:00:00.000Z',
  lastUsedAt: new Date(Date.now() - 3_600_000).toISOString(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('browser extension settings', () => {
  it('creates a token and shows it once, with the API address to paste', async () => {
    let tokens: ApiTokenSummary[] = [];
    signedIn({ '/tokens': () => tokens });
    const post = mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/tokens': (body) => {
        tokens = [{ ...chrome, name: (body as { name: string }).name, lastUsedAt: null }];
        return { ...tokens[0], token: 'lct_full-secret-token' };
      },
    });
    renderApp('/settings');

    const section = await screen.findByRole('region', { name: 'Browser extension' });
    const name = within(section).getByLabelText('Token name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Laptop');
    await userEvent.click(within(section).getByRole('button', { name: 'Create token' }));

    expect(post).toHaveBeenCalledWith('/tokens', { name: 'Laptop' });
    expect(await within(section).findByLabelText('Access token')).toHaveValue('lct_full-secret-token');
    expect(within(section).getByLabelText('API address')).toHaveValue(`${window.location.origin}/api`);
    expect(within(section).getByText(/won't be shown again/)).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('button', { name: 'Done' }));
    expect(within(section).queryByDisplayValue('lct_full-secret-token')).not.toBeInTheDocument();
    expect(await within(section).findByText('Laptop')).toBeInTheDocument();
    expect(within(section).getByText(/never used/)).toBeInTheDocument();
  });

  it('asks before revoking a token', async () => {
    signedIn({ '/tokens': [chrome] });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined });
    renderApp('/settings');

    const list = await screen.findByRole('list', { name: 'Your tokens' });
    expect(within(list).getByText(/last used 1 hour ago/)).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Revoke' }));
    expect(del).not.toHaveBeenCalled();

    const confirm = within(list).getByRole('group', { name: 'Confirm revoking Chrome' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    expect(del).toHaveBeenCalledWith('/tokens/t1');
  });

  it('requires a name', async () => {
    signedIn();
    const post = mockPost({ '/leetcode/sync': { status: 'not-connected' } });
    renderApp('/settings');
    const section = await screen.findByRole('region', { name: 'Browser extension' });
    await userEvent.clear(within(section).getByLabelText('Token name'));
    await userEvent.click(within(section).getByRole('button', { name: 'Create token' }));
    expect(within(section).getByRole('alert')).toHaveTextContent('Name the token');
    expect(post).not.toHaveBeenCalledWith('/tokens', expect.anything());
  });
});
