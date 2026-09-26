import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@lct/shared';
import { api, setUnauthorizedHandler } from '../api/client';
import { clearToken, getToken, setToken } from './tokenStorage';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    getToken() ? { status: 'loading' } : { status: 'anonymous' },
  );

  const logout = useCallback(() => {
    clearToken();
    setState({ status: 'anonymous' });
  }, []);

  // A stored token may be expired or belong to a deleted account, so confirm it with the server.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .get<AuthUser>('/auth/me')
      .then((res) => !cancelled && setState({ status: 'authenticated', user: res.data }))
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) clearToken();
        setState({ status: 'anonymous' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(undefined);
  }, [logout]);

  const signIn = useCallback((data: AuthResponse) => {
    setToken(data.token);
    setState({ status: 'authenticated', user: data.user });
  }, []);

  const login = useCallback(
    async (input: LoginInput) => signIn((await api.post<AuthResponse>('/auth/login', input)).data),
    [signIn],
  );

  const register = useCallback(
    async (input: RegisterInput) => signIn((await api.post<AuthResponse>('/auth/register', input)).data),
    [signIn],
  );

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages behind RequireAuth, where the user is always signed in. */
export function useCurrentUser(): AuthUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser used outside a signed-in page');
  return state.user;
}
