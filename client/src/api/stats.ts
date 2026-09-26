import { useQuery } from '@tanstack/react-query';
import type { ActivityStats, CompanyStats, TopicStats } from '@lct/shared';
import { api } from './client';
import { problemKeys } from './problems';

// Under problemKeys.stats, so every problem change or sync refreshes them.
const statsKeys = {
  activity: [...problemKeys.stats, 'activity'] as const,
  topics: [...problemKeys.stats, 'topics'] as const,
  companies: [...problemKeys.stats, 'companies'] as const,
};

export function useActivityStats() {
  return useQuery({
    queryKey: statsKeys.activity,
    queryFn: async () => (await api.get<ActivityStats>('/stats/activity')).data,
  });
}

export function useTopicStats() {
  return useQuery({
    queryKey: statsKeys.topics,
    queryFn: async () => (await api.get<TopicStats[]>('/stats/topics')).data,
  });
}

export function useCompanyStats() {
  return useQuery({
    queryKey: statsKeys.companies,
    queryFn: async () => (await api.get<CompanyStats[]>('/stats/companies')).data,
  });
}
