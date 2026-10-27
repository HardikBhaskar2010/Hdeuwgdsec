"""
data/normalise.py
Parses and cleans raw DataFrames from the snapshot.
Pure function: no I/O, no side effects, no FastAPI imports.

Key design notes:
- WINDFOR uses 1-hour resolution; FUELHH uses 30-minute resolution.
- We align WINDFOR to 30-min by duplicating each hourly forecast to cover
  both HH slots within that hour (the forecast applies to both X:00 and X:30).
  This is the standard approach: a forecast published for 14:00 is used for
  both 14:00 and 14:30 delivery intervals.
- All times are parsed to UTC-aware datetimes.
- Invalid generation values are counted and excluded.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd


@dataclass
class NormaliseResult:
    fuelhh: pd.DataFrame          # clean actuals (startTime as UTC datetime, gen numeric)
    windfor: pd.DataFrame         # clean forecasts aligned to 30-min slots
    duplicate_actual_keys: int    # startTime dupes resolved
    duplicate_forecast_keys: int  # (startTime, publishTime) dupes resolved
    invalid_rows: int             # rows with invalid generation removed
    warnings: list[str] = field(default_factory=list)


def _parse_utc(series: pd.Series) -> pd.Series:
    """Parse ISO-8601 strings to UTC-aware datetime64[ns, UTC]."""
    parsed = pd.to_datetime(series, utc=True, errors="coerce")
    return parsed


def normalise(
    fuelhh_raw: pd.DataFrame,
    windfor_raw: pd.DataFrame,
) -> NormaliseResult:
    """
    Normalise raw DataFrames from the snapshot.

    Parameters
    ----------
    fuelhh_raw : raw FUELHH rows (already WIND-filtered at fetch time)
    windfor_raw : raw WINDFOR rows

    Returns
    -------
    NormaliseResult with clean DataFrames and quality counts
    """
    warnings: list[str] = []
    invalid_rows = 0
    duplicate_actual_keys = 0
    duplicate_forecast_keys = 0

    # ── FUELHH ────────────────────────────────────────────────────────────────
    fh = fuelhh_raw.copy()

    # Ensure WIND filter (belt-and-suspenders)
    if "fuelType" in fh.columns:
        non_wind = (~fh["fuelType"].eq("WIND")).sum()
        if non_wind:
            warnings.append(f"Dropped {non_wind} non-WIND rows from FUELHH")
        fh = fh[fh["fuelType"].eq("WIND")].copy()

    # Parse times
    fh["startTime"] = _parse_utc(fh["startTime"])
    fh["publishTime"] = _parse_utc(fh["publishTime"])

    # Validate generation
    fh["generation"] = pd.to_numeric(fh["generation"], errors="coerce")
    invalid_fh = fh["generation"].isna() | (fh["generation"] < 0)
    invalid_rows += int(invalid_fh.sum())
    if invalid_fh.any():
        warnings.append(f"Removed {invalid_fh.sum()} FUELHH rows with invalid generation")
    fh = fh[~invalid_fh].copy()

    # Deduplicate: key = startTime; keep latest publishTime
    pre_dedup = len(fh)
    fh = fh.sort_values("publishTime").groupby("startTime", as_index=False).last()
    duplicate_actual_keys = pre_dedup - len(fh)
    if duplicate_actual_keys:
        warnings.append(f"Resolved {duplicate_actual_keys} duplicate FUELHH startTime keys")

    fh = fh[["startTime", "publishTime", "generation", "settlementDate", "settlementPeriod"]].copy()
    # Rename for clarity
    fh = fh.rename(columns={"generation": "actual_mw"})
    fh = fh.sort_values("startTime").reset_index(drop=True)

    # ── WINDFOR ────────────────────────────────────────────────────────────────
    wf = windfor_raw.copy()

    # Parse times
    wf["startTime"] = _parse_utc(wf["startTime"])
    wf["publishTime"] = _parse_utc(wf["publishTime"])

    # Validate generation
    wf["generation"] = pd.to_numeric(wf["generation"], errors="coerce")
    invalid_wf = wf["generation"].isna() | (wf["generation"] < 0)
    invalid_rows += int(invalid_wf.sum())
    if invalid_wf.any():
        warnings.append(f"Removed {invalid_wf.sum()} WINDFOR rows with invalid generation")
    wf = wf[~invalid_wf].copy()

    # Deduplicate: key = (startTime, publishTime)
    pre_dedup_wf = len(wf)
    wf = wf.drop_duplicates(subset=["startTime", "publishTime"], keep="last")
    duplicate_forecast_keys = pre_dedup_wf - len(wf)
    if duplicate_forecast_keys:
        warnings.append(f"Resolved {duplicate_forecast_keys} duplicate WINDFOR (startTime, publishTime) keys")

    wf = wf[["startTime", "publishTime", "generation"]].copy()
    wf = wf.rename(columns={"generation": "forecast_mw"})

    # ── Align WINDFOR 1h resolution to 30-min slots ────────────────────────
    # WINDFOR forecasts are on the hour (e.g., 14:00). FUELHH actuals are at
    # 30-min resolution (14:00 AND 14:30). We duplicate each WINDFOR row to
    # also cover the +30-min slot.
    # This means the same forecast vintage applies to both 14:00 and 14:30.
    wf_half = wf.copy()
    from pandas import Timedelta  # noqa: PLC0415
    wf_half["startTime"] = wf_half["startTime"] + Timedelta(minutes=30)
    wf_aligned = pd.concat([wf, wf_half], ignore_index=True)

    # Re-deduplicate after alignment (in case original data already had some :30 rows)
    pre_align_dedup = len(wf_aligned)
    wf_aligned = wf_aligned.drop_duplicates(subset=["startTime", "publishTime"], keep="last")
    align_dupes = pre_align_dedup - len(wf_aligned)
    if align_dupes:
        warnings.append(f"Resolved {align_dupes} duplicate slots after 30-min alignment")

    wf_aligned = wf_aligned.sort_values(["startTime", "publishTime"]).reset_index(drop=True)

    return NormaliseResult(
        fuelhh=fh,
        windfor=wf_aligned,
        duplicate_actual_keys=duplicate_actual_keys,
        duplicate_forecast_keys=duplicate_forecast_keys,
        invalid_rows=invalid_rows,
        warnings=warnings,
    )
