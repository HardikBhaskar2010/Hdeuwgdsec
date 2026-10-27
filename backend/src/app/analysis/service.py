"""
analysis/service.py
Orchestrates the full analysis pipeline with LRU caching per cutoff.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd

from app.analysis.metrics import compute_metrics
from app.analysis.selection import select_forecasts
from app.data.normalise import NormaliseResult


def _manifest_sha256(manifest: dict) -> str:
    return hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:16]


def build_analysis(
    norm: NormaliseResult,
    manifest: dict,
    cutoff_hhmm: str,
) -> dict[str, Any]:
    """
    Run the full analysis pipeline for a given cutoff and return the
    AnalysisResponse-compatible dict.

    Cached externally by the FastAPI lifespan / route handler.
    """
    selected = select_forecasts(norm.fuelhh, norm.windfor, cutoff_hhmm)
    result = compute_metrics(selected)

    # Vintage detail lookup (for drilldown endpoint)
    # We store the full windfor for drilldown use
    fetched_at = manifest.get("fetched_at_utc", "unknown")

    quality = {
        "actual_intervals": len(norm.fuelhh),
        "forecast_intervals": len(norm.windfor) // 2,  # before 30-min duplication
        "no_forecast": result["quality_counts"]["no_forecast"],
        "no_actual": result["quality_counts"]["no_actual"],
        "duplicate_actual_keys": norm.duplicate_actual_keys,
        "duplicate_forecast_keys": norm.duplicate_forecast_keys,
        "invalid_rows": norm.invalid_rows,
        "warnings": norm.warnings,
    }

    return {
        "cutoff": {
            "time": cutoff_hhmm,
            "timezone": "Europe/London",
            "rule": "latest forecast with publishTime < cutoff on day before delivery (strict-before)",
        },
        "metrics": result["metrics"],
        "coverage": result["coverage"],
        "quality": quality,
        "intervals": result["intervals"],
        "by_settlement_period": result["by_settlement_period"],
        "by_lead_time": result["by_lead_time"],
        "top_misses": result["top_misses"],
        "snapshot": {
            "fetched_at": fetched_at,
            "manifest_sha256": _manifest_sha256(manifest),
        },
    }


def get_interval_detail(
    windfor_raw: pd.DataFrame,
    fuelhh: pd.DataFrame,
    start_utc_str: str,
    cutoff_hhmm: str,
) -> dict[str, Any] | None:
    """
    Return all vintages for a specific delivery interval start time,
    with eligible/chosen flags.
    """
    from app.analysis.cutoff import cutoff_utc  # noqa: PLC0415

    try:
        T = pd.Timestamp(start_utc_str, tz="UTC")
    except Exception:
        return None

    cutoff_dt = cutoff_utc(T.to_pydatetime(), cutoff_hhmm)
    cutoff_iso = cutoff_dt.isoformat()

    # All vintages for this startTime
    mask = windfor_raw["startTime"] == T
    vintages_df = windfor_raw[mask].copy()
    vintages_df = vintages_df.sort_values("publishTime")

    # Actual
    actual_row = fuelhh[fuelhh["startTime"] == T]
    actual_mw = float(actual_row["actual_mw"].iloc[0]) if not actual_row.empty else None

    # Eligible = publishTime < cutoff (strict-before)
    eligible_mask = vintages_df["publishTime"] < pd.Timestamp(cutoff_dt)
    eligible_vintages = vintages_df[eligible_mask]
    chosen_pub = eligible_vintages["publishTime"].max() if not eligible_vintages.empty else None

    vintages = []
    for _, row in vintages_df.iterrows():
        eligible = bool(row["publishTime"] < pd.Timestamp(cutoff_dt))
        chosen = eligible and (chosen_pub is not None) and (row["publishTime"] == chosen_pub)
        vintages.append(
            {
                "publish_time": row["publishTime"].isoformat(),
                "generation": float(row["forecast_mw"]),
                "eligible": eligible,
                "chosen": bool(chosen),
            }
        )

    return {
        "start": T.isoformat(),
        "cutoff_utc": cutoff_iso,
        "actual": actual_mw,
        "vintages": vintages,
    }
