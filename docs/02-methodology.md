# 02: Methodology

The most important file. A reviewer will test whether you handled time correctly and avoided hindsight.

## Business question

A buyer in the GB day-ahead market commits on day **D-1** for delivery on day **D**. At that moment they only know forecasts **published so far**. For each half-hour of D: *what did the wind forecast say at decision time, and how wrong was it?*

## Definitions

- **Delivery interval T**: a 30-min `startTime` (UTC internally), belonging to a local (Europe/London) delivery date D.
- **Decision date**: D minus one local calendar day.
- **Cutoff(T)**: decision date at `HH:MM` Europe/London, converted to UTC. Build it from the local calendar date, **not** by subtracting 24 h from a UTC timestamp.
- **Vintage**: one WINDFOR row `(startTime=T, publishTime=p, generation=g)`.

## Scope

Decision dates 2026-01-01 .. 2026-01-31. Hence delivery dates 2026-01-02 .. 2026-02-01 (local). Expected intervals = 31 x 48 = **1,488** (use the actual count of expected 30-min slots, derived from the calendar, as the coverage denominator).

Show both ranges separately in the methodology panel. Never call it "January delivery".

## Selection algorithm

```
for each expected interval T in scope:
    cutoff   = london(local_date(T) - 1 day, HH:MM) -> UTC
    eligible = windfor[startTime == T and publishTime <= cutoff]     # <= inclusive
    if eligible empty:           status = NO_FORECAST
    else:                        chosen = row with max(publishTime)    # duplicate (startTime, publishTime) rows are a data error: dedupe and count them
    actual   = fuelhh_wind[startTime == T]
    if actual missing:           status = NO_ACTUAL
    if both present:             status = MATCHED; error = chosen.generation - actual.generation
```

Rules that must hold (each has a test):

1. `chosen.publishTime <= cutoff(T)` for every matched row. Assert it at runtime in the pipeline as well.
2. Exactly one chosen forecast per T.
3. A forecast published after the cutoff is never selected, even if it is the most recent overall.
4. Missing is excluded from metrics; **never zero-filled**.
5. The same set of matched intervals is used when comparing two cutoffs (compute the intersection and report it), otherwise differences come from population change.

## Metrics

With matched intervals `i`, forecast `F_i`, actual `A_i`, `e_i = F_i - A_i`, N = matched count. Unit: MW (confirm).

| Metric | Formula | Reading |
|---|---|---|
| MAE | mean(abs(e)) | Typical miss |
| RMSE | sqrt(mean(e^2)) | Penalises large misses |
| MBE (bias) | mean(e) | `> 0` over-forecast (wind under-delivered); `< 0` under-forecast |
| WAPE | sum(abs(e)) / sum(A) x 100 | Scale-free error; only if sum(A) > 0. **Do not use plain MAPE** (actuals can be near 0). |
| Coverage | N / expected x 100 | How much data supports the numbers; show N and expected |
| P5, P95 of e | quantiles | The hedge numbers. "95% of the time the forecast overshot by less than X MW", "5% of the time it undershot by more than Y MW" |

Breakdowns (all backend-computed, same matched set):

- **By settlement period** (local time-of-day, 48 buckets): MAE and bias.
- **By lead time** (hours between `publishTime` and `startTime`, bucketed, e.g. <12, 12-18, 18-24, 24-30, 30+): MAE and N. Shows how stale the chosen vintage is.
- **Top 10 misses** by `abs(e)`.

## Data-quality block (returned with every analysis)

`expected_intervals`, `actual_intervals`, `forecast_intervals_with_any_vintage`, `matched`, `no_forecast`, `no_actual`, `duplicate_actual_keys`, `duplicate_forecast_keys`, `invalid_rows`, plus `warnings[]`. Missing is not zero; say so.

## Time-handling rules

- Everything is UTC internally; format for display in Europe/London.
- Use `zoneinfo.ZoneInfo("Europe/London")`. January has no DST change, but test a synthetic spring/autumn date anyway so the logic is provably safe.
- Join key = UTC `startTime`. Carry `settlementDate` and `settlementPeriod` if present, for audit only.

## What this tool does not claim

It does not compute purchase volume (no demand or other supply data, by the brief's own scope). The pitch frames it as: *"residual to buy = demand - wind; here is the quantified uncertainty on the wind term."*
