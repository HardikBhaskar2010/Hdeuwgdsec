# Cutoff · Wind Forecast Accuracy Portal

> Decision-time accuracy of the GB national wind generation forecast, for day-ahead power buyers (decisions made in January 2026).
> **Stack:** FastAPI (Python 3.11+, pandas) · React 18 (TypeScript, Vite, Recharts, TanStack Query) · Docker · Vercel + Render.
> **Data:** Elexon BMRS `WINDFOR` (forecasts) and `FUELHH` (actuals, `fuelType = WIND`) only.

[![CI](https://github.com/HardikBhaskar2010/Hdeuwgdsec/actions/workflows/ci.yml/badge.svg)](https://github.com/HardikBhaskar2010/Hdeuwgdsec/actions/workflows/ci.yml)

**Live app:** https://dn23fbvruw4423dss.vercel.app/
**API:** https://cutoff-api-rwt1.onrender.com · [health](https://cutoff-api-rwt1.onrender.com/health/ready) · [OpenAPI docs](https://cutoff-api-rwt1.onrender.com/docs)

> **Cold start:** the API runs on Render's free tier and can sleep when idle. If the dashboard shows a "waking" state, wait 30–60 s. A scheduled GitHub Action pings the API every 5 minutes to keep it warm, but GitHub does not guarantee schedule timing.

---

## 1. What it does

A day-ahead buyer commits on day **D-1** for delivery on day **D**, using only the forecasts published so far. Cutoff answers two questions for every half-hour of the period:

1. **Which wind forecast was available at decision time?** The latest `WINDFOR` forecast published strictly before the chosen day-ahead cutoff.
2. **How wrong was it?** MAE, RMSE, signed bias, WAPE and the P5/P95 of the error, so a buyer can size a hedge buffer.

**Scope (assumption, stated up front):** the brief limits the analysis to purchase decisions made in January 2026. Decision dates are **1–31 Jan 2026**, so the delivery intervals run **2 Jan 00:00 to 1 Feb 24:00 (Europe/London)**: 31 days × 48 = **1,488 half-hours**. The UI shows both ranges.

**Direction of error:** `error = forecast − actual`. Positive = over-forecast (wind under-delivered, so a buyer relying on the forecast is short). Negative = under-forecast.

**Not in scope:** the brief limits data to wind from Elexon, with no demand, prices or other generation. Cutoff therefore does **not** compute how much power to buy. It quantifies the uncertainty on the wind term.

---

## 2. Repository layout

```
.
├── backend/                        FastAPI service
│   ├── Dockerfile                  Backend image (used by docker-compose and CI)
│   ├── pyproject.toml              Dependencies, ruff and pytest config
│   ├── src/app/
│   │   ├── main.py                 App, lifespan (loads snapshot), CORS, gzip
│   │   ├── config.py               Settings from environment
│   │   ├── schemas.py              Pydantic response models
│   │   ├── data/
│   │   │   ├── loader.py           Reads snapshot + manifest
│   │   │   └── normalise.py        UTC parsing, dedupe, validation, hourly→half-hourly alignment
│   │   ├── analysis/
│   │   │   ├── cutoff.py           Europe/London D-1 cutoff → UTC
│   │   │   ├── selection.py        Strict-before forecast selection (pure)
│   │   │   ├── metrics.py          MAE, RMSE, MBE, WAPE, P5/P95, breakdowns (pure)
│   │   │   └── service.py          Orchestration + caching
│   │   └── api/routes.py           Endpoints
│   └── tests/                      38 pytest tests
├── frontend/                       React + Vite single-page dashboard
│   ├── src/                        App.tsx, api.ts, types.ts, format.ts, hooks/
│   ├── vercel.json                 Vercel config
│   └── package.json
├── data/snapshot/                  Committed Elexon snapshot
│   ├── fuelhh_wind.json            Actual wind outturn (FUELHH)
│   ├── windfor.json                Forecast vintages (WINDFOR)
│   └── manifest.json               Provenance: fetch time, endpoints, row counts per chunk
├── scripts/fetch_snapshot.py       Re-fetches the snapshot from Elexon (stdlib only)
├── .github/workflows/
│   ├── ci.yml                      Backend lint+tests, frontend lint+tests+build, Docker smoke test
│   └── keep-alive.yml              Pings the production API every 5 min
├── Dockerfile                      Root-context backend image (Render)
├── render.yaml                     Render blueprint
├── docker-compose.yml              One-command local run
├── .env.example                    Environment variable template
├── .editorconfig  .gitignore  LICENSE
└── README.md
```

---

## 3. How to run

### Docker Compose (backend on :8000, frontend on :5173)
```bash
git clone https://github.com/HardikBhaskar2010/Hdeuwgdsec.git
cd Hdeuwgdsec
docker compose up --build
```
Open http://localhost:5173.

### Manual
```bash
# Backend (Python 3.11+)
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\activate
pip install -e .
pytest                             # 38 tests
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
```bash
# Frontend (Node 18+), in a second terminal
cd frontend
npm install
npm run dev                        # http://localhost:5173
npm test                           # 22 tests
```

### Configuration
Copy `.env.example`. Main variables: `SNAPSHOT_DIR`, `DEFAULT_CUTOFF`, `CORS_ORIGINS` (backend) and `VITE_API_BASE_URL` (frontend).

### Refresh the data snapshot (optional)
```bash
python scripts/fetch_snapshot.py   # rewrites data/snapshot/* and manifest.json
```

---

## 4. Data and architecture

```
Elexon BMRS ──(scripts/fetch_snapshot.py, one-off)──► data/snapshot/*.json + manifest.json
                                                         │
                         FastAPI startup loads + normalises once
                                                         │
          /api/v1/analysis ─► select forecast ─► join actuals ─► metrics ─► JSON ─► React
```

- **Source:** Elexon BMRS Insights API (`https://data.elexon.co.uk/bmrs/api/v1`), `datasets/FUELHH/stream` (filtered to `fuelType=WIND`) and `datasets/WINDFOR/stream`. No API key is needed.
- **Snapshot, not live:** the data is static history, so it is fetched once and committed with provenance in `manifest.json` (fetched 27 Oct 2026). The request path makes no calls to Elexon, which keeps responses fast and the demo reliable. The UI labels the data as a dated snapshot.
- **Snapshot size:** 1,506 raw FUELHH wind rows; 20,440 raw WINDFOR rows covering 889 hourly target times, with up to 32 published versions ("vintages") of the forecast per target hour.
- **Pure analysis modules:** `selection.py` and `metrics.py` have no I/O and no framework imports, so they are directly unit-tested. Results are cached per cutoff; CPU-bound work runs off the event loop via `asyncio.to_thread`.

### API

| Endpoint | Purpose |
|---|---|
| `GET /health`, `/health/live`, `/health/ready` | Liveness and readiness (verifies the snapshot is loaded) |
| `GET /api/v1/analysis?cutoff=15:30` | KPIs, per-interval series, breakdowns, quality counts |
| `GET /api/v1/intervals/{start}?cutoff=15:30` | Every forecast vintage for one interval, flagged eligible/chosen |
| `GET /docs` | Interactive OpenAPI |

### Frontend
Single-page, dark-theme dashboard: KPI strip, forecast-vs-actual chart (click a point to inspect all candidate vintages), error-over-time, error distribution with P5/P95, breakdowns, and a methodology/data-quality panel. All numbers come from the API; the frontend only formats. Handles loading, error, empty and "waking API" states. Keyboard-focus styles, a skip link and `prefers-reduced-motion` are supported.

---

## 5. Methodology

### 5.1 Decision-time forecast selection (strict `publishTime < cutoff`)

For each delivery half-hour $T$:

1. **Decision date** in `Europe/London`: the local delivery date minus one calendar day.

$$D_{\mathrm{decision}} = \mathrm{localDate}(T) - 1\ \mathrm{day}$$

2. **Cutoff:** the decision date at the chosen clock time (default 15:30 London), converted to UTC. It is built from the local calendar date, not by subtracting 24 h from a UTC timestamp.

$$T_{\mathrm{cutoff}} = D_{\mathrm{decision}}\ \text{at}\ HH{:}MM$$

3. **Eligible forecasts:** rows for the same target time published strictly before the cutoff.

$$\mathrm{Eligible}(T) = \{\, f \in \mathrm{WINDFOR} \mid f.\mathrm{startTime} = T \ \land\ f.\mathrm{publishTime} < T_{\mathrm{cutoff}} \,\}$$

4. **Chosen forecast:** the most recently published eligible row.

$$f^{*}(T) = \underset{f \in \mathrm{Eligible}(T)}{\arg\max}\ f.\mathrm{publishTime}$$

If nothing is eligible, or there is no actual, the interval is marked `NO_FORECAST` / `NO_ACTUAL` and excluded from metrics. Missing values are never filled with zero. A runtime assertion enforces `chosen.publishTime < cutoff` on every selected row.

**Why strict (`<`) and not `<=`:** auction order books close at the gate-closure minute, so a forecast stamped exactly at 15:30:00 cannot realistically be priced and submitted before closure. This is a modelling choice, and the effect of the alternative is shown in 5.4.

### 5.2 Cutoff presets (assumptions)

The brief does not state the decision time, so the cutoff is selectable and shown on every view:

- **15:30 Europe/London** (default): the gate-closure time of the GB half-hourly day-ahead auction.
- **09:50 Europe/London:** an earlier alternative preset, representing an hourly day-ahead auction closure.

These are analysis scenarios, not a claim about the client's internal process.

### 5.3 Resolution alignment (assumption)

`FUELHH` is half-hourly but `WINDFOR` forecasts are hourly (every `startTime` is on the hour). Each hourly forecast is applied to both half-hours in that hour (for example, the 14:00 forecast is used for 14:00 and 14:30). Within-hour variation is therefore not modelled, and this adds some error to the half-hourly comparison.

### 5.4 Metrics

With matched intervals $i = 1 \dots N$, forecast $F_i$, actual $A_i$ and error $e_i = F_i - A_i$ (all in MW):

- **MAE** $= \frac{1}{N}\sum |e_i|$: typical miss.
- **RMSE** $= \sqrt{\frac{1}{N}\sum e_i^2}$: penalises large misses.
- **MBE (bias)** $= \frac{1}{N}\sum e_i$: positive means systematic over-forecasting.
- **WAPE** $= \frac{\sum |e_i|}{\sum A_i} \times 100\%$: scale-free error, used instead of MAPE because actual wind can approach zero.
- **P5 / P95 of $e_i$:** empirical quantiles of the historical error. They inform hedge sizing but do not guarantee that a buffer is sufficient.
- **Coverage** $= N / 1488$.

### 5.5 Time handling

Everything is stored and joined in UTC; dates and cutoffs are built and displayed in `Europe/London`. January has no DST change, and the cutoff logic is tested across DST dates as well.

---

## 6. Findings (January 2026 decisions, snapshot of 27 Oct 2026)

All figures are for decisions made 1–31 Jan 2026 (delivery 2 Jan – 1 Feb), strict `publishTime < cutoff`, 1,488 / 1,488 intervals matched.

| Metric | 15:30 cutoff | 09:50 cutoff | Difference |
|---|---:|---:|---:|
| MAE | 1,906.6 MW | 2,016.3 MW | +109.7 MW |
| RMSE | 2,365.7 MW | 2,510.3 MW | +144.6 MW |
| Bias (MBE) | +1,692.5 MW | +1,729.9 MW | +37.4 MW |
| WAPE | 16.90 % | 17.87 % | +0.97 pp |
| P95 error | +4,523.4 MW | +5,346.6 MW | +823.2 MW |

- **Earlier decisions are less accurate:** the 09:50 cutoff has higher MAE, RMSE and a wider P95 than 15:30. This is a single month and should not be generalised.
- **Persistent over-forecast:** bias is about +1.7 GW at both cutoffs. Using the latest-ever forecast for each interval (which would not have been available at decision time) still gives +1,492 MW. The bias is therefore not an artefact of the selection rule. This analysis cannot say whether it reflects forecast-model bias or a difference in what the two datasets measure; that is not determined here.
- **Inclusive vs strict cutoff:** allowing `publishTime <= cutoff` at 15:30 gives MAE 1,877.1 MW and RMSE 2,331.2 MW, so the rule choice moves the headline numbers slightly.

### Worked example: 12 Jan 2026, settlement period 3 (01:00–01:30 UTC)

The latest forecast published strictly before the 11 Jan 15:30 cutoff was **20,933 MW** (published 11:30 UTC). Actual outturn was **14,048 MW**, an over-forecast of **+6,885 MW**. (Under an inclusive rule, the 15:30:00 publication of 21,145 MW would have been chosen, giving +7,097 MW.) The data records the shortfall but cannot attribute a physical cause.

---

## 7. Testing and CI

- **Backend (38 pytest tests):** cutoff construction, normalisation and duplicates, selection boundary and anti-hindsight cases, metrics on hand-checked fixtures, and an async concurrency test.
- **Frontend (22 Vitest tests):** API client and formatters.
- **CI** (`.github/workflows/ci.yml`) on every push and pull request: `ruff check`, `ruff format --check`, `pytest`; frontend `eslint`, `vitest`, type-check and production build; Docker build with a readiness-probe smoke test.

---

## 8. Limitations

- National wind only: no demand, prices or other generation, so no purchase-volume recommendation.
- The real client's decision time is unknown; 15:30 and 09:50 are assumed presets.
- WINDFOR is hourly and is applied to both half-hours of each hour (section 5.3).
- The data is a dated snapshot, not live, and covers one month of decisions.
- Render free tier may cold-start (see the note at the top).

---

## 9. AI tool disclosure

AI tools were used in this project:

- **Claude (Anthropic):** architectural planning, specifications, methodology and README review.
- **Gemini (via Antigravity IDE):** code implementation, test generation, CSS and documentation.

All AI-generated code and text was reviewed by me. Selection and metric logic is covered by deterministic tests, and the headline figures were cross-checked against the raw Elexon snapshot.
