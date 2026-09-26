import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentLogDetail,
  AgentLogListResponse,
  AgentLogQuery,
  AgentName,
  AgentStats,
  AgentUsage,
  Problem,
  TutorMessage,
  TutorReply,
  WeeklyPlan,
} from '@lct/shared';
import { api } from './client';
import { problemKeys } from './problems';

export const aiKeys = {
  usage: ['ai', 'usage'] as const,
  latestPlan: ['ai', 'plan', 'latest'] as const,
  logs: ['ai', 'logs'] as const,
  logList: (query: AgentLogQuery) => ['ai', 'logs', 'list', query] as const,
  log: (id: string) => ['ai', 'logs', 'detail', id] as const,
  stats: ['ai', 'logs', 'stats'] as const,
};

export function useAiUsage() {
  return useQuery({
    queryKey: aiKeys.usage,
    queryFn: async () => (await api.get<AgentUsage[]>('/ai/usage')).data,
  });
}

/** Today's usage of one agent, e.g. to show "18 of 20 left today". */
export function useAgentUsage(agent: AgentName) {
  return useAiUsage().data?.find((u) => u.agent === agent);
}

/** After any agent call, refresh the usage counters (a failed call is refunded) and the logs. */
function useRefreshUsage() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: aiKeys.usage });
    void qc.invalidateQueries({ queryKey: aiKeys.logs });
  };
}

export function usePostMortem(problemId: string) {
  const qc = useQueryClient();
  const refreshUsage = useRefreshUsage();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ problem: Problem; usage: AgentUsage }>(`/ai/post-mortem/${problemId}`)).data,
    onSuccess: ({ problem }) => qc.setQueryData(problemKeys.detail(problem.id), problem),
    onSettled: refreshUsage,
  });
}

export function useTutor(problemId: string) {
  const refreshUsage = useRefreshUsage();
  return useMutation({
    mutationFn: async (input: { messages: TutorMessage[]; includeCode: boolean }) =>
      (await api.post<TutorReply>(`/ai/tutor/${problemId}`, input)).data,
    onSettled: refreshUsage,
  });
}

export function useLatestPlan() {
  return useQuery({
    queryKey: aiKeys.latestPlan,
    queryFn: async () => (await api.get<{ plan: WeeklyPlan | null }>('/ai/weekly-plan/latest')).data.plan,
  });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  const refreshUsage = useRefreshUsage();
  return useMutation({
    mutationFn: async (minutesPerDay: number) =>
      (await api.post<{ plan: WeeklyPlan; usage: AgentUsage }>('/ai/weekly-plan', { minutesPerDay })).data.plan,
    onSuccess: (plan) => qc.setQueryData(aiKeys.latestPlan, plan),
    onSettled: refreshUsage,
  });
}

export function useAgentLogs(query: AgentLogQuery) {
  return useQuery({
    queryKey: aiKeys.logList(query),
    queryFn: async () => (await api.get<AgentLogListResponse>('/ai/logs', { params: query })).data,
    placeholderData: keepPreviousData,
  });
}

/** A run's full trace; the page only asks for it once the run is opened. */
export function useAgentLog(id: string) {
  return useQuery({
    queryKey: aiKeys.log(id),
    queryFn: async () => (await api.get<AgentLogDetail>(`/ai/logs/${id}`)).data,
    staleTime: Infinity, // a finished run never changes
  });
}

export function useAgentStats() {
  return useQuery({
    queryKey: aiKeys.stats,
    queryFn: async () => (await api.get<AgentStats[]>('/ai/logs/stats')).data,
  });
}
