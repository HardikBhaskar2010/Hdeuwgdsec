import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { IntervalDetailResponse } from '../types';

export function useInterval(start: string | null, cutoff: string) {
  return useQuery<IntervalDetailResponse, Error>({
    queryKey: ['interval', start, cutoff],
    queryFn: ({ signal }) => api.intervalDetail(start!, cutoff, signal),
    enabled: !!start,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
