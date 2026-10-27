"""
analysis/metrics.py
Computes all forecast accuracy metrics from the selection result.
Pure function: no I/O, no FastAPI imports.

Error sign convention (D6): error = forecast - actual
  positive = over-forecast (wind under-delivered; buyer is short)
  negative = under-forecast
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np
import pandas as pd

EXPECTED_INTERVALS = 31 * 48  # 1,488


def _safe_float(x) -> Optional[float]:
    """Return float or None if NaN/None."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return float(x)


def compute_metrics(selected: pd.DataFrame) -> dict:
    """
    Compute all metrics from the selection result DataFrame.

    Parameters
    ----------
    selected : output of selection.select_forecasts()

    Returns
    -------
    dict with keys matching the AnalysisResponse schema
    """
    matched = selected[selected["status"] == "MATCHED"].copy()
    n = len(matched)

    # ── Global metrics ────────────────────────────────────────────────────────
    if n == 0:
        metrics = {
            "mae": None, "rmse": None, "mbe": None, "wape_pct": None,
            "p5_error": None, "p95_error": None, "unit": "MW", "n": 0,
        }
    else:
        e = matched["error_mw"].values.astype(float)
        A = matched["actual_mw"].values.astype(float)

        mae = float(np.mean(np.abs(e)))
        rmse = float(np.sqrt(np.mean(e ** 2)))
        mbe = float(np.mean(e))
        sum_A = float(np.sum(A))
        wape_pct = float(np.sum(np.abs(e)) / sum_A * 100) if sum_A > 0 else None
        p5 = float(np.percentile(e, 5))
        p95 = float(np.percentile(e, 95))

        metrics = {
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "mbe": round(mbe, 2),
            "wape_pct": round(wape_pct, 2) if wape_pct is not None else None,
            "p5_error": round(p5, 2),
            "p95_error": round(p95, 2),
            "unit": "MW",
            "n": n,
        }

    # ── Coverage ──────────────────────────────────────────────────────────────
    coverage = {
        "expected": EXPECTED_INTERVALS,
        "matched": n,
        "coverage_pct": round(n / EXPECTED_INTERVALS * 100, 2),
    }

    # ── Quality counts ────────────────────────────────────────────────────────
    no_forecast = int((selected["status"] == "NO_FORECAST").sum())
    no_actual = int((selected["status"] == "NO_ACTUAL").sum())

    # ── By settlement period (1–48) ───────────────────────────────────────────
    by_sp = []
    if n > 0 and "settlement_period" in matched.columns:
        sp_grp = matched.groupby("settlement_period")
        for sp, grp in sp_grp:
            e_sp = grp["error_mw"].values.astype(float)
            by_sp.append({
                "period": int(sp),
                "mae": round(float(np.mean(np.abs(e_sp))), 2),
                "mbe": round(float(np.mean(e_sp)), 2),
                "n": len(grp),
            })
    by_sp.sort(key=lambda x: x["period"])

    # ── By lead time ──────────────────────────────────────────────────────────
    def lead_bucket(h: float) -> str:
        if h < 12:
            return "<12h"
        elif h < 18:
            return "12-18h"
        elif h < 24:
            return "18-24h"
        elif h < 30:
            return "24-30h"
        else:
            return "30h+"

    by_lead = []
    if n > 0:
        matched2 = matched.copy()
        matched2["lead_bucket"] = matched2["lead_hours"].apply(
            lambda h: lead_bucket(h) if h is not None and not math.isnan(h) else "unknown"
        )
        lead_order = ["<12h", "12-18h", "18-24h", "24-30h", "30h+", "unknown"]
        for bucket in lead_order:
            grp = matched2[matched2["lead_bucket"] == bucket]
            if grp.empty:
                continue
            e_l = grp["error_mw"].values.astype(float)
            by_lead.append({
                "bucket": bucket,
                "mae": round(float(np.mean(np.abs(e_l))), 2),
                "n": len(grp),
            })

    # ── Top 10 misses ─────────────────────────────────────────────────────────
    top_misses = []
    if n > 0:
        top = matched.copy()
        top["abs_error"] = top["error_mw"].abs()
        top = top.nlargest(10, "abs_error")
        for _, row in top.iterrows():
            top_misses.append({
                "start": row["start_utc"].isoformat(),
                "forecast": round(float(row["forecast_mw"]), 2),
                "actual": round(float(row["actual_mw"]), 2),
                "error": round(float(row["error_mw"]), 2),
                "publish_time": row["publish_time"].isoformat() if pd.notna(row["publish_time"]) else None,
            })

    # ── Intervals array ───────────────────────────────────────────────────────
    intervals = []
    for _, row in selected.iterrows():
        intervals.append({
            "start": row["start_utc"].isoformat(),
            "forecast": _safe_float(row["forecast_mw"]),
            "actual": _safe_float(row["actual_mw"]),
            "error": _safe_float(row["error_mw"]),
            "publish_time": row["publish_time"].isoformat() if pd.notna(row["publish_time"]) else None,
            "lead_hours": _safe_float(row["lead_hours"]),
            "status": row["status"],
        })

    return {
        "metrics": metrics,
        "coverage": coverage,
        "quality_counts": {
            "no_forecast": no_forecast,
            "no_actual": no_actual,
        },
        "by_settlement_period": by_sp,
        "by_lead_time": by_lead,
        "top_misses": top_misses,
        "intervals": intervals,
    }
