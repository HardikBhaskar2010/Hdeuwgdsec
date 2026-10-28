# Cutoff · Wind Forecast Accuracy Portal

> **Decision-Time Wind Forecast Accuracy for the January 2026 GB Wholesale Electricity Market**  
> Built with FastAPI (Python 3.11/3.12, Asyncio, Pandas) & React 18 (TypeScript + Vite + Recharts).  
> Features a high-contrast **Deep Black & White Theme** designed according to Web Interface Guidelines and trading terminal UX.  
> Powered by Elexon BMRS API (`WINDFOR` and `FUELHH`).

[![Live App](https://img.shields.io/badge/Live%20App-Cutoff%20Portal-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://dn23fbvruw4423dss.vercel.app/)
[![API Status](https://img.shields.io/badge/API-Render%20Online-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://cutoff-api-rwt1.onrender.com/health/ready)
[![API Docs](https://img.shields.io/badge/OpenAPI-Swagger%20UI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](https://cutoff-api-rwt1.onrender.com/docs)
[![Test Suite](https://img.shields.io/badge/Tests-38%2F38%20Passing-success?style=for-the-badge)](https://github.com/HardikBhaskar2010/Hdeuwgdsec)

- **Production Web Application:** [Cutoff · Wind Forecast Accuracy](https://dn23fbvruw4423dss.vercel.app/)
- **Production Backend API (Render):** [https://cutoff-api-rwt1.onrender.com](https://cutoff-api-rwt1.onrender.com)
- **API Readiness Health Probe:** [https://cutoff-api-rwt1.onrender.com/health/ready](https://cutoff-api-rwt1.onrender.com/health/ready)
- **Interactive OpenAPI Documentation:** [https://cutoff-api-rwt1.onrender.com/docs](https://cutoff-api-rwt1.onrender.com/docs)

---

## 1. Product Purpose & Overview

Commercial energy buyers, balancing traders, and hedge managers commit to multi-million-pound purchasing decisions on **Day-Ahead (D-1)** based on available national wind generation forecasts. Forecast volatility introduces significant volume risk:
- **Over-forecast ($Forecast > Actual$):** Wind under-delivers; the buyer's balance position is **short**, forcing them to buy deficit power at punitive System Buy imbalance cash-out prices.
- **Under-forecast ($Forecast < Actual$):** Wind over-delivers; the buyer is **long** and forced to spill or sell surplus power at discounted System Sell prices.

**Cutoff** is a high-density analytics portal designed to:
1. **Isolate the exact forecast vintage available at decision time (D-1 cutoff)** with strict anti-hindsight guarantees (strict `publishTime < cutoff`).
2. **Quantify forecast error and downside risk (P5/P95)** across all 1,488 half-hour settlement periods of January 2026, allowing desks to accurately dimension operational hedge buffers.

---

## 2. Live Links & Endpoints

| Service | Target | URL | Description |
|---|---|---|---|
| **Web Portal** | **Vercel** (Production) | [Cutoff · Wind Forecast Accuracy](https://dn23fbvruw4423dss.vercel.app/) | Single-Page Trading Dashboard (React 18 + Vite) |
| **Backend API** | **Render** (Production) | [cutoff-api-rwt1.onrender.com](https://cutoff-api-rwt1.onrender.com) | FastAPI Production Service (Docker) |
| **API Health** | **Render** | [`https://cutoff-api-rwt1.onrender.com/health/ready`](https://cutoff-api-rwt1.onrender.com/health/ready) | Readiness probe verifying loaded snapshot dataset |
| **Analysis Endpoint** | **Render** | [`https://cutoff-api-rwt1.onrender.com/api/v1/analysis?cutoff=15:30`](https://cutoff-api-rwt1.onrender.com/api/v1/analysis?cutoff=15:30) | Core metrics, time series, & breakdowns |
| **Interactive OpenAPI Docs** | **Render** | [`https://cutoff-api-rwt1.onrender.com/docs`](https://cutoff-api-rwt1.onrender.com/docs) | Swagger UI interactive contract |

#### Quick API Verification
```bash
# Verify API readiness
curl https://cutoff-api-rwt1.onrender.com/health/ready

# Fetch January 2026 summary metrics for default 15:30 cutoff
curl https://cutoff-api-rwt1.onrender.com/api/v1/analysis?cutoff=15:30
```



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
2. **Algorithmic Selection Optimization:**
   - Pre-indexes `FUELHH` outturn actuals in $O(1)$ memory lookup tables.
   - Groups and pre-sorts all 114,000+ `WINDFOR` forecast vintages by `startTime`, transforming the 1,488-interval selection from full dataframe scans into fast grouped lookups.
3. **In-Memory LRU Caching:**
   - Decision cutoffs (`15:30` and `09:50`) are pre-computed and cached in-memory during FastAPI startup lifespan for low-latency responses.

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
│   └── tests/                     # 38 comprehensive pytest unit & async tests
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
├── scripts/
│   └── fetch_snapshot.py          # Ingestion script to pull data from Elexon BMRS
├── docker-compose.yml             # Single-command local orchestration
├── .gitignore                     # Git ignore rules for Python & Node
├── .env.example                   # Environment variable template
└── README.md                      # Project documentation (this file)
```

---

## 6. How to Start

> **Instant Cloud Access:** The system is fully deployed. You can evaluate the live dashboard immediately without local setup at [Cutoff · Wind Forecast Accuracy](https://dn23fbvruw4423dss.vercel.app/).

### Option A: Docker Compose (Recommended One-Liner)
To run both backend (port 8000) and frontend (port 5173) together:
```bash
git clone https://github.com/HardikBhaskar2010/Hdeuwgdsec.git
cd Hdeuwgdsec
docker compose up --build
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### Option B: Manual Local Setup

```bash
git clone https://github.com/HardikBhaskar2010/Hdeuwgdsec.git
cd Hdeuwgdsec
```

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

# Run test suite (all 38 tests must pass)
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

### 7.1 Anti-Hindsight Selection Rule (strict publishTime < cutoff)
In wholesale electricity trading, auction order books close strictly at the designated gate closure minute. A forecast timestamped with the exact gate closure minute (e.g. `15:30:00`) cannot realistically be downloaded, processed through valuation and risk models, and submitted as an order before gate closure occurs.

To guarantee zero hindsight leakage:
For each delivery half-hour settlement interval $T$:
1. Derive the decision date in `Europe/London` calendar time:
   $$D_{\text{decision}} = \operatorname{localDate}(T) - 1\,\text{day}$$
2. Build the cutoff (e.g. `15:30:00 Europe/London`):
   $$T_{\text{cutoff}} = D_{\text{decision}} \text{ at HH:MM}$$
3. Filter available forecasts with strict `publishTime < cutoff` semantics:
   $$\text{Eligible} = \{ f \in \text{WINDFOR} \mid f.\text{startTime} = T \land f.\text{publishTime} < T_{\text{cutoff}} \}$$
4. Choose the latest eligible vintage:
   $$f^*(T) = \operatorname*{arg\,max}_{f \in \text{Eligible}} f.\text{publishTime}$$

*Any forecast published at or after the cutoff time is strictly rejected to prevent hindsight bias (strict publishTime < cutoff).*

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
- **Authoritative Production Calculation (strict publishTime < cutoff):**
  - **MAE:** **1,906.6 MW** (Display: **1,907 MW**)
  - **RMSE:** **2,365.7 MW** (Display: **2,366 MW**)
  - **MBE:** **+1,692.5 MW** (Display: **+1,692 MW**)
  - **P95:** **+4,523.4 MW** (Display: **+4,523 MW**)
  - **WAPE:** **16.90%**
- **Legacy Prototype Comparison (`publishTime <= cutoff`):**
  - Preliminary runs with inclusive selection permitted forecasts timestamped *at* `15:30:00 UTC` to be chosen, yielding MAE 1,877.1 MW and RMSE 2,331.2 MW.
  - In reality, the EPEX GB auction order book closes strictly at 15:30:00 London. A forecast released at 15:30:00 cannot realistically be ingested, priced, and traded before gate closure occurs.
  - Enforcing strict `publishTime < cutoff` selection ensures that every selected vintage was genuinely available prior to the auction deadline, making the methodology defensible and establishing **MAE 1,907 MW** and **RMSE 2,366 MW** as the authoritative truth.
- **Bias Diagnostic (Latest-Ever Forecast):**
  - Evaluating the latest-ever forecast vintage across all horizons yields an over-forecast bias of **+1,492 MW** (vs. +1,692 MW at D−1 15:30), proving that systemic over-forecasting was an inherent model feature across lead times rather than solely a Day-Ahead artifact.

---

## 8. January 2026 Key Market Findings

*Note: 15:30 aligns with EPEX SPOT GB half-hourly auction, and 09:50 aligns with Nord Pool N2EX hourly auction gate closure. These are distinct auction products; this comparison examines forecast accuracy sensitivity to decision lead time.*

| Metric | 15:30 Cutoff (strict publishTime < cutoff) | 09:50 Cutoff (strict publishTime < cutoff) | Variance ($\Delta$) | Forecast Sensitivity Insight |
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

## 9. Test Suite Verification (38 Backend + 22 Frontend Passing)

### Backend Pytest (38/38 Passing)
```
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-9.0.3
collected 38 items

tests\test_cutoff.py ........                                            [ 21%]
tests\test_metrics.py ........                                           [ 42%]
tests\test_normalise.py .......                                          [ 60%]
tests\test_performance_async.py ....                                     [ 71%]
tests\test_selection.py ...........                                      [100%]

============================= 38 passed in 10.11s =============================
```

### Frontend Vitest (22/22 Passing)
```
 ✓ src/api.test.ts (6 tests)
 ✓ src/format.test.ts (16 tests)

 Test Files  2 passed (2)
      Tests  22 passed (22)
```

---

## 10. AI Tool Disclosure

In accordance with the challenge brief requirements:
- **AI Assistance:**
  - **Claude:** Assisted with architectural planning, domain modeling, technical specifications, and methodology review.
  - **Gemini (via Antigravity IDE):** Assisted with code implementation, test suite generation, CSS styling, and documentation.
- **Verification:** All data pipelines, mathematical formulas, and selection invariants were authored and verified with 38 deterministic pytest unit tests, 22 vitest frontend unit tests, and cross-reconciliation against raw Elexon BMRS datasets.
