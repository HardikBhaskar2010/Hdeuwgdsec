import type { AnalysisResponse, IntervalDetailResponse, MetaResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function extractErrorMessage(body: unknown, status: number, statusText: string): string {
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    // Check error.message (custom API error)
    if (b.error && typeof b.error === 'object' && typeof (b.error as Record<string, unknown>).message === 'string') {
      return (b.error as Record<string, unknown>).message as string;
    }
    // Check detail as string (standard FastAPI HTTPException)
    if (typeof b.detail === 'string') {
      return b.detail;
    }
    // Check detail as array (FastAPI 422 RequestValidationError)
    if (Array.isArray(b.detail)) {
      const msgs = b.detail
        .map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item)))
        .filter(Boolean);
      if (msgs.length > 0) return msgs.join('; ');
    }
    // Check detail as nested object
    if (b.detail && typeof b.detail === 'object') {
      const detailObj = b.detail as Record<string, unknown>;
      if (detailObj.error && typeof detailObj.error === 'object' && typeof (detailObj.error as Record<string, unknown>).message === 'string') {
        return (detailObj.error as Record<string, unknown>).message as string;
      }
      if (typeof detailObj.message === 'string') {
        return detailObj.message;
      }
    }
    // Check top-level message
    if (typeof b.message === 'string') {
      return b.message;
    }
  }
  return `HTTP ${status}${statusText ? ` (${statusText})` : ''}`;
}

async function fetchJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
    try {
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        msg = extractErrorMessage(body, res.status, res.statusText);
      } catch {
        // Non-JSON or malformed JSON response
        const trimmed = text ? text.trim() : '';
        if (trimmed && !trimmed.startsWith('<')) {
          msg = trimmed.slice(0, 200);
        }
      }
    } catch {
      // ignore stream read error, keep fallback msg
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
