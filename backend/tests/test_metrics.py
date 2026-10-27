"""Tests for analysis/metrics.py — hand-calculated fixtures."""

import pandas as pd
import pytest

from app.analysis.metrics import compute_metrics


def _make_selected(rows: list[dict]) -> pd.DataFrame:
    """Build a selected DataFrame from a list of dicts."""
    df = pd.DataFrame(rows)
    df["start_utc"] = pd.to_datetime(df["start_utc"], utc=True)
    df["cutoff_utc"] = pd.to_datetime(df["cutoff_utc"], utc=True)
    df["publish_time"] = pd.to_datetime(df.get("publish_time"), utc=True)
    return df


CUTOFF_ISO = "2026-01-01T15:30:00Z"
START_ISO = "2026-01-02T00:00:00Z"
PUB_ISO = "2026-01-01T14:00:00Z"


def _row(start, forecast, actual, pub=PUB_ISO, lead=25.5, sp=1, status="MATCHED"):
    error = forecast - actual if status == "MATCHED" else None
    return {
        "start_utc": start,
        "forecast_mw": forecast if status != "NO_FORECAST" else None,
        "actual_mw": actual if status != "NO_ACTUAL" else None,
        "error_mw": error,
        "publish_time": pub if status != "NO_FORECAST" else None,
        "lead_hours": lead,
        "cutoff_utc": CUTOFF_ISO,
        "status": status,
        "settlement_period": sp,
    }


class TestMetrics:
    def test_empty_gives_nulls(self):
        df = _make_selected(
            [
                _row("2026-01-02T00:00:00Z", 10000, 10000, status="NO_FORECAST"),
            ]
        )
        result = compute_metrics(df)
        m = result["metrics"]
        assert m["mae"] is None
        assert m["rmse"] is None
        assert m["n"] == 0

    def test_hand_calculated_mae_rmse_mbe(self):
        """
        3 matched rows with known errors: +1000, -500, +250
        MAE  = mean(1000, 500, 250)  = 583.33…
        RMSE = sqrt(mean(1e6, 250000, 62500)) = sqrt(437500) ≈ 661.44
        MBE  = mean(1000, -500, 250) = 250
        """
        rows = [
            _row("2026-01-02T00:00:00Z", 11000.0, 10000.0, sp=1),  # error +1000
            _row("2026-01-02T00:30:00Z", 9500.0, 10000.0, sp=2),  # error -500
            _row("2026-01-02T01:00:00Z", 10250.0, 10000.0, sp=3),  # error +250
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        m = result["metrics"]
        assert m["n"] == 3
        assert m["mae"] == pytest.approx(583.33, abs=1.0)
        assert m["rmse"] == pytest.approx(661.44, abs=1.0)
        assert m["mbe"] == pytest.approx(250.0, abs=0.1)

    def test_wape_calculation(self):
        """WAPE = sum(abs(e)) / sum(A) * 100"""
        # errors: +1000, -500, +250 → sum(abs) = 1750
        # actuals: 10000, 10000, 10000 → sum = 30000
        # WAPE = 1750/30000 * 100 = 5.833...
        rows = [
            _row("2026-01-02T00:00:00Z", 11000.0, 10000.0, sp=1),
            _row("2026-01-02T00:30:00Z", 9500.0, 10000.0, sp=2),
            _row("2026-01-02T01:00:00Z", 10250.0, 10000.0, sp=3),
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        assert result["metrics"]["wape_pct"] == pytest.approx(5.83, abs=0.1)

    def test_wape_null_when_actual_zero(self):
        """WAPE is null when sum(actual) == 0."""
        rows = [_row("2026-01-02T00:00:00Z", 100.0, 0.0, sp=1)]
        df = _make_selected(rows)
        result = compute_metrics(df)
        assert result["metrics"]["wape_pct"] is None

    def test_p5_p95_sign_convention(self):
        """P5 < 0 means under-forecast 5th pct; P95 > 0 means over-forecast 95th pct."""
        # Create 100 errors: mostly positive (over-forecast bias)
        errors = list(range(-200, 800, 10))  # 100 values from -200 to 790
        rows = [
            _row(
                f"2026-01-02T{i:02d}:00:00Z" if i < 24 else f"2026-01-02T{i%24:02d}:30:00Z",
                10000.0 + e,
                10000.0,
                sp=1,
            )
            for i, e in enumerate(errors)
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        m = result["metrics"]
        assert m["p5_error"] < m["p95_error"]

    def test_missing_not_in_metrics(self):
        """Rows with status NO_FORECAST or NO_ACTUAL do NOT enter metric denominators."""
        rows = [
            _row("2026-01-02T00:00:00Z", 10000.0, 10000.0, sp=1),  # MATCHED, error=0
            _row("2026-01-02T00:30:00Z", 0, 0, status="NO_FORECAST", sp=2),
            _row("2026-01-02T01:00:00Z", 0, 0, status="NO_ACTUAL", sp=3),
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        # Only 1 matched row; MAE = 0, n = 1
        assert result["metrics"]["n"] == 1
        assert result["metrics"]["mae"] == pytest.approx(0.0)

    def test_coverage_counts(self):
        rows = [
            _row("2026-01-02T00:00:00Z", 10000.0, 10000.0, sp=1),
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        cov = result["coverage"]
        assert cov["expected"] == 1488
        assert cov["matched"] == 1

    def test_top_misses_sorted_by_abs_error(self):
        """Top misses are sorted by |error| descending."""
        rows = [
            _row("2026-01-02T00:00:00Z", 12000.0, 10000.0, sp=1),  # error +2000
            _row("2026-01-02T00:30:00Z", 9000.0, 10000.0, sp=2),  # error -1000
            _row("2026-01-02T01:00:00Z", 10100.0, 10000.0, sp=3),  # error +100
        ]
        df = _make_selected(rows)
        result = compute_metrics(df)
        misses = result["top_misses"]
        assert abs(misses[0]["error"]) >= abs(misses[1]["error"])
