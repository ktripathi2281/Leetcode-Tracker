import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProblemInput,
  LeetCodeProblemInfo,
  Problem,
  ProblemFacets,
  ProblemListQuery,
  ProblemListResponse,
  ReviewOutcome,
  StatsSummary,
  UpdateProblemInput,
} from '@lct/shared';
import { api } from './client';

export const problemKeys = {
  all: ['problems'] as const,
  lists: ['problems', 'list'] as const,
  list: (query: ProblemListQuery) => ['problems', 'list', query] as const,
  detail: (id: string) => ['problems', 'detail', id] as const,
  facets: ['problems', 'facets'] as const,
  // Under 'problems' so anything that refreshes problems refreshes the dashboard too.
  stats: ['problems', 'stats'] as const,
};

export function useProblemList(query: ProblemListQuery) {
  return useQuery({
    queryKey: problemKeys.list(query),
    queryFn: async () => (await api.get<ProblemListResponse>('/problems', { params: query })).data,
    placeholderData: keepPreviousData, // keep showing the old page while the next one loads
  });
}

export function useProblem(id: string) {
  return useQuery({
    queryKey: problemKeys.detail(id),
    queryFn: async () => (await api.get<Problem>(`/problems/${id}`)).data,
  });
}

export function useProblemFacets() {
  return useQuery({
    queryKey: problemKeys.facets,
    queryFn: async () => (await api.get<ProblemFacets>('/problems/facets')).data,
  });
}

export function useStatsSummary() {
  return useQuery({
    queryKey: problemKeys.stats,
    queryFn: async () => (await api.get<StatsSummary>('/stats/summary')).data,
  });
}

/** After a change, refresh lists, filter menus and stats, and store the fresh problem. */
function useProblemChanged() {
  const qc = useQueryClient();
  return (problem?: Problem) => {
    if (problem) qc.setQueryData(problemKeys.detail(problem.id), problem);
    void qc.invalidateQueries({ queryKey: problemKeys.lists });
    void qc.invalidateQueries({ queryKey: problemKeys.facets });
    void qc.invalidateQueries({ queryKey: problemKeys.stats });
  };
}

export function useCreateProblem() {
  const changed = useProblemChanged();
  return useMutation({
    mutationFn: async (input: CreateProblemInput) => (await api.post<Problem>('/problems', input)).data,
    onSuccess: changed,
  });
}

export function useUpdateProblem(id: string) {
  const changed = useProblemChanged();
  return useMutation({
    mutationFn: async (input: UpdateProblemInput) => (await api.patch<Problem>(`/problems/${id}`, input)).data,
    onSuccess: changed,
  });
}

export function useReviewProblem() {
  const changed = useProblemChanged();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: ReviewOutcome }) =>
      (await api.post<Problem>(`/problems/${id}/review`, { outcome })).data,
    onSuccess: changed,
  });
}

export function useDeleteProblem(id: string) {
  const qc = useQueryClient();
  const changed = useProblemChanged();
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/problems/${id}`);
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: problemKeys.detail(id) });
      changed();
    },
  });
}

export async function lookupLeetCodeProblem(slug: string) {
  return (await api.get<LeetCodeProblemInfo>(`/leetcode/problems/${encodeURIComponent(slug)}`)).data;
}
