import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from './api/client';
import { getToken } from './auth/tokenStorage';
import { alice, apiError, health, mockGet, renderApp, signedIn } from './test/utils';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function fillLogin(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('signed out', () => {
  beforeEach(() => {
    mockGet({ '/health': health, '/problems': { problems: [], total: 0, page: 1, pages: 1 }, '/problems/facets': { tags: [], companies: [] } });
  });

  it('redirects protected pages to sign in', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates the form before calling the server', async () => {
    const post = vi.spyOn(api, 'post');
    renderApp('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('signs in and shows the home page', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { token: 'tok', user: alice } });
    renderApp('/login');
    await fillLogin('Alice@Example.com', 'correct-horse-1');

    expect(await screen.findByRole('heading', { name: 'Welcome back, alice' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'alice@example.com', password: 'correct-horse-1' });
    expect(getToken()).toBe('tok');
  });

  it('returns to the page that required sign in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { token: 'tok', user: alice } });
    renderApp('/problems');
    await fillLogin('alice@example.com', 'correct-horse-1');
    expect(await screen.findByRole('heading', { name: 'Problems' })).toBeInTheDocument();
  });

  it('shows the server error when sign in fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(apiError(401, { message: 'Invalid email or password' }));
    renderApp('/login');
    await fillLogin('alice@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('checks registration rules on the client', async () => {
    const post = vi.spyOn(api, 'post');
    renderApp('/register');
    await userEvent.type(screen.getByLabelText('Username'), 'al');
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('with a saved session', () => {
  it('restores the session and can sign out', async () => {
    signedIn();
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back, alice' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('links to settings from your name in the header', async () => {
    signedIn();
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Settings for alice' })).toHaveAttribute('href', '/settings');
  });

  it('clears an expired session and asks to sign in again', async () => {
    signedIn({ '/auth/me': () => apiError(401, { message: 'Please sign in to continue.' }) });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});
