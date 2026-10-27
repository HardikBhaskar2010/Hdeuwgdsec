import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { AnalysisResponse } from '../types';

export function useAnalysis(cutoff: string) {
  return useQuery<AnalysisResponse, Error>({
    queryKey: ['analysis', cutoff],
    queryFn: ({ signal }) => api.analysis(cutoff, signal),
    staleTime: 5 * 60 * 1000, // 5 min — snapshot doesn't change
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
