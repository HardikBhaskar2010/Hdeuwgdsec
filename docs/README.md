# Wind Forecast Accuracy Portal: Spec Pack

Take-home: Full Stack SWE challenge. Compare the national wind forecast **available at day-ahead decision time** with the wind actually generated, using only Elexon `WINDFOR` and `FUELHH`.

## Read in this order

| File | What it settles |
|---|---|
| `00-decisions.md` | Every opinionated choice in one table, plus what was cut and why |
| `01-data-sources.md` | Exact API, datasets, fields, fetch windows, **what is verified vs. still to verify** |
| `02-methodology.md` | Forecast-selection rule, time handling, metrics (the part reviewers care about most) |
| `03-backend.md` | Stack, modules, snapshot strategy, API contract |
| `04-frontend.md` | Minimal frontend: layout, components, states |
| `05-quality-deploy.md` | Tests, Docker, CI, deployment, README + submission checklists |
| `06-build-plan.md` | 16 h schedule, cut-line, video script |
| `scripts/probe_elexon.py` | **Run this first.** Zero-dependency probe that verifies the API contract and saves real fixtures |

## Status legend used in the specs

- **[CONFIRMED]** seen in a source I could actually read (Elexon developer portal, challenge brief).
- **[VERIFY]** from my knowledge of the Elexon Insights API but not confirmed from a readable source. `probe_elexon.py` checks each of these. If the probe disagrees with a spec, the probe wins; update the spec.

## One-paragraph architecture

A one-off script fetches January-2026 data from Elexon once and commits the raw responses as a dated snapshot. FastAPI loads the snapshot at startup, runs a pure-function pipeline (normalise, pick latest forecast published at or before the cutoff, join with actuals, compute metrics), and serves a handful of read-only JSON endpoints. A single-page React app renders KPIs, one interactive forecast-vs-actual chart, an error panel, a drilldown showing which forecast vintage was chosen, and a methodology panel. No database, auth, or live upstream calls in the request path.
