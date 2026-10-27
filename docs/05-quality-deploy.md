# 05: Quality, Deployment, Submission

## Tests

### Backend (pytest; no live network in tests)

| Area | Must-have cases |
|---|---|
| `cutoff` | 15:30 London on D-1 converts to the right UTC; day before delivery uses the **local calendar date**; synthetic spring/autumn DST dates behave |
| `selection` | picks latest `publishTime`; **exactly-at-cutoff is eligible**; post-cutoff rejected even if it is the newest; no eligible gives `NO_FORECAST` (not 0); multiple vintages give one row; invariant `publishTime <= cutoff` holds on every output row |
| `normalise` | non-WIND dropped; tz parsed to UTC; invalid `generation` counted, not zeroed; duplicate keys counted and resolved by the documented rule |
| `metrics` | hand-calculated fixture matches MAE/RMSE/MBE/WAPE/P5/P95; sign convention; empty sample returns explicit nulls; WAPE `null` when sum(actual)==0; missing rows do not enter denominators |
| `api` | `/health`, `/meta`, `/analysis` shape; 422 on bad cutoff; interval drilldown flags `eligible`/`chosen` correctly; CORS header for the configured origin |
| Golden | a small real fixture from the probe run with 3 to 4 intervals checked by hand and documented in the test |

### Frontend (Vitest + Testing Library, a handful)

`format.ts` (MW, signed, local time), KPI renders unit and N, chart receives `null` gaps, Waking state appears on slow response (mock), Error state has Retry.

### Gate

`ruff check`, `ruff format --check`, `pytest`, `tsc --noEmit`, `eslint`, `vitest run`, `vite build` all green.

## CI (GitHub Actions, single workflow)

```
jobs:
  backend:  checkout -> setup uv -> uv sync --frozen -> ruff check -> ruff format --check -> pytest
  frontend: checkout -> setup node -> npm ci -> lint -> tsc --noEmit -> vitest run -> build
  docker:   docker build ./backend   (smoke only)
```

## Docker (backend)

- Base `python:3.12-slim`, install with `uv sync --frozen --no-dev`, copy `src/` and `data/snapshot/`, **non-root user**, `HEALTHCHECK` on `/health`.
- `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- `docker-compose.yml` at repo root: `backend` (8000) + `frontend` dev (Vite 5173) for local run in one command. Frontend gets `VITE_API_BASE_URL=http://localhost:8000`.
- Build with the repo root as context so `data/snapshot` is available (or mount it); document whichever you choose.

## Deployment

| Piece | Target | Config |
|---|---|---|
| Backend | **Render** web service (Docker) | Env: `CORS_ORIGINS=https://<app>.vercel.app,http://localhost:5173`; health check path `/health` |
| Frontend | **Vercel** | Root `frontend/`, build `npm run build`, output `dist`, env `VITE_API_BASE_URL=https://<api>.onrender.com` |
| Cold start | Render free tier sleeps | "Waking" UI state + an external keep-alive ping (e.g. UptimeRobot hitting `/health` every 5 min) for the review window; mention both in the README |

**Alternative if cold starts worry you:** FastAPI as a Vercel Python function (single platform, no cold-sleep, the brief's literal "Vercel"). Watch the bundle size limit with pandas. If it fits, it is the lower-risk demo; try it only if time allows after the Render path works.

No browser-to-Elexon calls. The frontend only calls your API.

## Repo

- Anonymous name, e.g. a random 8-char string. No company, challenge, personal name or handle in repo name, description or package names.
- Check commit author metadata and any `README`/`package.json` fields too; set `git config user.name/email` appropriately for this repo.
- Include `LICENSE`? Optional. `.gitignore`, `.env.example` (no real secrets; there are none).

## README checklist (required by brief + extras)

- [ ] Purpose + one screenshot
- [ ] **Files and directories** explained (brief requires)
- [ ] **How to start** (Docker one-liner; manual backend; manual frontend) (brief requires)
- [ ] **Link to deployed app** (+ API `/health` and `/docs`) (brief requires)
- [ ] **AI-tool disclosure**, naming the tools and where used (brief requires, if used)
- [ ] Data source, snapshot date, how to refresh
- [ ] Scope interpretation (decision vs delivery), cutoff assumption, error sign convention
- [ ] Metric definitions
- [ ] Test/lint/build commands
- [ ] Limitations

## Submission checklist

- [ ] Video: unlisted, <= 10:00, Part 1 <= 5:00 and Part 2 <= 5:00, legible text, no tabs/notifications/secrets
- [ ] Repo public and anonymous; README complete
- [ ] Vercel URL works, and the API works **from a cold start**
- [ ] Open every submitted URL in incognito (twice, once after the API has slept)
- [ ] Microsoft form submitted: https://forms.cloud.microsoft/r/FTX6K2bbnU
