"""Pydantic response schemas matching the API contract in docs/03-backend.md."""

from __future__ import annotations

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ── /health ──────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    snapshot_loaded: bool
    snapshot_fetched_at: str | None = None


# ── /api/v1/meta ─────────────────────────────────────────────────────────────


class CutoffPreset(BaseModel):
    value: str
    label: str


class MetaSource(BaseModel):
    datasets: list[str]
    fetched_at: str
    publisher: str


class MetaResponse(BaseModel):
    decision_month: str
    decision_range: list[str]
    delivery_range: list[str]
    timezone: str
    cutoff_presets: list[CutoffPreset]
    unit: str
    source: MetaSource


# ── /api/v1/analysis ─────────────────────────────────────────────────────────


class CutoffInfo(BaseModel):
    time: str
    timezone: str
    rule: str


class Metrics(BaseModel):
    mae: float | None = None
    rmse: float | None = None
    mbe: float | None = None
    wape_pct: float | None = None
    p5_error: float | None = None
    p95_error: float | None = None
    unit: str = "MW"
    n: int


class Coverage(BaseModel):
    expected: int
    matched: int
    coverage_pct: float


class Quality(BaseModel):
    actual_intervals: int
    forecast_intervals: int
    no_forecast: int
    no_actual: int
    duplicate_actual_keys: int
    duplicate_forecast_keys: int
    invalid_rows: int
    warnings: list[str]


class IntervalRow(BaseModel):
    start: str
    forecast: float | None = None
    actual: float | None = None
    error: float | None = None
    publish_time: str | None = None
    lead_hours: float | None = None
    status: str  # MATCHED | NO_FORECAST | NO_ACTUAL


class SettlementPeriodBreakdown(BaseModel):
    period: int
    mae: float | None = None
    mbe: float | None = None
    n: int


class LeadTimeBucket(BaseModel):
    bucket: str
    mae: float | None = None
    n: int


class TopMiss(BaseModel):
    start: str
    forecast: float
    actual: float
    error: float
    publish_time: str


class SnapshotInfo(BaseModel):
    fetched_at: str
    manifest_sha256: str | None = None


class AnalysisResponse(BaseModel):
    cutoff: CutoffInfo
    metrics: Metrics
    coverage: Coverage
    quality: Quality
    intervals: list[IntervalRow]
    by_settlement_period: list[SettlementPeriodBreakdown]
    by_lead_time: list[LeadTimeBucket]
    top_misses: list[TopMiss]
    snapshot: SnapshotInfo


# ── /api/v1/intervals/{start} ─────────────────────────────────────────────────


class VintageRow(BaseModel):
    publish_time: str
    generation: float
    eligible: bool
    chosen: bool


class IntervalDetailResponse(BaseModel):
    start: str
    cutoff_utc: str
    actual: float | None = None
    vintages: list[VintageRow]
