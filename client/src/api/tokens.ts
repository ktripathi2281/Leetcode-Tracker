import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiTokenSummary, CreatedToken } from '@lct/shared';
import { api } from './client';

const tokenKeys = { all: ['tokens'] as const };

export function useTokens() {
  return useQuery({
    queryKey: tokenKeys.all,
    queryFn: async () => (await api.get<ApiTokenSummary[]>('/tokens')).data,
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await api.post<CreatedToken>('/tokens', { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/tokens/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}

/** The address the extension should call: the same API this app uses. */
export const extensionApiUrl = () => {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  return new URL(base, window.location.origin).href.replace(/\/+$/, '');
};
