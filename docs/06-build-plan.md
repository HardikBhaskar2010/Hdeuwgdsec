# 06: Build Plan (16 h cap)

## Schedule

| Phase | h | Output | Exit condition |
|---|---:|---|---|
| 0. Probe + snapshot | 1.5 | Run `probe_elexon.py`; update `01-data-sources.md` [VERIFY] items; write `fetch_snapshot.py`; commit snapshot + manifest + test fixtures | Real data in repo; params, fields, units and lead-time range known |
| 1. Pipeline | 2.5 | `normalise`, `cutoff`, `selection`, `metrics` + their tests | Script prints validated metrics; leakage test fails if rule is broken |
| 2. API | 1.5 | FastAPI routes, schemas, CORS, health, drilldown, API tests | `/docs` shows contract; numbers match the script |
| 3. Frontend | 4.0 | Shell, KPI strip, main chart, error panel, breakdowns, drilldown, methodology, states | Works at desktop and mobile; all numbers from API |
| 4. Verify | 1.5 | Cross-check UI against backend; lint/type/test; edge cases; a11y pass | CI green; no zero-filled gaps |
| 5. Docker, CI, deploy, README | 2.0 | Dockerfile, compose, workflow, Render + Vercel, README | Public app works cold, in incognito |
| 6. Video + submit | 3.0 | Rehearse, record, upload, verify links, submit form | Everything checked in incognito |
| **Total** | **16** | | |

Phase 6 is large on purpose: the brief says evaluation **starts with the video**.

## Cut-line (in order)

1. Histogram, by-lead-time chart, date jump
2. Second cutoff preset comparison polish (keep the dropdown if it is cheap)
3. Frontend tests beyond `format` and states
4. Docker Compose (keep the backend Dockerfile)

**Never cut:** snapshot provenance, selection tests, drilldown, methodology panel, deployed app, README, video.

## Video script (<= 10:00)

### Part 1: Customer pitch (<= 5:00)

| Time | Beat |
|---|---|
| 0:00 | Problem: day-ahead buyers commit on D-1 with an uncertain wind forecast; which forecast did they actually have, and how wrong was it? |
| 0:35 | What the pilot does: January 2026 decisions, Elexon data only, forecasts matched by publish time at the cutoff |
| 1:15 | Dashboard: forecast vs actual; KPI strip; read MAE, bias and P95 in plain language ("on 95% of half-hours the forecast overshot by less than X MW") |
| 2:30 | **One real story**: a bad day. Click the worst interval; show which forecast was chosen, when it was published, what came later and was not available; actual vs forecast; what that means for a buyer |
| 3:40 | Patterns: error by time of day and by lead time; "bias is persistent / not persistent" (say only what the data shows) |
| 4:20 | Trust: coverage, methodology panel, limitations (wind only; no demand or price) |
| 4:45 | Close: like-for-like, decision-time accuracy, a hedge buffer number |

### Part 2: Tech review (<= 5:00)

| Time | Beat |
|---|---|
| 0:00 | Architecture: snapshot, pure analysis modules, FastAPI, React; why no DB and no live calls |
| 0:40 | Data and time: `startTime` vs `publishTime`, UTC internally, London cutoff construction |
| 1:30 | The selection function and 3 tests: exactly-at-cutoff, post-cutoff rejected, none eligible |
| 2:30 | API contract and `/docs`; schemas; error handling; frontend states; backend-owned metrics |
| 3:30 | Practices: lockfiles, ruff, pytest, CI, Docker, env config, README, AI-use disclosure |
| 4:20 | Trade-offs and what you'd do next (live refresh job, demand data, per-cutoff comparison, Celery/Ray only if scale demanded it); say these are **not** built |

Record at 1080p, large font, hide bookmarks and notifications, rehearse once.

## Order of work for the first session

1. `python3 scripts/probe_elexon.py` on your machine, paste the report back.
2. Update the [VERIFY] items in `01-data-sources.md`.
3. Scaffold repo, write `fetch_snapshot.py`, commit the snapshot.
4. Pipeline and tests before any UI.
