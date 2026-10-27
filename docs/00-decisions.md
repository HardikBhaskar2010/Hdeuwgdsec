# 00: Decisions

## What the brief actually requires (source: challenge docx)

- Data: Elexon **FUELHH** (filter `fuelType == "WIND"`) and **WINDFOR** only. No other data.
- Only **purchase decisions made in January 2026**.
- Decisions are made **one day before the delivery day**.
- App must (1) show the latest forecast available at decision time, (2) quantify forecast accuracy so buyers can account for error.
- React frontend, Python backend, Docker, deployed on Vercel or Heroku.
- Public GitHub repo with an **anonymous name**; README with file/dir layout, start instructions, deployed link, **AI-tool disclosure**.
- Unlisted YouTube video, max 10 min: Part 1 customer pitch (<=5), Part 2 tech-lead review (<=5). Evaluated **starting with the video**.
- Max 16 h. Submit via the Microsoft form. Every URL checked in incognito.

## Decision table

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Data access | **Fetch once, commit raw snapshot**, serve from memory | January 2026 is fixed history. Live calls add latency, cold-start pain and a demo failure mode. Provenance is recorded in a manifest. |
| D2 | Decision-month scope | Decision dates 1 to 31 Jan 2026 (Europe/London). Delivery intervals therefore span 2 Jan 00:00 to 1 Feb 24:00 local = **31 days x 48 = 1,488 intervals** | "Decisions made in January" means decision date, not delivery date. Show both ranges in the UI. |
| D3 | Decision cutoff | Configurable, **default 15:30 Europe/London on D-1**; alternative preset **09:50** | The brief gives no time. Show the cutoff on every view and document it as an assumption. |
| D4 | Selection rule | For each delivery interval T: forecast row with `startTime == T` and the **greatest `publishTime < cutoff(T)` (strict-before)** | No hindsight leakage. A forecast timestamped with the exact gate-closure minute cannot be ingested and traded on prior to closure. |
| D5 | Metrics | MAE, RMSE, MBE (signed), WAPE, coverage, **P5/P95 of signed error**, error by settlement period, error by lead time, top misses | The brief asks for error "so they can make decisions considering the quantified error". Percentiles turn error into a hedge-buffer number. |
| D6 | Error sign | `error = forecast - actual`. Positive = over-forecast (wind did not show up, buyer is short). | One convention everywhere. |
| D7 | Backend | Python 3.12, FastAPI, Pydantic v2, pandas, uvicorn. `httpx` only in the fetch script. | Matches the job ad. pandas is fine for about 100k rows. |
| D8 | Frontend | React + Vite + TypeScript, Tailwind, Recharts, TanStack Query. **No** shadcn, Zod, router or state library. | Smallest stack that still looks professional. |
| D9 | Pages | One single-page dashboard, 5 sections | The brief rewards clarity, not breadth. |
| D10 | Deploy | **Vercel** (frontend) + **Render** Docker web service (backend); keep-alive ping + "waking API" UI state | Brief allows Vercel/Heroku; Docker is required. Alternative in `05-quality-deploy.md`. |
| D11 | Repo | Anonymous name, monorepo `frontend/` + `backend/` + `data/` + `scripts/` + `docs/` | Per brief. |

## Explicitly cut

Auth, database, Redis, Celery, ML forecasting, extra datasets (demand, prices, other fuels), maps, heatmap, i18n, dark/light toggle (dark only), shadcn/Zod/router, saved views, alerts.

## Honest limitations to state in the UI and video

- National wind only. No demand or other supply, so the app **cannot** compute the true "power to buy". It quantifies the wind-forecast uncertainty the buyer must hedge.
- The real client cutoff is unknown. Two presets are shown.
- Snapshot is dated; it is not live.
