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
High-performance implementation using pd.DatetimeIndex bisection (python-performance-optimization).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd

from app.analysis.cutoff import cutoff_utc


def build_expected_intervals() -> list[datetime]:
    """
    Generate all expected 30-min delivery intervals for January 2026 decisions.

    Decision dates: 2026-01-01 .. 2026-01-31
    Delivery dates: 2026-01-02 .. 2026-02-01 (local = UTC in January)
    → 31 days × 48 half-hours = 1,488 intervals
    """
    from datetime import date  # noqa: PLC0415
    from zoneinfo import ZoneInfo  # noqa: PLC0415

    london = ZoneInfo("Europe/London")
    intervals = []

    start_date = date(2026, 1, 2)
    end_date = date(2026, 2, 2)  # exclusive
    cur = start_date
    while cur < end_date:
        for sp in range(48):
            local_dt = datetime(
                cur.year,
                cur.month,
                cur.day,
                (sp * 30) // 60,
                (sp * 30) % 60,
                tzinfo=london,
            )
            intervals.append(local_dt.astimezone(UTC))
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

    # Pre-index FUELHH by startTime for O(1) lookup
    fuelhh_dict: dict[pd.Timestamp, tuple[float | None, int | None]] = {}
    if not fuelhh.empty and "startTime" in fuelhh.columns:
        for row in fuelhh.itertuples():
            st = row.startTime
            mw = getattr(row, "actual_mw", None)
            sp_val = getattr(row, "settlementPeriod", None)
            fuelhh_dict[st] = (float(mw) if mw is not None else None, sp_val)

    # Group WINDFOR by startTime once, sorted by publishTime
    # Store DatetimeIndex and numpy array for fast searchsorted bisection
    wf_dict: dict[pd.Timestamp, tuple[pd.DatetimeIndex, np.ndarray]] = {}
    if not windfor.empty:
        windfor_sorted = windfor.sort_values(["startTime", "publishTime"])
        for start_t, grp in windfor_sorted.groupby("startTime"):
            wf_dict[pd.Timestamp(start_t)] = (
                pd.DatetimeIndex(grp["publishTime"]),
                grp["forecast_mw"].to_numpy(dtype=float),
            )

    rows = []
    for T in expected:
        cutoff_dt = cutoff_utc(T, cutoff_hhmm)

        actual_mw, sp = fuelhh_dict.get(pd.Timestamp(T), (None, None))
        if sp is not None:
            try:
                sp = int(sp)
            except (TypeError, ValueError):
                sp = None

        entry = wf_dict.get(pd.Timestamp(T))
        if entry is None:
            rows.append(
                {
                    "start_utc": T,
                    "forecast_mw": None,
                    "actual_mw": actual_mw,
                    "error_mw": None,
                    "publish_time": None,
                    "lead_hours": None,
                    "cutoff_utc": cutoff_dt,
                    "status": "NO_FORECAST",
                    "settlement_period": sp,
                }
            )
            continue

        dti, fcs = entry
        # searchsorted side='left' returns index where cutoff_dt would be placed
        # so all elements before idx are strictly < cutoff_dt
        idx = int(dti.searchsorted(cutoff_dt, side="left")) - 1

        if idx < 0:
            rows.append(
                {
                    "start_utc": T,
                    "forecast_mw": None,
                    "actual_mw": actual_mw,
                    "error_mw": None,
                    "publish_time": None,
                    "lead_hours": None,
                    "cutoff_utc": cutoff_dt,
                    "status": "NO_FORECAST",
                    "settlement_period": sp,
                }
            )
            continue

        forecast_mw = float(fcs[idx])
        pub_time = dti[idx]

        # Runtime invariant check: must be strictly before cutoff
        assert pub_time < cutoff_dt, (
            f"Invariant violated: chosen publishTime {pub_time} "
            f"is not strictly before cutoff {cutoff_dt} for T={T}"
        )

        lead_hours = (T - pub_time).total_seconds() / 3600.0

        if actual_mw is None:
            status = "NO_ACTUAL"
            error_mw = None
        else:
            status = "MATCHED"
            error_mw = forecast_mw - actual_mw

        rows.append(
            {
                "start_utc": T,
                "forecast_mw": forecast_mw,
                "actual_mw": actual_mw,
                "error_mw": error_mw,
                "publish_time": pub_time,
                "lead_hours": lead_hours,
                "cutoff_utc": cutoff_dt,
                "status": status,
                "settlement_period": sp,
            }
        )

    df = pd.DataFrame(rows)
    df["start_utc"] = pd.to_datetime(df["start_utc"], utc=True)
    df["cutoff_utc"] = pd.to_datetime(df["cutoff_utc"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df
