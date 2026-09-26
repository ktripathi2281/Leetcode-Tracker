import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { AuthUser } from '@lct/shared';
import App from './App';
import { api } from './api/client';
import { getToken, setToken } from './auth/tokenStorage';

const alice: AuthUser = { id: 'u1', username: 'alice', email: 'alice@example.com' };
const health = { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };

function apiError(status: number, message: string) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data: { message }, config, headers: {}, statusText: '' } as AxiosResponse;
  return new AxiosError(message, String(status), config, null, response);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/health') return { data: health };
    throw new Error(`Unexpected GET ${url}`);
  });
});

describe('signed out', () => {
  it('redirects protected pages to sign in', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates the form before calling the server', async () => {
    const post = vi.spyOn(api, 'post');
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('signs in and shows the home page', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { token: 'tok', user: alice } });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'Alice@Example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back, alice' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'alice@example.com', password: 'correct-horse-1' });
    expect(getToken()).toBe('tok');
  });

  it('shows the server error when sign in fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(apiError(401, 'Invalid email or password'));
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('checks registration rules on the client', async () => {
    const post = vi.spyOn(api, 'post');
    renderAt('/register');
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
    setToken('tok');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: alice };
      if (url === '/health') return { data: health };
      throw new Error(`Unexpected GET ${url}`);
    });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back, alice' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('clears an expired session and asks to sign in again', async () => {
    setToken('expired');
    vi.mocked(api.get).mockRejectedValue(apiError(401, 'Please sign in to continue.'));
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});
