"""
analysis/selection.py
Selects the forecast vintage available at decision-cutoff time for each delivery interval.

Selection rule (docs/02-methodology.md, D4):
    For each delivery interval T:
        eligible = WINDFOR rows where startTime == T AND publishTime < cutoff(T)
        chosen   = row with max(publishTime) among eligible
        status   = MATCHED | NO_FORECAST | NO_ACTUAL

Invariant checked at runtime:
    chosen.publishTime < cutoff(T) for every matched row (strict-before)

Pure function: no I/O, no FastAPI imports.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from app.analysis.cutoff import cutoff_utc


def build_expected_intervals() -> list[datetime]:
    """
    Generate all expected 30-min delivery intervals for January 2026 decisions.

    Decision dates: 2026-01-01 .. 2026-01-31
    Delivery dates: 2026-01-02 .. 2026-02-01 (local = UTC in January)
    → 31 days × 48 half-hours = 1,488 intervals
    """
    from zoneinfo import ZoneInfo  # noqa: PLC0415

    london = ZoneInfo("Europe/London")
    intervals = []
    from datetime import date  # noqa: PLC0415

    start_date = date(2026, 1, 2)
    end_date = date(2026, 2, 2)  # exclusive
    cur = start_date
    while cur < end_date:
        for sp in range(48):
            local_dt = datetime(
                cur.year, cur.month, cur.day,
                (sp * 30) // 60, (sp * 30) % 60,
                tzinfo=london,
            )
            intervals.append(local_dt.astimezone(timezone.utc))
        cur += timedelta(days=1)
    return intervals


def select_forecasts(
    fuelhh: pd.DataFrame,
    windfor: pd.DataFrame,
    cutoff_hhmm: str,
) -> pd.DataFrame:
    """
    Run the selection algorithm for all expected delivery intervals.

    Parameters
    ----------
    fuelhh    : normalised FUELHH DataFrame (columns: startTime UTC, actual_mw, ...)
    windfor   : normalised WINDFOR DataFrame (columns: startTime UTC, publishTime UTC, forecast_mw)
    cutoff_hhmm : 'HH:MM' cutoff time in Europe/London

    Returns
    -------
    pd.DataFrame with columns:
        start_utc       : UTC datetime of delivery interval
        forecast_mw     : chosen forecast (or NaN)
        actual_mw       : actual (or NaN)
        error_mw        : forecast - actual (or NaN)
        publish_time    : publishTime of chosen vintage (or NaT)
        lead_hours      : hours between publishTime and startTime (or NaN)
        cutoff_utc      : the cutoff datetime used
        status          : MATCHED | NO_FORECAST | NO_ACTUAL
        settlement_period : from FUELHH (or NaN)
    """
    expected = build_expected_intervals()

    # Index lookups for speed
    fuelhh_idx = fuelhh.set_index("startTime")
    windfor_indexed = windfor.copy()

    rows = []
    for T in expected:
        cutoff_dt = cutoff_utc(T, cutoff_hhmm)

        # Select eligible vintages: startTime == T, publishTime < cutoff (strict-before
        # to ensure the forecast was published and available before market gate closure)
        mask = (windfor["startTime"] == T) & (windfor["publishTime"] < cutoff_dt)
        eligible = windfor[mask]

        # Actual
        actual_mw = None
        sp = None
        if T in fuelhh_idx.index:
            row = fuelhh_idx.loc[T]
            actual_mw = float(row["actual_mw"])
            sp = row.get("settlementPeriod", None)
            if sp is not None:
                try:
                    sp = int(sp)
                except (TypeError, ValueError):
                    sp = None

        if eligible.empty:
            status = "NO_FORECAST"
            rows.append({
                "start_utc": T,
                "forecast_mw": None,
                "actual_mw": actual_mw,
                "error_mw": None,
                "publish_time": None,
                "lead_hours": None,
                "cutoff_utc": cutoff_dt,
                "status": status,
                "settlement_period": sp,
            })
            continue

        # Pick the latest publishTime (most recent prior to decision time)
        chosen = eligible.loc[eligible["publishTime"].idxmax()]

        # Runtime invariant check: must be strictly before cutoff
        assert chosen["publishTime"] < cutoff_dt, (
            f"Invariant violated: chosen publishTime {chosen['publishTime']} "
            f"is not strictly before cutoff {cutoff_dt} for T={T}"
        )

        forecast_mw = float(chosen["forecast_mw"])
        pub_time = chosen["publishTime"]
        lead_hours = (T - pub_time).total_seconds() / 3600.0

        if actual_mw is None:
            status = "NO_ACTUAL"
            error_mw = None
        else:
            status = "MATCHED"
            error_mw = forecast_mw - actual_mw

        rows.append({
            "start_utc": T,
            "forecast_mw": forecast_mw,
            "actual_mw": actual_mw,
            "error_mw": error_mw,
            "publish_time": pub_time,
            "lead_hours": lead_hours,
            "cutoff_utc": cutoff_dt,
            "status": status,
            "settlement_period": sp,
        })

    df = pd.DataFrame(rows)
    df["start_utc"] = pd.to_datetime(df["start_utc"], utc=True)
    df["cutoff_utc"] = pd.to_datetime(df["cutoff_utc"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df
