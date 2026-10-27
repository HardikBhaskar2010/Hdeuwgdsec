"""Tests for analysis/selection.py"""
import pytest
from datetime import datetime, timezone, timedelta

import pandas as pd

from app.analysis.selection import select_forecasts, build_expected_intervals


def utc(iso: str) -> pd.Timestamp:
    return pd.Timestamp(iso, tz="UTC")


def make_fuelhh(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    return df


def make_windfor(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    return df


class TestBuildExpectedIntervals:
    def test_count(self):
        intervals = build_expected_intervals()
        # 31 decision days × 48 half-hours = 1488
        assert len(intervals) == 1488

    def test_first_interval(self):
        intervals = build_expected_intervals()
        # First delivery: 2 Jan 2026 00:00 UTC (= 00:00 London in January)
        assert intervals[0] == datetime(2026, 1, 2, 0, 0, 0, tzinfo=timezone.utc)

    def test_last_interval(self):
        intervals = build_expected_intervals()
        # Last delivery: 1 Feb 2026 23:30 UTC
        assert intervals[-1] == datetime(2026, 2, 1, 23, 30, 0, tzinfo=timezone.utc)

    def test_all_utc(self):
        intervals = build_expected_intervals()
        for iv in intervals[:48]:
            assert iv.tzinfo == timezone.utc


class TestSelectForecasts:
    def _minimal_frames(self, T_iso: str, actual_mw: float, vintages: list[tuple[str, float]]):
        """Helper: build minimal DataFrames for a single interval."""
        fh = make_fuelhh([{
            "startTime": T_iso,
            "publishTime": "2026-01-01T16:00:00Z",  # doesn't matter for actuals
            "actual_mw": actual_mw,
            "settlementDate": "2026-01-02",
            "settlementPeriod": 1,
        }])
        wf_rows = [{"startTime": T_iso, "publishTime": p, "forecast_mw": g} for p, g in vintages]
        wf = make_windfor(wf_rows)
        return fh, wf

    def test_picks_latest_eligible(self):
        """Selects the vintage with the latest publishTime <= cutoff."""
        T = "2026-01-02T00:00:00Z"
        # cutoff 15:30 London on 1 Jan = 15:30 UTC
        # Vintage at 14:00 (eligible), 15:30 (eligible, at cutoff), 16:00 (ineligible)
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-01T14:00:00Z", 9000.0),
            ("2026-01-01T15:30:00Z", 9500.0),  # latest eligible
            ("2026-01-01T16:00:00Z", 9800.0),  # post-cutoff, must NOT be chosen
        ])
        result = select_forecasts(fh, wf, "15:30")
        matched = result[result["status"] == "MATCHED"]
        assert len(matched) == 1
        row = matched.iloc[0]
        assert row["forecast_mw"] == pytest.approx(9500.0)
        assert row["publish_time"] == pd.Timestamp("2026-01-01T15:30:00Z", tz="UTC")

    def test_exactly_at_cutoff_is_eligible(self):
        """A forecast published exactly at the cutoff time is eligible (<=)."""
        T = "2026-01-02T00:00:00Z"
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-01T15:30:00Z", 9900.0),  # exactly at cutoff
        ])
        result = select_forecasts(fh, wf, "15:30")
        assert result[result["status"] == "MATCHED"].iloc[0]["forecast_mw"] == pytest.approx(9900.0)

    def test_post_cutoff_rejected(self):
        """A forecast published after the cutoff is rejected, even if newest overall."""
        T = "2026-01-02T00:00:00Z"
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-01T15:31:00Z", 9999.0),  # 1 minute after cutoff
        ])
        result = select_forecasts(fh, wf, "15:30")
        row = result.iloc[0]
        # No eligible vintage → NO_FORECAST
        assert row["status"] == "NO_FORECAST"

    def test_no_eligible_gives_no_forecast(self):
        """When all vintages are post-cutoff, status is NO_FORECAST, never 0."""
        T = "2026-01-02T00:00:00Z"
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-02T01:00:00Z", 999.0),  # way after cutoff
        ])
        result = select_forecasts(fh, wf, "15:30")
        row = result.iloc[0]
        assert row["status"] == "NO_FORECAST"
        assert row["forecast_mw"] is None

    def test_no_actual_gives_no_actual_status(self):
        """When actual is missing, status is NO_ACTUAL."""
        T = "2026-01-02T00:00:00Z"
        fh = pd.DataFrame(columns=["startTime","publishTime","actual_mw","settlementDate","settlementPeriod"])
        fh["startTime"] = pd.to_datetime(fh["startTime"], utc=True)
        fh["publishTime"] = pd.to_datetime(fh["publishTime"], utc=True)
        wf = make_windfor([{"startTime": T, "publishTime": "2026-01-01T14:00:00Z", "forecast_mw": 5000.0}])
        result = select_forecasts(fh, wf, "15:30")
        row = result.iloc[0]
        assert row["status"] == "NO_ACTUAL"
        assert row["actual_mw"] is None

    def test_invariant_holds(self):
        """chosen.publishTime <= cutoff(T) for every MATCHED row."""
        T = "2026-01-02T00:00:00Z"
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-01T10:00:00Z", 8000.0),
            ("2026-01-01T15:29:00Z", 9000.0),
        ])
        result = select_forecasts(fh, wf, "15:30")
        matched = result[result["status"] == "MATCHED"]
        for _, row in matched.iterrows():
            assert row["publish_time"] <= row["cutoff_utc"]

    def test_error_sign(self):
        """error = forecast - actual (D6 convention)."""
        T = "2026-01-02T00:00:00Z"
        fh, wf = self._minimal_frames(T, 10000.0, [
            ("2026-01-01T14:00:00Z", 12000.0),  # over-forecast
        ])
        result = select_forecasts(fh, wf, "15:30")
        row = result[result["status"] == "MATCHED"].iloc[0]
        assert row["error_mw"] == pytest.approx(2000.0)  # positive = over-forecast
