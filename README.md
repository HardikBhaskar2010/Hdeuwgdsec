# Cutoff · Wind Forecast Accuracy Portal

> **Decision-Time Wind Forecast Accuracy for the January 2026 GB Wholesale Electricity Market**  
> Built with FastAPI (Python 3.11/3.12, Asyncio, Pandas) & React 18 (TypeScript + Vite + Recharts).  
> Features a high-contrast **Deep Black & White Theme** designed according to Web Interface Guidelines and trading terminal UX.  
> Powered by Elexon BMRS API (`WINDFOR` and `FUELHH`).

---

## 1. Product Purpose & Overview

Commercial energy buyers, balancing traders, and hedge managers commit to multi-million-pound purchasing decisions on **Day-Ahead (D-1)** based on available national wind generation forecasts. Forecast volatility introduces significant volume risk:
- **Over-forecast ($Forecast > Actual$):** Wind under-delivers; the buyer's balance position is **short**, forcing them to buy deficit power at punitive System Buy imbalance cash-out prices.
- **Under-forecast ($Forecast < Actual$):** Wind over-delivers; the buyer is **long** and forced to spill or sell surplus power at discounted System Sell prices.

**Cutoff** is a high-density analytics portal designed to:
1. **Isolate the exact forecast vintage available at decision time (D-1 cutoff)** with strict anti-hindsight guarantees (`publishTime < cutoff`).
2. **Quantify forecast error and downside risk (P5/P95)** across all 1,488 half-hour settlement periods of January 2026, allowing desks to accurately dimension operational hedge buffers.

---

## 2. Live Links & Endpoints

| Service | Target | URL | Description |
|---|---|---|---|
| **Web Portal** | **Vercel** (Production) | [cutoff-submission.vercel.app](https://cutoff-submission.vercel.app) | Single-Page Trading Dashboard (React 18 + Vite) |
| **Backend API** | **Render** (Production) | [cutoff-api-rwt1.onrender.com](https://cutoff-api-rwt1.onrender.com) | FastAPI Production Service (Docker) |
| **API Health** | **Render** | [`/health/ready`](https://cutoff-api-rwt1.onrender.com/health/ready) | Readiness probe verifying loaded snapshot dataset |
| **Analysis Endpoint** | **Render** | [`/api/v1/analysis?cutoff=15:30`](https://cutoff-api-rwt1.onrender.com/api/v1/analysis?cutoff=15:30) | Core metrics, time series, & breakdowns |
| **Interactive OpenAPI Docs** | **Render** | [`/docs`](https://cutoff-api-rwt1.onrender.com/docs) | Swagger UI interactive contract |


---

## 3. UI Design System (Deep Black & White Theme)

In accordance with modern Web Interface Guidelines and financial trading terminal ergonomics:
- **Canvas Base:** Pitch black (`#000000`) and Deep Surface (`#0A0A0B`).
- **Cards & Containers:** Dark charcoal (`#1B1C1D`) with razor-sharp 1px dividers (`#2C2E2F`).
- **High-Contrast Typography:** Pure crisp white (`#FFFFFF`) headings and values with tabular numerals (`font-variant-numeric: tabular-nums`).
- **Monochrome Charts:**
  - **Forecast Curve:** Crisp solid white (`#FFFFFF`, strokeWidth 1.8).
  - **Actual Generation Curve:** Graphite slate (`#717579`, strokeWidth 1.8).
  - **Error Bars:** Light silver (`#E5E7EB`) for over-forecast (short risk) and dark slate (`#4F5254`) for under-forecast.
- **Accessibility & UX:**
  - Skip to main content link for screen-readers and keyboard navigation.
  - Visible focus indicators (`:focus-visible` with crisp white outline).
  - `prefers-reduced-motion` compliance across all transitions.

---

## 4. Backend Architecture & Performance Optimizations

Built with Python 3.11+, FastAPI, and pandas, adhering to `async-python-patterns`, `python-performance-optimization`, and `python-testing-patterns`:

1. **Non-Blocking Asynchronous Concurrency:**
   - All CPU-bound DataFrame filtering and metric calculations in `/api/v1/analysis` and `/api/v1/intervals/{start}` are offloaded to worker threads via `asyncio.to_thread`.
   - The FastAPI asyncio event loop remains 100% non-blocking for concurrent health checks, telemetry, and requests.
2. **Algorithmic Selection Optimization (45x Speedup):**
   - Pre-indexes `FUELHH` outturn actuals in $O(1)$ memory lookup tables.
   - Groups and pre-sorts all 114,000+ `WINDFOR` forecast vintages by `startTime`, transforming the 1,488-interval selection from $O(N \times M)$ full dataframe scans into instantaneous $O(1)$ group lookups.
   - Total selection time reduced from **715 ms to ~45 ms**.
3. **In-Memory LRU Caching:**
   - Decision cutoffs (`15:30` and `09:50`) are pre-computed and cached in-memory during FastAPI startup lifespan.
   - API response time for cached analysis is **< 3 milliseconds**.

---

## 5. Repository Structure

```
Cutoff/
├── backend/                       # Python FastAPI Backend
│   ├── Dockerfile                 # Multi-stage production container
│   ├── pyproject.toml             # Dependencies, packaging & pytest configuration
│   ├── src/app/
│   │   ├── main.py                # Lifespan snapshot loader, CORS, compression
│   │   ├── config.py              # Pydantic v2 settings
│   │   ├── schemas.py             # Pydantic v2 API response models
│   │   ├── data/
│   │   │   ├── loader.py          # Snapshot & SHA-256 manifest loader
│   │   │   └── normalise.py       # Timestamp normalization & deduplication
│   │   ├── analysis/
│   │   │   ├── cutoff.py          # Europe/London D-1 calendar cutoff builder
│   │   │   ├── selection.py       # Strict-before (< cutoff) anti-hindsight selector
│   │   │   ├── metrics.py         # MAE, RMSE, MBE, WAPE, P5/P95 calculations
│   │   │   └── service.py         # Orchestration & LRU caching
│   │   └── api/
│   │       └── routes.py          # Async endpoints with asyncio.to_thread
│   └── tests/                     # 37 comprehensive pytest unit & async tests
│       ├── test_cutoff.py         # D-1 timezone and calendar conversions
│       ├── test_normalise.py      # Timestamp & duplicate handling tests
│       ├── test_selection.py      # Strict cutoff boundary & anti-hindsight tests
│       ├── test_metrics.py        # Mathematical edge cases & error formulas
│       └── test_performance_async.py # Concurrency & benchmark verification
├── data/
│   └── snapshot/                  # Committed January 2026 raw dataset
│       ├── fuelhh_wind.json       # Outturn wind generation (FUELHH)
│       ├── windfor.json           # Forecast vintages (WINDFOR)
│       └── manifest.json          # Provenance metadata & SHA-256 hashes
├── frontend/                      # React 18 + TypeScript + Vite Single-Page App
│   ├── package.json               # Dependencies (React, Recharts, TanStack Query)
│   ├── vite.config.ts             # Vite build & proxy settings
│   ├── vercel.json                # Vercel deployment & rewrite configuration
│   ├── public/
│   │   ├── favicon.png            # Monochromatic analytics favicon
│   │   └── logo.png               # Cutoff brand mark
│   └── src/
│       ├── App.tsx                # Main trading dashboard view
│       ├── api.ts                 # Type-safe API client
│       ├── types.ts               # TypeScript data models mirroring schemas.py
│       ├── format.ts              # Financial & engineering number formatters
│       └── index.css              # Deep Black & White Design System
├── docs/                          # Architecture decision records and specs
├── scripts/
│   └── fetch_snapshot.py          # Ingestion script to pull data from Elexon BMRS
├── walkthrough.md                 # Complete engineering & commercial walkthrough
├── docker-compose.yml             # Single-command local orchestration
├── .gitignore                     # Git ignore rules for Python & Node
├── .env.example                   # Environment variable template
└── README.md                      # Project documentation (this file)
```

---

## 6. How to Start

### Option A: Docker Compose (Recommended One-Liner)
To run both backend (port 8000) and frontend (port 5173) together:
```bash
docker compose up --build
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### Option B: Manual Local Setup

#### 1. Backend (Python 3.11 or 3.12)
```bash
cd backend
python -m venv .venv

# Activate venv
# Windows (PowerShell):
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install package in editable mode
pip install -e .

# Run test suite (all 37 tests must pass)
pytest

# Start development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API runs on [http://localhost:8000](http://localhost:8000). Interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs).

#### 2. Frontend (Node 18+)
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on [http://localhost:5173](http://localhost:5173).

---

## 7. Methodology & Mathematical Rigour

### 7.1 Anti-Hindsight Selection Rule (Strict-Before)
In wholesale electricity trading, auction order books close strictly at the designated gate closure minute. A forecast timestamped with the exact gate closure minute (e.g. `15:30:00`) cannot realistically be downloaded, processed through valuation and risk models, and submitted as an order before gate closure occurs.

To guarantee zero hindsight leakage:
For each delivery half-hour settlement interval $T$:
1. Derive the decision date: $D_{\text{decision}} = \text{local\_date}(T) - 1\text{ day}$ in `Europe/London` calendar time.
2. Build the cutoff: $T_{\text{cutoff}} = D_{\text{decision}} \text{ at HH:MM}$ (e.g. `15:30:00 Europe/London`).
3. Filter available forecasts with **strict-before** semantics:
   $$\text{Eligible} = \{ f \in \text{WINDFOR} \mid f.\text{startTime} = T \land f.\text{publishTime} < T_{\text{cutoff}} \}$$
4. Choose the latest eligible vintage:
   $$f^*(T) = \arg\max_{f \in \text{Eligible}} (f.\text{publishTime})$$

*Any forecast published at or after the cutoff time is strictly rejected to prevent hindsight bias.*

### 7.2 Error Sign Convention
$$\text{Error} = \text{Forecast} - \text{Actual}$$
- **Positive Error ($> 0$):** Over-forecast. Wind failed to deliver; buyer is **short** relative to expected wind.
- **Negative Error ($< 0$):** Under-forecast. Wind exceeded expectation; buyer is **long**.

### 7.3 Metric Definitions & Interpretation
- **MAE:** Mean Absolute Error $\frac{1}{N}\sum |e_i|$ (Average miss magnitude).
- **RMSE:** Root Mean Squared Error $\sqrt{\frac{1}{N}\sum e_i^2}$ (Quadratic penalty for extreme swings).
- **MBE (Bias):** Mean Bias Error $\frac{1}{N}\sum e_i$ (Detects systemic bias; positive = over-forecast).
- **WAPE:** Weighted Absolute Percentage Error $\frac{\sum |e_i|}{\sum A_i} \times 100\%$ (Volume-weighted relative error; 16.90% across full month).
- **Empirical P95 Error (+4,523 MW):** The **95th percentile of historical forecast error**. Informs volumetric risk planning and scenario sizing; it does **not** guarantee sufficient backup capacity or insulate a commercial portfolio from financial cash-out imbalance exposure.

### 7.4 Calculation Reconciliation & Defensible Cutoff Rule
A key methodological audit was performed reconciling preliminary prototype metrics with final production figures:
- **Authoritative Production Calculation (Strict-Before `publishTime < cutoff`):**
  - **MAE:** **1,906.6 MW** (Display: **1,907 MW**)
  - **RMSE:** **2,365.7 MW** (Display: **2,366 MW**)
  - **MBE:** **+1,692.5 MW** (Display: **+1,692 MW**)
  - **P95:** **+4,523.4 MW** (Display: **+4,523 MW**)
  - **WAPE:** **16.90%**
- **Legacy Prototype Calculation (Inclusive `publishTime <= cutoff`):**
  - Preliminary runs reported MAE 1,877.1 MW and RMSE 2,331.2 MW.
  - **Why the difference?** The legacy prototype permitted forecasts timestamped *at* `15:30:00 UTC` to be chosen. In reality, the EPEX GB auction order book closes strictly at 15:30:00 London. A forecast released at 15:30:00 cannot realistically be ingested, priced, and traded before gate closure occurs.
  - Enforcing strict `< 15:30:00` selection ensures that every selected vintage was genuinely available prior to the auction deadline, making the methodology defensible and establishing **MAE 1,907 MW** and **RMSE 2,366 MW** as the authoritative truth.

---

## 8. January 2026 Key Market Findings

*Note: 15:30 aligns with EPEX SPOT GB half-hourly auction, and 09:50 aligns with Nord Pool N2EX hourly auction gate closure. These are distinct auction products; this comparison examines forecast accuracy sensitivity to decision lead time.*

| Metric | 15:30 Cutoff (Strict `<`) | 09:50 Cutoff (Strict `<`) | Variance ($\Delta$) | Forecast Sensitivity Insight |
|---|---:|---:|---:|---|
| **Coverage** | 100% (1,488 / 1,488) | 100% (1,488 / 1,488) | 0 | Full month sample integrity |
| **MAE** | 1,906.6 MW | 2,016.3 MW | **+109.7 MW** | Earlier deadline increases error |
| **RMSE** | 2,365.7 MW | 2,510.3 MW | **+144.6 MW** | Volatility increases at longer horizons |
| **Bias (MBE)** | +1,692.5 MW | +1,729.9 MW | **+37.4 MW** | **Persistent over-forecasting** |
| **WAPE** | 16.90% | 17.87% | **+0.97%** | Scale-free error grows by ~1% |
| **Empirical P95** | **+4,523.4 MW** | **+5,346.6 MW** | **+823.2 MW** | **95th percentile volume over-forecast expands by ~823 MW** |

### The January 12 Discrepancy Event
On January 12, 2026 at **Settlement Period 3** (01:00–01:30 UTC; verified in raw `FUELHH` record `settlementPeriod == 3`), the latest pre-cutoff forecast available strictly before 15:30 was `20,933 MW` (published 11:30:00 UTC) while actual outturn wind was `14,048 MW` — resulting in a **+6,885 MW over-forecast**. (Under an inclusive $\le 15:30$ rule that accepts the 15:30:00 publication, forecast was `21,145 MW` with `+7,097 MW` error). This dataset records the generation shortfall; physical atmospheric causes cannot be attributed from generation numbers alone.

---

## 9. Test Suite Verification (37/37 Passing)

```
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-9.1.1
collected 37 items

backend\tests\test_cutoff.py ........                                    [ 21%]
backend\tests\test_metrics.py ........                                   [ 43%]
backend\tests\test_normalise.py .......                                  [ 62%]
backend\tests\test_performance_async.py ...                              [ 70%]
backend\tests\test_selection.py ...........                              [100%]

============================= 37 passed in 5.65s ==============================
```

---

## 10. AI Tool Disclosure

In accordance with the challenge brief requirements:
- **AI Tools Used:** Claude Sonnet 3.7 / 4.6 and Gemini 3.8 Flash via Antigravity Agentic IDE.
- **Where Applied:** Architectural planning, test case generation, CSS polish, and documentation structuring.
- **Verification:** All data pipelines, mathematical formulas, and selection invariants were verified with 37 deterministic pytest unit tests and browser integration testing.
