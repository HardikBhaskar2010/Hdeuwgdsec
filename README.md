# Cutoff · Wind Forecast Accuracy Portal

> **Decision-Time Wind Forecast Accuracy for the January 2026 GB Wholesale Electricity Market**  
> Built with FastAPI (Python 3.11/3.12) & React 18 (TypeScript + Vite + Recharts + Tailwind CSS).  
> Powered by Elexon BMRS API (`WINDFOR` and `FUELHH`).

---

## 1. Product Purpose & Overview

Commercial energy buyers and balancing traders commit to purchasing decisions on **Day-Ahead (D-1)** based on available national wind generation forecasts. Wind forecast volatility poses critical volume risk:
- **Over-forecast ($Forecast > Actual$):** Wind under-delivers; the buyer is short and exposed to punitive system buy cash-out imbalance prices.
- **Under-forecast ($Forecast < Actual$):** Wind over-delivers; the buyer is long and forced to sell or spill surplus power at a discount.

**Cutoff** is a high-density analytics portal designed to:
1. **Show the exact forecast vintage available at decision time (D-1 cutoff)** with strict anti-hindsight guarantees.
2. **Quantify forecast error and downside risk (P5/P95)** across all 1,488 half-hour settlement periods of January 2026 so buyers can dimension their operational reserve and financial hedge buffers.

---

## 2. Live Links

| Service | Link | Description |
|---|---|---|
| **Web Portal** | `https://cutoff-portal.vercel.app` *(or local `http://localhost:5173`)* | Interactive dashboard |
| **Backend API** | `https://cutoff-api.onrender.com` *(or local `http://localhost:8000`)* | FastAPI production service |
| **API Health** | `/health` (`http://localhost:8000/health`) | Snapshot status & verification |
| **Interactive OpenAPI Docs** | `/docs` (`http://localhost:8000/docs`) | Swagger UI contract |

---

## 3. Repository Structure

```
Cutoff/
├── backend/                       # Python FastAPI Backend
│   ├── Dockerfile                 # Container definition (python:3.11-slim)
│   ├── pyproject.toml             # Python dependencies and packaging
│   ├── src/app/
│   │   ├── main.py                # FastAPI app, lifespan snapshot loader, CORS, routes
│   │   ├── config.py              # Settings via pydantic-settings
│   │   ├── schemas.py             # Pydantic v2 response schemas
│   │   ├── data/
│   │   │   ├── loader.py          # Read snapshot + manifest into memory
│   │   │   └── normalise.py       # UTC parsing, WIND filtering, duplicate handling
│   │   ├── analysis/
│   │   │   ├── cutoff.py          # Local Europe/London D-1 calendar cutoff builder
│   │   │   ├── selection.py       # Pick latest publishTime <= cutoff (no leakage)
│   │   │   ├── metrics.py         # MAE, RMSE, MBE, WAPE, P5/P95 quantiles, breakdowns
│   │   │   └── service.py         # Orchestration & LRU cache
│   │   └── api/
│   │       └── routes.py          # /health, /meta, /analysis, /intervals/{start}
│   └── tests/                     # 34 comprehensive pytest unit tests
│       ├── test_cutoff.py         # D-1 timezone and calendar conversions
│       ├── test_normalise.py      # Timestamp & duplicate handling tests
│       ├── test_selection.py      # Strict cutoff boundary & anti-hindsight tests
│       └── test_metrics.py        # Exact mathematical and edge case tests
├── data/
│   └── snapshot/                  # Committed January 2026 raw dataset
│       ├── fuelhh_wind.json       # Outturn wind generation (FUELHH)
│       ├── windfor.json           # Forecast vintages (WINDFOR)
│       └── manifest.json          # SHA-256 provenance manifest
├── frontend/                      # React 18 + TypeScript + Vite Single-Page App
│   ├── vercel.json                # Vercel deployment & rewrite configuration
│   ├── package.json               # Dependencies (React, Recharts, TanStack Query)
│   ├── vite.config.ts             # Vite build & proxy settings
│   └── src/
│       ├── App.tsx                # Main trading dashboard view
│       ├── api.ts                 # Type-safe API client
│       ├── types.ts               # TypeScript data models mirroring schemas.py
│       ├── format.ts              # Financial & engineering number formatters
│       └── index.css              # Custom styling & Tailwind directives
├── docs/                          # Architecture decisions and specs
├── scripts/
│   └── fetch_snapshot.py          # Ingestion script to pull data from Elexon BMRS
├── walkthrough.md                 # Complete engineering & commercial walkthrough
├── docker-compose.yml             # Single-command local orchestration
├── .gitignore                     # Git ignore rules for Python & Node
├── .env.example                   # Environment variable template
└── README.md                      # Project documentation (this file)
```

---

## 4. How to Start

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

# Run test suite (all 34 tests must pass)
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

## 5. Methodology & Mathematical Rigour

### 5.1 Anti-Hindsight Selection Rule
For each delivery half-hour settlement interval $T$:
1. Derive the decision date: $D_{\text{decision}} = \text{local\_date}(T) - 1\text{ day}$ in `Europe/London` calendar time.
2. Build the cutoff: $T_{\text{cutoff}} = D_{\text{decision}} \text{ at HH:MM}$ (e.g. `15:30:00 Europe/London`).
3. Filter available forecasts:
   $$\text{Eligible} = \{ f \in \text{WINDFOR} \mid f.\text{startTime} = T \land f.\text{publishTime} \le T_{\text{cutoff}} \}$$
4. Choose the latest eligible vintage:
   $$f^*(T) = \arg\max_{f \in \text{Eligible}} (f.\text{publishTime})$$

*Any forecast published after the cutoff time is strictly rejected to prevent hindsight bias.*

### 5.2 Error Sign Convention
$$\text{Error} = \text{Forecast} - \text{Actual}$$
- **Positive Error ($> 0$):** Over-forecast. Wind failed to deliver; buyer is **short**.
- **Negative Error ($< 0$):** Under-forecast. Wind exceeded expectation; buyer is **long**.

### 5.3 Metric Definitions
- **MAE:** Mean Absolute Error $\frac{1}{N}\sum |e_i|$ (Average miss magnitude).
- **RMSE:** Root Mean Squared Error $\sqrt{\frac{1}{N}\sum e_i^2}$ (Penalizes volatile swings).
- **MBE (Bias):** Mean Bias Error $\frac{1}{N}\sum e_i$ (Detects systemic bias).
- **WAPE:** Weighted Absolute Percentage Error $\frac{\sum |e_i|}{\sum A_i} \times 100\%$ (Volume-weighted relative error; avoids dividing by zero actuals).
- **P5 / P95:** 5th and 95th percentiles of signed error (The 90% confidence reserve buffer).

---

## 6. January 2026 Key Market Findings

| Metric | 15:30 Cutoff (Day-Ahead Auction) | 09:50 Cutoff (N2EX Gate Closure) | Variance ($\Delta$) | Trading Insight |
|---|---:|---:|---:|---|
| **Coverage** | 100% (1,488 / 1,488) | 100% (1,488 / 1,488) | 0 | Full month sample integrity |
| **MAE** | 1,877.1 MW | 2,016.3 MW | **+139.2 MW** | Earlier deadline increases error |
| **RMSE** | 2,331.2 MW | 2,510.3 MW | **+179.1 MW** | Increased volatility |
| **Bias (MBE)** | +1,709.2 MW | +1,729.9 MW | **+20.7 MW** | **Persistent over-forecasting** |
| **WAPE** | 16.64% | 17.87% | **+1.23%** | Scale-free error grows by 1.2% |
| **P95 Shortfall** | **+4,535.0 MW** | **+5,346.6 MW** | **+811.6 MW** | **09:50 bidders need +812 MW more backup** |

### The January 12 Extreme Shortfall Event
On January 12, 2026 at Settlement Period 2 (01:00 UTC), D-1 forecast was `21,145 MW` but actual outturn wind was only `14,048 MW` — resulting in a **+7,097 MW shortfall**. This underscores why power buyers must base their reserve sizing on the **P95 error quantile** rather than simple MAE.

---

## 7. Data Source & Snapshot Refresh

- **Source:** Elexon BMRS API (`https://data.elexon.co.uk/bmrs/api/v1`)
  - Forecasts: `/datasets/WINDFOR/stream`
  - Actuals: `/datasets/FUELHH/stream` (`fuelType=WIND`)
- **Snapshot Date:** January 2026 decisions (`data/snapshot/manifest.json`).
- **To Refresh Snapshot:**
  ```bash
  python scripts/fetch_snapshot.py
  ```

---

## 8. Limitations & Boundary Conditions

1. **National Aggregation:** Elexon `WINDFOR` and `FUELHH` provide national GB wind generation. Regional transmission bottlenecks, locational curtailment, and embedded distribution wind are not disaggregated.
2. **Net Position:** The tool quantifies uncertainty in the wind term. Calculating exact power purchase volumes requires total portfolio demand and other scheduled generation.
3. **Cutoff Presets:** Real-world trading desks configure cutoffs to their specific bidding workflow. The tool defaults to `15:30` (GB half-hourly auction) and provides `09:50` (N2EX gate closure).

---

## 9. AI Tool Disclosure

In accordance with the challenge brief requirements:
- **AI Tools Used:** Claude Sonnet 3.7 / 4.6 and Gemini 3.8 Flash via Antigravity Agentic IDE.
- **Where Applied:** Architectural planning, test case generation, CSS polish, and documentation structuring.
- **Verification:** All data pipelines, mathematical formulas, and selection invariants were verified with 34 deterministic pytest unit tests and browser integration testing.
