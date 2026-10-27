"""Tests for analysis/cutoff.py"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from app.analysis.cutoff import cutoff_utc

LONDON = ZoneInfo("Europe/London")


def utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


class TestCutoffUtc:
    def test_jan_2026_15h30_basic(self):
        """2 Jan 2026 00:00 UTC → decision 1 Jan 15:30 London = 15:30 UTC (no DST)"""
        delivery = utc("2026-01-02T00:00:00Z")
        result = cutoff_utc(delivery, "15:30")
        expected = utc("2026-01-01T15:30:00Z")
        assert result == expected

    def test_jan_2026_09h50_preset(self):
        """9:50 preset: 2 Jan 2026 → 1 Jan 09:50 UTC"""
        delivery = utc("2026-01-02T00:00:00Z")
        result = cutoff_utc(delivery, "09:50")
        assert result == utc("2026-01-01T09:50:00Z")

    def test_last_jan_delivery(self):
        """1 Feb 2026 00:00 → decision 31 Jan 15:30"""
        delivery = utc("2026-02-01T00:00:00Z")
        result = cutoff_utc(delivery, "15:30")
        assert result == utc("2026-01-31T15:30:00Z")

    def test_mid_day_interval_same_delivery_date(self):
        """15 Jan 12:00 UTC (12:00 London) → decision 14 Jan 15:30"""
        delivery = utc("2026-01-15T12:00:00Z")
        result = cutoff_utc(delivery, "15:30")
        assert result == utc("2026-01-14T15:30:00Z")

    def test_delivery_at_half_hour(self):
        """30-min slots work correctly"""
        delivery = utc("2026-01-10T13:30:00Z")
        result = cutoff_utc(delivery, "15:30")
        assert result == utc("2026-01-09T15:30:00Z")

    def test_invalid_cutoff_format(self):
        delivery = utc("2026-01-02T00:00:00Z")
        with pytest.raises(ValueError):
            cutoff_utc(delivery, "25:00")

    def test_bst_delivery_summer(self):
        """Synthetic BST: delivery 2026-06-15 01:00 UTC = 02:00 London.
        Decision date is 14 Jun London. Cutoff = 14 Jun 15:30 London = 14:30 UTC."""
        delivery = datetime(2026, 6, 15, 1, 0, 0, tzinfo=UTC)
        result = cutoff_utc(delivery, "15:30")
        # 14 Jun 15:30 BST = 14:30 UTC
        expected = datetime(2026, 6, 14, 14, 30, 0, tzinfo=UTC)
        assert result == expected

    def test_autumn_clock_change(self):
        """Synthetic: delivery 2026-10-26 01:00 UTC.
        London: 26 Oct 2026 at 01:00 UTC = 01:00 BST = 02:00 BST...
        Actually 26 Oct 2026 is clock-change day in UK (clocks go back at 1am UTC).
        At 01:00 UTC on 26 Oct, London is in GMT (already changed back).
        Local date = 26 Oct. Decision = 25 Oct. Cutoff = 25 Oct 15:30 GMT = 15:30 UTC."""
        delivery = datetime(2026, 10, 26, 1, 0, 0, tzinfo=UTC)
        result = cutoff_utc(delivery, "15:30")
        expected = datetime(2026, 10, 25, 15, 30, 0, tzinfo=UTC)
        assert result == expected
