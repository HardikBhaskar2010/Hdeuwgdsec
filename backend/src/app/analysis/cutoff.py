"""
analysis/cutoff.py
Constructs the decision cutoff datetime in UTC for a given delivery interval.

Decision cutoff rule:
    cutoff(T) = London local date of T, minus 1 calendar day, at HH:MM local time
    → converted to UTC

This is deliberately built from the local calendar date, NOT by subtracting 24h
from a UTC timestamp, to correctly handle DST transitions.

January 2026 has no DST in Europe/London, but the implementation is correct for
all dates (tested with spring/autumn synthetic examples in the test suite).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")


def parse_cutoff_time(hhmm: str) -> tuple[int, int]:
    """Parse 'HH:MM' string into (hour, minute) integers."""
    try:
        h, m = hhmm.split(":")
        return int(h), int(m)
    except (ValueError, AttributeError) as e:
        raise ValueError(f"cutoff must be 'HH:MM', got: {hhmm!r}") from e


def cutoff_utc(delivery_start_utc: datetime, cutoff_hhmm: str) -> datetime:
    """
    Return the cutoff UTC datetime for a delivery interval.

    Parameters
    ----------
    delivery_start_utc : UTC-aware datetime of the delivery interval start
    cutoff_hhmm        : 'HH:MM' local (Europe/London) time of the cutoff

    Returns
    -------
    UTC-aware datetime of the cutoff moment
    """
    hour, minute = parse_cutoff_time(cutoff_hhmm)

    # Convert delivery start to London local time to get the local calendar date
    delivery_london = delivery_start_utc.astimezone(LONDON)
    delivery_local_date = delivery_london.date()

    # Decision date = delivery local date minus one calendar day
    decision_local_date = delivery_local_date - timedelta(days=1)

    # Build the cutoff as a London-local aware datetime
    cutoff_london = datetime(
        decision_local_date.year,
        decision_local_date.month,
        decision_local_date.day,
        hour,
        minute,
        0,
        tzinfo=LONDON,
    )

    return cutoff_london.astimezone(timezone.utc)
