"""Tests for data/normalise.py"""

import pandas as pd

from app.data.normalise import normalise


def _raw_fuelhh(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def _raw_windfor(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


FUELHH_ROW = {
    "dataset": "FUELHH",
    "publishTime": "2026-01-02T00:30:00Z",
    "startTime": "2026-01-02T00:00:00Z",
    "settlementDate": "2026-01-02",
    "settlementPeriod": 1,
    "fuelType": "WIND",
    "generation": 12000,
}

WINDFOR_ROW = {
    "dataset": "WINDFOR",
    "publishTime": "2026-01-01T15:30:00Z",
    "startTime": "2026-01-02T00:00:00Z",
    "generation": 11500,
}


class TestNormalise:
    def test_basic_pass(self):
        fh_raw = _raw_fuelhh([FUELHH_ROW])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        assert len(result.fuelhh) == 1
        assert result.fuelhh["actual_mw"].iloc[0] == 12000

    def test_non_wind_dropped(self):
        gas_row = {**FUELHH_ROW, "fuelType": "GAS"}
        fh_raw = _raw_fuelhh([FUELHH_ROW, gas_row])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        assert len(result.fuelhh) == 1
        assert "GAS" not in result.fuelhh.get("fuelType", pd.Series()).tolist()

    def test_times_parsed_utc(self):
        fh_raw = _raw_fuelhh([FUELHH_ROW])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        assert result.fuelhh["startTime"].dt.tz is not None
        assert str(result.fuelhh["startTime"].dt.tz) == "UTC"
        assert result.windfor["startTime"].dt.tz is not None

    def test_invalid_generation_counted_not_zeroed(self):
        bad_row = {**FUELHH_ROW, "generation": -1}
        fh_raw = _raw_fuelhh([FUELHH_ROW, bad_row])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        # The invalid row should be removed, not zeroed
        assert result.invalid_rows >= 1
        assert (result.fuelhh["actual_mw"] < 0).sum() == 0

    def test_duplicate_actual_keys_resolved(self):
        """Duplicate startTimes: keep row with latest publishTime."""
        row1 = {**FUELHH_ROW, "publishTime": "2026-01-02T00:30:00Z", "generation": 12000}
        row2 = {**FUELHH_ROW, "publishTime": "2026-01-02T01:00:00Z", "generation": 12500}  # later
        fh_raw = _raw_fuelhh([row1, row2])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        assert len(result.fuelhh) == 1
        assert result.fuelhh["actual_mw"].iloc[0] == 12500
        assert result.duplicate_actual_keys == 1

    def test_windfor_30min_alignment(self):
        """Each WINDFOR hourly row is duplicated to cover the +30-min slot."""
        wf_row = {**WINDFOR_ROW, "startTime": "2026-01-02T00:00:00Z"}
        fh_raw = _raw_fuelhh([FUELHH_ROW])
        wf_raw = _raw_windfor([wf_row])
        result = normalise(fh_raw, wf_raw)
        # Original :00 + duplicated :30 = 2 rows for same publishTime
        starts = set(result.windfor["startTime"].dt.strftime("%H:%M").tolist())
        assert "00:00" in starts
        assert "00:30" in starts

    def test_null_generation_is_null_not_zero(self):
        """Missing generation must be null, never 0."""
        null_row = {**FUELHH_ROW, "generation": None}
        fh_raw = _raw_fuelhh([null_row])
        wf_raw = _raw_windfor([WINDFOR_ROW])
        result = normalise(fh_raw, wf_raw)
        # null generation row is removed from clean data
        assert len(result.fuelhh) == 0
        assert result.invalid_rows == 1
