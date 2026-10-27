# 03: Backend

## Stack (minimal)

| Piece | Choice | Notes |
|---|---|---|
| Python | 3.12 | Boring, wheels everywhere. |
| Web | FastAPI + uvicorn | Async, typed, auto OpenAPI at `/docs` |
| Models | Pydantic v2 (+ pydantic-settings) | Response contracts and env config |
| Analysis | pandas | About 1.5k actuals and tens of thousands of forecast rows; fine |
| Fetch script only | httpx | Not imported by the app |
| Tooling | uv (lockfile), ruff, pytest | Commit `uv.lock` |

Do not pin versions from this spec. Install latest stable compatible and let the lockfile record it.

## Principle

**Load once, compute pure, serve read-only.** No upstream HTTP in the request path.

```
scripts/fetch_snapshot.py  --(one-off, httpx)-->  data/snapshot/*.json + manifest.json
backend startup (lifespan) --> load + normalise + validate (cache in app.state)
GET /api/v1/analysis       --> select -> join -> metrics (cached per cutoff)
```

## Layout

```
backend/
  pyproject.toml  uv.lock  Dockerfile
  src/app/
    main.py            # app, lifespan (load snapshot), CORS, routers
    config.py          # Settings: CORS_ORIGINS, SNAPSHOT_DIR, LOG_LEVEL, DEFAULT_CUTOFF
    schemas.py         # Pydantic response models
    data/loader.py     # read snapshot + manifest -> raw DataFrames
    data/normalise.py  # parse tz, WIND filter, dedupe, validate -> clean frames + quality counts
    analysis/cutoff.py     # cutoff(T) construction (zoneinfo)
    analysis/selection.py  # pick latest publishTime <= cutoff
    analysis/metrics.py    # MAE/RMSE/MBE/WAPE/quantiles/breakdowns
    analysis/service.py    # orchestrates -> AnalysisResult (lru_cache by cutoff)
    api/routes.py
  tests/
    fixtures/              # tiny real samples from probe_elexon.py
    test_cutoff.py test_normalise.py test_selection.py test_metrics.py test_api.py
scripts/
  fetch_snapshot.py        # chunked, retried, writes manifest
data/snapshot/             # committed, dated, with manifest
```

Rule: `selection.py` and `metrics.py` are pure functions on DataFrames. No I/O, no FastAPI imports.

## API contract

All read-only `GET`, JSON. Errors use `{"error": {"code": str, "message": str}}`; no stack traces.

### `GET /health`
`{"status":"ok","snapshot_loaded":true,"snapshot_fetched_at":"..."}`

### `GET /api/v1/meta`
Scope and presets for the UI.
```json
{
  "decision_month": "2026-01",
  "decision_range": ["2026-01-01","2026-01-31"],
  "delivery_range": ["2026-01-02","2026-02-01"],
  "timezone": "Europe/London",
  "cutoff_presets": [
    {"value":"15:30","label":"15:30 (GB half-hourly day-ahead auction), default"},
    {"value":"09:50","label":"09:50 (N2EX day-ahead gate closure)"}
  ],
  "unit": "MW",
  "source": {"datasets":["FUELHH","WINDFOR"],"fetched_at":"...","publisher":"Elexon BMRS"}
}
```

### `GET /api/v1/analysis?cutoff=15:30`
`cutoff` must be `HH:MM` within the allowed presets (or any valid time if you choose to allow custom; 422 otherwise). `decision_month` is fixed at `2026-01`; accept it as an optional param and 422 for anything else.

```json
{
  "cutoff": {"time":"15:30","timezone":"Europe/London","rule":"latest forecast with publishTime <= cutoff on day before delivery"},
  "metrics": {"mae":0.0,"rmse":0.0,"mbe":0.0,"wape_pct":0.0,
              "p5_error":0.0,"p95_error":0.0,"unit":"MW","n":0},
  "coverage": {"expected":1488,"matched":0,"coverage_pct":0.0},
  "quality": {"actual_intervals":0,"forecast_intervals":0,"no_forecast":0,"no_actual":0,
              "duplicate_actual_keys":0,"duplicate_forecast_keys":0,"invalid_rows":0,"warnings":[]},
  "intervals": [
    {"start":"2026-01-02T00:00:00Z","forecast":null,"actual":null,"error":null,
     "publish_time":null,"lead_hours":null,"status":"MATCHED|NO_FORECAST|NO_ACTUAL"}
  ],
  "by_settlement_period": [{"period":1,"mae":0.0,"mbe":0.0,"n":0}],
  "by_lead_time": [{"bucket":"24-30h","mae":0.0,"n":0}],
  "top_misses": [{"start":"...","forecast":0,"actual":0,"error":0,"publish_time":"..."}],
  "snapshot": {"fetched_at":"...","manifest_sha256":"..."}
}
```
`intervals` is about 1.5k rows; fine to return whole (a few hundred KB, gzip on). Use `null`, never `0`, for missing.

### `GET /api/v1/intervals/{start}?cutoff=15:30`
Drilldown: all vintages for that target with `eligible` (publishTime <= cutoff) and `chosen` flags, plus the actual. This is what makes the selection rule visible in the demo and the video.
```json
{"start":"...","cutoff_utc":"...","actual":0,
 "vintages":[{"publish_time":"...","generation":0,"eligible":true,"chosen":true}]}
```

## Behaviours

- **Startup**: if the snapshot is missing or corrupt, fail fast with a clear log line. `/health` reports it.
- **Caching**: `functools.lru_cache` on `compute_analysis(cutoff)`; two presets so at most a few entries.
- **CORS**: from `CORS_ORIGINS` env (comma separated: localhost dev + the Vercel origin). No wildcard.
- **Compression**: `GZipMiddleware`.
- **Logging**: structured one-line logs (request id, route, duration, cutoff). No secrets exist, but keep the habit.
- **Observability** (cheap signal for the job ad): `X-Request-ID` header, log snapshot manifest hash at startup.
- **Optional refresh**: `scripts/fetch_snapshot.py` re-run locally to refresh; no scheduler.

## `scripts/fetch_snapshot.py` requirements

- Windows from `01-data-sources.md`, chunked by 2 days.
- Timeout 30 s, up to 3 retries with exponential backoff on 5xx and timeouts only.
- Sort and dedupe deterministically before writing.
- Write `manifest.json` with endpoints, params per chunk, row counts, sha256, and `fetched_at` UTC.
- Exit non-zero on partial failure; never write a half snapshot.
