import type { AnalysisResponse, IntervalDetailResponse, MetaResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function fetchJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.detail ?? msg;
    } catch {
      // ignore parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: (signal?: AbortSignal) =>
    fetchJSON<{ status: string; snapshot_loaded: boolean; snapshot_fetched_at: string | null }>(
      '/health',
      signal,
    ),

  meta: (signal?: AbortSignal) => fetchJSON<MetaResponse>('/api/v1/meta', signal),

  analysis: (cutoff: string, signal?: AbortSignal) =>
    fetchJSON<AnalysisResponse>(`/api/v1/analysis?cutoff=${encodeURIComponent(cutoff)}`, signal),

  intervalDetail: (start: string, cutoff: string, signal?: AbortSignal) =>
    fetchJSON<IntervalDetailResponse>(
      `/api/v1/intervals/${encodeURIComponent(start)}?cutoff=${encodeURIComponent(cutoff)}`,
      signal,
    ),
};
