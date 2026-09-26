import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { api } from './api/client';

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('shows the server as running when the health check succeeds', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { status: 'ok', timestamp: new Date().toISOString() } });
    render(<App />);
    expect(await screen.findByText('Server is running')).toBeInTheDocument();
  });

  it('shows the server as unreachable when the health check fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network'));
    render(<App />);
    expect(await screen.findByText('Server is not reachable')).toBeInTheDocument();
  });
});
