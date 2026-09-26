import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectLeetCodeInput, LeetCodeAccount, SyncResponse } from '@lct/shared';
import { api } from './client';
import { problemKeys } from './problems';

export const leetCodeKeys = { account: ['leetcode', 'account'] as const };

const DISCONNECTED: LeetCodeAccount = { username: null, lastSyncedAt: null, lastResult: null };

export function useLeetCodeAccount() {
  return useQuery({
    queryKey: leetCodeKeys.account,
    queryFn: async () => (await api.get<LeetCodeAccount>('/leetcode/account')).data,
  });
}

/** After a sync: refresh the account's "last synced", and the problem lists if anything changed. */
function useSyncFinished() {
  const qc = useQueryClient();
  return async (res: SyncResponse) => {
    if (res.status !== 'synced') return;
    const refresh = async (queryKey: readonly string[]) => {
      // A load still in flight started before the sync and would bring back stale data;
      // invalidating alone doesn't restart it, so cancel it first.
      await qc.cancelQueries({ queryKey });
      await qc.invalidateQueries({ queryKey });
    };
    await refresh(leetCodeKeys.account);
    if (res.result.added > 0 || res.result.updated > 0) await refresh(problemKeys.all);
  };
}

export function useSyncNow() {
  const finished = useSyncFinished();
  return useMutation({
    mutationFn: async () => (await api.post<SyncResponse>('/leetcode/sync', {})).data,
    onSuccess: finished,
  });
}

export function useConnectLeetCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectLeetCodeInput) => (await api.put<LeetCodeAccount>('/leetcode/account', input)).data,
    onSuccess: (account) => qc.setQueryData(leetCodeKeys.account, account),
  });
}

export function useDisconnectLeetCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/leetcode/account');
    },
    onSuccess: () => qc.setQueryData(leetCodeKeys.account, DISCONNECTED),
  });
}

/**
 * Syncs in the background once per visit. The server skips it if the last sync is recent,
 * so this is cheap; it exists because LeetCode only shares the 20 most recent solves.
 */
export function useAutoSync() {
  const finished = useSyncFinished();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<SyncResponse>('/leetcode/sync', { auto: true })
      .then((res) => finished(res.data))
      .catch(() => {
        // Background task: the Sync now button reports errors when used.
      });
  }, [finished]);
}
