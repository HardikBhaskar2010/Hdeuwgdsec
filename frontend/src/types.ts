// Types mirroring the Pydantic schemas from docs/03-backend.md

export interface CutoffPreset {
  value: string;
  label: string;
}

export interface MetaResponse {
  decision_month: string;
  decision_range: [string, string];
  delivery_range: [string, string];
  timezone: string;
  cutoff_presets: CutoffPreset[];
  unit: string;
  source: {
    datasets: string[];
    fetched_at: string;
    publisher: string;
  };
}

export interface Metrics {
  mae: number | null;
  rmse: number | null;
  mbe: number | null;
  wape_pct: number | null;
  p5_error: number | null;
  p95_error: number | null;
  unit: string;
  n: number;
}

export interface Coverage {
  expected: number;
  matched: number;
  coverage_pct: number;
}

export interface Quality {
  actual_intervals: number;
  forecast_intervals: number;
  no_forecast: number;
  no_actual: number;
  duplicate_actual_keys: number;
  duplicate_forecast_keys: number;
  invalid_rows: number;
  warnings: string[];
}

export type IntervalStatus = 'MATCHED' | 'NO_FORECAST' | 'NO_ACTUAL';

export interface IntervalRow {
  start: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish_time: string | null;
  lead_hours: number | null;
  status: IntervalStatus;
}

export interface SettlementPeriodBreakdown {
  period: number;
  mae: number | null;
  mbe: number | null;
  n: number;
}

export interface LeadTimeBucket {
  bucket: string;
  mae: number | null;
  n: number;
}

export interface TopMiss {
  start: string;
  forecast: number;
  actual: number;
  error: number;
  publish_time: string;
}

export interface AnalysisResponse {
  cutoff: {
    time: string;
    timezone: string;
    rule: string;
  };
  metrics: Metrics;
  coverage: Coverage;
  quality: Quality;
  intervals: IntervalRow[];
  by_settlement_period: SettlementPeriodBreakdown[];
  by_lead_time: LeadTimeBucket[];
  top_misses: TopMiss[];
  snapshot: {
    fetched_at: string;
    manifest_sha256: string | null;
  };
}

export interface VintageRow {
  publish_time: string;
  generation: number;
  eligible: boolean;
  chosen: boolean;
}

export interface IntervalDetailResponse {
  start: string;
  cutoff_utc: string;
  actual: number | null;
  vintages: VintageRow[];
}

export interface ApiError {
  message: string;
  code?: string;
}
