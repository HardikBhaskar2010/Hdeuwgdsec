# 04: Frontend (minimal)

## Stack

React + Vite + TypeScript (`strict`), Tailwind, Recharts, TanStack Query. That's it.
**Not used:** shadcn, Zod, router, Redux/Zustand, icon pack (a few inline SVGs or none). Local UI state (`cutoff`, `selectedInterval`) lives in `useState` in `App`.

TypeScript types mirror the Pydantic schemas by hand (`src/types.ts`). The backend is the source of truth; if you want to avoid drift, generate types from `/openapi.json` with `openapi-typescript` (optional, one dev dependency).

## Principles

1. **Every number comes from the backend**; the frontend only formats. No metric math in React.
2. One page, five sections, dark theme only.
3. Missing is a gap in the chart, never zero.
4. Cutoff, unit and sample size are visible next to every metric.

## Layout (single page)

```
┌──────────────────────────────────────────────────────────────┐
│ Wind Forecast Accuracy  | Decisions: Jan 2026 | Delivery: 2 Jan – 1 Feb │
│ Cutoff: [15:30 ▾]  (Europe/London, D-1)   Data snapshot: <date>  [Method] │
├──────────────────────────────────────────────────────────────┤
│ KPI strip: MAE | RMSE | Bias | P95 over-forecast | Coverage              │
├──────────────────────────────────────────────────────────────┤
│ 1. Forecast vs Actual (line chart, brush zoom, gaps for missing)         │
├───────────────────────────────┬──────────────────────────────┤
│ 2. Error over time (signed)   │ 3. Error distribution (hist) │
│                               │    + P5 / P95 markers        │
├───────────────────────────────┴──────────────────────────────┤
│ 4. Error by time of day (bar, MAE+bias) | by lead time (bar) │
├──────────────────────────────────────────────────────────────┤
│ 5. Interval detail: click a point → vintages table            │
│    (publishTime, forecast, eligible?, chosen?) + actual       │
│    Top-10 misses table (click to open detail)                 │
├──────────────────────────────────────────────────────────────┤
│ Methodology & data quality (collapsible drawer/section)       │
└──────────────────────────────────────────────────────────────┘
```

Mobile: single column, charts stack, KPI strip becomes 2x3 grid, tables scroll horizontally inside their card.

## Components

```
src/
  main.tsx  App.tsx
  api.ts                 # fetch helpers, base URL from VITE_API_BASE_URL, typed errors
  types.ts
  format.ts              # MW, signed MW, %, Europe/London datetime (Intl.DateTimeFormat)
  hooks/useAnalysis.ts   # useQuery(['analysis', cutoff])
  hooks/useInterval.ts   # useQuery(['interval', start, cutoff], enabled: !!start)
  components/
    Header.tsx  CutoffSelect.tsx
    KpiStrip.tsx  Kpi.tsx            # tooltip: formula, unit, N
    ForecastActualChart.tsx          # Recharts LineChart + Brush; onClick -> select interval
    ErrorOverTimeChart.tsx
    ErrorHistogram.tsx               # bins computed from intervals[] errors (display binning only)
    BreakdownCharts.tsx              # by_settlement_period, by_lead_time
    IntervalDetail.tsx               # vintages table
    TopMisses.tsx
    Methodology.tsx                  # scope, cutoff rule, formulas, quality counts, limitations
    States.tsx                       # Loading, Waking, ErrorBox, Empty
```

Display binning for the histogram is the only client-side computation allowed; it is not a metric.

## Data flow

`App` holds `cutoff` and `selectedStart`. `useAnalysis(cutoff)` fetches `/api/v1/analysis`. TanStack Query caches per cutoff, so toggling back is instant. Selecting a point triggers `useInterval(selectedStart, cutoff)`.

## States (required)

| State | Behaviour |
|---|---|
| Loading | Skeletons for KPI strip and charts |
| **Waking** | If the first request takes more than about 4 s, show "Waking the API (free tier cold start, ~30-60 s)" with a spinner. TanStack `retry: 3` with backoff |
| Error | Message + Retry button; never raw exception text |
| Empty / partial | Banner with `coverage` and missing counts; gaps visible in chart |

## Chart specifics

- **Forecast vs actual**: two lines, `connectNulls={false}`. Tooltip: local time, forecast, actual, signed error, chosen `publishTime`, lead hours. Brush for zoom; default view = whole range, with a quick "jump to day" `<input type="date">` as the only extra control.
- **Error over time**: bars or area around a zero line; colour for over- vs under-forecast with a **non-colour cue** (the legend and tooltip say "over-forecast" / "under-forecast").
- **Histogram**: vertical lines at P5 and P95 from the backend.
- Y axis labelled "MW". Use sequential/diverging colours consistently (over = one hue, under = another; actual vs forecast = two distinct hues).

## Accessibility and polish budget (small but visible)

Semantic landmarks, labelled select, visible focus rings, `aria-label` on charts with a one-line summary, colour-blind-safe pair, and tables as real `<table>`. Skip animations beyond a loading skeleton.

## Cut if short on time

Histogram, by-lead-time chart, date jump. **Keep**: KPI strip, forecast-vs-actual with drilldown, methodology panel, states.
