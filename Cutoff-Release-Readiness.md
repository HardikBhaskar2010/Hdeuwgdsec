# Cutoff — Release Readiness Review

Based on the supplied “Wind Forecast Accuracy Portal — Walkthrough & Implementation Status” report. This is a review of the claims in that report; the repository and snapshot files were not supplied with it, so the listed local test results and numeric metrics have not been independently reproduced here.

## Release recommendation

**Do not record the final customer pitch or publish numeric claims until the high-priority checks below pass.** The described application may be close to ready, but the report contains methodological and interpretation risks that would be noticeable in a technical interview.

## P0 — Fix or verify before release

### 1. Cutoff inclusion and the 15:30 forecast vintage

The selection rule in the report uses `publishTime <= cutoff`, and the January 12 case study says the selected forecast was published at exactly `15:30:00` for a `15:30` market cutoff. A timestamp equal to gate closure does not prove the forecast was available early enough to trade on. Prefer strict-before semantics (`publishTime < cutoff`) unless authoritative source/event timing proves equality is safe; otherwise define and document an explicit operational buffer.

There is also a source-documentation check to perform: the current Elexon “latest wind forecast” documentation describes update times at 03:30, 05:30, 08:30, 10:30, 12:30, 16:30, 19:30 and 23:30, which does not include 15:30. This does not prove that a raw `WINDFOR` snapshot cannot contain a 15:30 publication, but it makes the exact raw row and endpoint semantics important to verify. Inspect the saved `publishTime` value in `data/snapshot/windfor.json` and record the raw provenance before using that case study. [Elexon documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest).

### 2. January 12 settlement-period label

The report labels `2026-01-12 01:00 UTC` as Settlement Period 2. If `startTime` is the start of the settlement interval, 01:00–01:30 is period 3; period 2 is 00:30–01:00. Reconcile the timestamp with the `settlementPeriod` field in the saved source records and correct either the time or the label. Do not present both until they agree.

### 3. Forecast vintages must come from historical forecast data

Elexon documents dataset endpoints as supporting retrieval by published times, including superseded historical forecasts. Confirm that the snapshot actually contains the historical vintages needed for each target interval, rather than only the latest forecast state. Assert this in an automated test and include a row-level audit example. [Elexon API overview](https://developer.data.elexon.co.uk/).

### 4. Market cutoff comparison needs precise labeling

Nord Pool documents the N2EX Day-Ahead Auction gate closure at 09:50 GMT. EPEX materials identify a GB half-hourly day-ahead auction at 15:30. These are different auction products (N2EX hourly vs EPEX half-hourly), not simply two alternative deadlines for the same auction. The comparison is still useful as a forecast-cutoff sensitivity study, but label it accordingly; do not claim that bidding five hours earlier by itself causes an exact procurement penalty. [Nord Pool N2EX](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction) · [EPEX trading brochure](https://www.epexspot.com/sites/default/files/2024-09/Trading%20Brochure%202024%20August.pdf).

### 5. Do not turn forecast error into a claimed hedge requirement

P95 of signed error (`forecast - actual`) is a distribution quantile. It is **not**, by itself, a required reserve/hedge/backup amount or a financial loss estimate. The challenge scope includes only national wind forecast and outturn; it excludes demand, other generation, portfolio trades, prices and imbalance settlement. Present `+4,535 MW` (if reproduced) as the empirical 95th percentile of signed forecast error and an indication of forecast-risk scale, not as a recommended buffer a trader “must maintain.”

### 6. Remove unsupported weather attribution

The claim that a particular Atlantic low-pressure system tracked slower than expected is not established by `FUELHH` and `WINDFOR` alone. The assignment limits the data to Elexon actuals and forecasts. Replace that causal statement with a data-only description: forecast, actual, error, selected publication time, and the fact that this dataset alone cannot attribute the miss to a specific weather cause.

## P1 — Must verify before final submission

- **Coverage definition:** calculate coverage as valid matched intervals with both actual and selected forecast divided by the expected 1,488 intervals. Calendar rows created by the application are not proof of data coverage. Show missing counts and keep missing values as `null`.
- **Scope wording:** decisions dated 1–31 January 2026 imply D+1 delivery intervals from 2 January through 1 February 2026 (1,488 half-hours). State this scope explicitly; do not call it “January delivery.”
- **Metrics:** reproduce MAE, RMSE, MBE, WAPE, P5 and P95 directly from the committed snapshot and report the denominator, unit, sample count, and missing-data policy. Call P5–P95 an empirical interval, not a confidence interval.
- **Error interpretation:** positive `forecast - actual` means wind was over-forecast. It can contribute to a short position only under a specific procurement strategy; actual portfolio exposure is outside this dataset.
- **Case study arithmetic:** assert `forecast_mw - actual_mw == error_mw`; assert the timestamp maps to the displayed settlement period; assert the selected vintage is strictly pre-cutoff under the documented rule.
- **Repository privacy:** inspect the git diff and ignore rules for personal paths, usernames, credentials, `.env` files and local development artifacts before creating the anonymous public repository.
- **Fresh-checkout proof:** run backend tests, frontend production build, Docker build/smoke test, and CI from a clean checkout. The supplied report says 34 tests passed, but that result is not independently verified by this review.

## Remaining delivery sequence

1. Reconcile cutoff semantics, raw publication timestamps, and the January 12 settlement-period label.
2. Recompute all summary metrics and update charts, methodology labels and the case study.
3. Build the public repository README from `Cutoff-README.md`, replacing all placeholders and checking the real project tree/commands.
4. Run tests and production builds from a clean checkout; fix any failures.
5. Publish the anonymous public GitHub repository; deploy backend to Render and frontend to Vercel; configure CORS and `VITE_API_BASE_URL`.
6. Verify all endpoints and UI in an incognito session.
7. Record the 10-minute maximum video: customer walkthrough first (≤5 min), technical review second (≤5 min). Do not use unreproduced metrics or claims.
8. Submit only after the public repo, app and unlisted video URLs each pass incognito checks.

## Sources used in this review

- Elexon Insights API overview: https://developer.data.elexon.co.uk/
- Elexon wind forecast documentation: https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest
- Nord Pool N2EX auction gate closure: https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction
- EPEX SPOT Trading Brochure 2024: https://www.epexspot.com/sites/default/files/2024-09/Trading%20Brochure%202024%20August.pdf
