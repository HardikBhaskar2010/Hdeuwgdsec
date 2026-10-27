# 01: Data Sources

## Verification status: read this first

Elexon's documentation pages (`bmrs.elexon.co.uk/api-documentation/...`) are JavaScript-rendered, and I could not read their parameter tables or fetch the API from my environment (the live API returned a proxy 403). What I did confirm:

- **[CONFIRMED]** Base URL: `https://data.elexon.co.uk/bmrs/api/v1` (Elexon API catalogue listing, system API entry).
- **[CONFIRMED]** **No API key required.** Elexon developer portal: "All our APIs are public and no API key is required."
- **[CONFIRMED]** Dataset paths are `datasets/WINDFOR` and `datasets/FUELHH`, with `/stream` variants. Stream responses are **JSON only**, and the portal says streams have "no restrictions or limits on data return" (about data volume, not request rate).
- **[CONFIRMED]** The challenge brief names the relevant fields (below).
- **[VERIFY]** Exact query-parameter names and the response record shape for the two dataset streams. Run `scripts/probe_elexon.py`; it tests the candidates below and saves fixtures.

## Datasets

### Actuals: `FUELHH` (half-hourly generation outturn by fuel type)

```
GET {BASE}/datasets/FUELHH/stream
    ?publishDateTimeFrom=<ISO-8601 UTC>      [VERIFY]
    &publishDateTimeTo=<ISO-8601 UTC>        [VERIFY]
    &fuelType=WIND                           [VERIFY, otherwise filter client-side]
```

Brief-confirmed fields: `startTime` (30-min target time), `fuelType`, `generation`.
Expected extras [VERIFY]: `dataset`, `publishTime`, `settlementDate`, `settlementPeriod`.

Rule: keep only `fuelType == "WIND"`. If the server-side `fuelType` filter is not supported, filter client-side.

### Forecasts: `WINDFOR` (wind generation forecast)

```
GET {BASE}/datasets/WINDFOR/stream
    ?publishDateTimeFrom=<ISO-8601 UTC>      [VERIFY]
    &publishDateTimeTo=<ISO-8601 UTC>        [VERIFY]
```

Brief-confirmed fields: `startTime` (target), `publishTime` (when the forecast was created), `generation`.
Expected shape: **many rows per `startTime`**, one per `publishTime` (forecast vintages). That is what makes decision-time selection possible. The probe confirms it.

Units: expected **MW** [VERIFY, label axes only after confirming].

## Fetch windows (for `scripts/fetch_snapshot.py`)

Decision dates 1 to 31 Jan 2026, so delivery T runs 2 Jan 00:00 to 1 Feb 24:00 local. In January Europe/London equals UTC (no DST).

| Dataset | Window | Reason |
|---|---|---|
| FUELHH | publish window covering `2026-01-02T00:00Z` to `2026-02-02T01:00Z` | Outturn for all delivery intervals. Filter on `startTime` after load. |
| WINDFOR | publish window `2025-12-28T00:00Z` to `2026-02-01T00:00Z` | Latest cutoff is 31 Jan 15:30. Earlier start gives margin for multi-day-ahead vintages. |

If the API filters on a different time field than `publishDateTime*` (the probe will show), adjust the window so the **same row set** is captured: every WINDFOR vintage for every target in scope.

Chunk requests by about 2 days regardless of stated limits, concatenate, and sort deterministically. Save:

```
data/snapshot/fuelhh_wind.json     raw rows (WIND only)
data/snapshot/windfor.json         raw rows
data/snapshot/manifest.json        {fetched_at_utc, endpoints, params per chunk, row counts, sha256 per file, source: "Elexon BMRS"}
```

Size is expected to be a few MB. If larger than about 20 MB, store `.json.gz`.

## Normalisation rules

| Field | Rule |
|---|---|
| `startTime`, `publishTime` | Parse as timezone-aware; convert to UTC. If the source has no offset, treat as UTC and record that in the manifest. |
| `generation` | Must be numeric and >= 0; invalid rows go to quality counts, never become 0. |
| Duplicates (actuals) | Key `(startTime)` after WIND filter. If duplicates differ, keep the one with the greatest `publishTime` and **count it**. |
| Duplicates (forecasts) | Key `(startTime, publishTime)`. Keep last, count them. |
| Missing | Missing is `null`, never 0. |

## Probe checklist (what `probe_elexon.py` answers)

- [ ] Which parameter names are accepted (publish vs settlement vs from/to)?
- [ ] Is `fuelType=WIND` filtered server-side?
- [ ] Exact field names and example records for both datasets
- [ ] Does `startTime` carry a `Z`/offset?
- [ ] Does WINDFOR have multiple `publishTime` per `startTime`? How many, and at what cadence?
- [ ] Forecast horizon: min and max of `startTime - publishTime`
- [ ] Are there FUELHH revisions / duplicate `startTime`?
- [ ] Is a 31-day request accepted, or does it error / truncate?
- [ ] Units, via docs or value magnitude (GB wind is on the order of 0 to 20,000 MW)

## Out of scope on purpose

Other Elexon endpoints such as the "latest wind forecast" series or `FUELINST`, plus any weather, demand or price source. The brief limits data to the two datasets.
