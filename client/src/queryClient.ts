import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry network blips, but not answers like 404 that won't change on retry.
        retry: (failureCount, error) =>
          failureCount < 2 && !(axios.isAxiosError(error) && error.response && error.response.status < 500),
      },
    },
  });
}
