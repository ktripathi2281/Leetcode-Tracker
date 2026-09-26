import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client';
import { getToken } from '../auth/tokenStorage';
import SlowServerNotice from '../components/SlowServerNotice';
import { alice, apiError, health, mockGet, mockPost, renderApp, signedIn } from '../test/utils';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('password reset pages', () => {
  it('requests a reset link', async () => {
    mockGet({ '/health': health });
    const post = mockPost({ '/auth/forgot-password': { message: "If an account uses a@b.co, we've sent it a link to reset the password." } });
    renderApp('/forgot-password');

    await userEvent.type(screen.getByLabelText('Email'), 'A@B.co');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'a@b.co' });
    expect(await screen.findByText(/we've sent it a link/)).toBeInTheDocument();
  });

  it('sets a new password from the link', async () => {
    mockGet({ '/health': health });
    const token = 'x'.repeat(43);
    const post = mockPost({ '/auth/reset-password': { message: 'Password changed. Sign in with your new password.' } });
    renderApp(`/reset-password?token=${token}`);

    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(post).toHaveBeenCalledWith('/auth/reset-password', { token, password: 'brand-new-pass' });
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('offers a new link when the old one expired', async () => {
    mockGet({ '/health': health });
    mockPost({ '/auth/reset-password': () => apiError(400, { message: 'This reset link has expired or was already used. Ask for a new one.' }) });
    renderApp(`/reset-password?token=${'x'.repeat(43)}`);
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link', { name: 'Get a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('explains a broken link', () => {
    mockGet({ '/health': health });
    renderApp('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent('This reset link is incomplete');
  });

  it('links to it from sign in', async () => {
    mockGet({ '/health': health });
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });
});

describe('privacy policy', () => {
  it('is readable without signing in, and linked from sign-up', async () => {
    mockGet({ '/health': health });
    renderApp('/register');
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy');
    await userEvent.click(screen.getByRole('link', { name: 'privacy policy' }));
    expect(await screen.findByRole('heading', { name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.getByText(/deleted automatically after 90 days/)).toBeInTheDocument();
  });
});

describe('account settings', () => {
  const account = () => screen.findByRole('region', { name: 'Account' });

  it('changes the password and keeps this session with the new token', async () => {
    signedIn();
    mockPost({
      '/leetcode/sync': { status: 'not-connected' },
      '/account/change-password': { token: 'new-token', user: alice },
    });
    renderApp('/settings');

    const section = await account();
    await userEvent.type(within(section).getByLabelText('Current password'), 'old-password-1');
    await userEvent.type(within(section).getByLabelText('New password'), 'new-password-2');
    await userEvent.click(within(section).getByRole('button', { name: 'Change password' }));

    expect(await within(section).findByText(/signed out on your other devices/)).toBeInTheDocument();
    expect(getToken()).toBe('new-token');
  });

  it('signs out everywhere', async () => {
    signedIn();
    mockPost({ '/leetcode/sync': { status: 'not-connected' }, '/account/sign-out-everywhere': {} });
    renderApp('/settings');
    await userEvent.click(within(await account()).getByRole('button', { name: 'Sign out everywhere' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('deletes the account only after the password and typed confirmation', async () => {
    signedIn();
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined });
    renderApp('/settings');

    const section = await account();
    await userEvent.click(within(section).getByRole('button', { name: 'Delete my account…' }));
    const confirm = within(section).getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(section).getByLabelText('Your password'), 'password-123');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(section).getByLabelText('Type alice to confirm'), 'alice');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(del).toHaveBeenCalledWith('/account', { data: { password: 'password-123' } });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('slow server notice', () => {
  afterEach(() => vi.useRealTimers());

  it('appears only after a few seconds', () => {
    vi.useFakeTimers();
    render(<SlowServerNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_100));
    expect(screen.getByRole('status')).toHaveTextContent('Waking up the server');
  });
});
