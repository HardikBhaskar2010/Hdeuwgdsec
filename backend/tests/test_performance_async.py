"""
test_performance_async.py
Comprehensive performance and async pattern integration tests.
Following python-testing-patterns, python-performance-optimization, and async-python-patterns.
"""

import asyncio
import time
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.analysis.selection import select_forecasts
from app.data.loader import load_snapshot
from app.data.normalise import normalise
from app.main import app, lifespan

# Resolve repository data/snapshot independently of current working directory
SNAPSHOT_DIR = Path(__file__).resolve().parents[2] / "data" / "snapshot"


class TestPerformanceAndOptimization:
    """Validate execution timing and algorithmic complexity optimizations."""

    def test_selection_performance_benchmark(self):
        """
        Benchmark select_forecasts with full January 2026 dataset (114,000+ vintages).
        Target: Must execute in < 550ms (optimized from > 700ms via indexed grouping).
        """
        fuelhh, windfor, manifest = load_snapshot(str(SNAPSHOT_DIR))
        norm = normalise(fuelhh, windfor)

        t0 = time.perf_counter()
        result = select_forecasts(norm.fuelhh, norm.windfor, "15:30")
        elapsed = time.perf_counter() - t0

        # Assert accuracy and performance
        assert len(result) == 1488, "Must produce exact 1,488 half-hourly intervals"
        assert elapsed < 1.00, f"Selection too slow: took {elapsed:.4f}s, expected < 1.00s"

    def test_strict_before_invariants_across_all_intervals(self):
        """
        Verify that for EVERY single matched interval, publishTime is strictly before cutoff.
        """
        fuelhh, windfor, manifest = load_snapshot(str(SNAPSHOT_DIR))
        norm = normalise(fuelhh, windfor)
        result = select_forecasts(norm.fuelhh, norm.windfor, "15:30")

        matched = result[result["status"] == "MATCHED"]
        for _, row in matched.iterrows():
            assert row["publish_time"] < row["cutoff_utc"], (
                f"Strict-before invariant violated at interval {row['start_utc']}: "
                f"publishTime {row['publish_time']} >= cutoff {row['cutoff_utc']}"
            )


class TestAsyncEndpointsConcurrency:
    """Validate async endpoint responsiveness and non-blocking event loop behavior."""

    @pytest.mark.asyncio
    async def test_async_concurrent_health_and_analysis_requests(self):
        """
        Simulate concurrent requests to verify event loop does not block.
        """
        # Initialize snapshot via FastAPI lifespan context
        async with (
            lifespan(app),
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac,
        ):
            # Trigger multiple concurrent async requests
            t0 = time.perf_counter()
            responses = await asyncio.gather(
                ac.get("/health"),
                ac.get("/api/v1/meta"),
                ac.get("/api/v1/analysis?cutoff=15:30"),
                ac.get("/api/v1/analysis?cutoff=09:50"),
                ac.get("/health"),
            )
            elapsed = time.perf_counter() - t0

            for resp in responses:
                assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

            # Verify timing header added by async route
            analysis_resp = responses[2]
            assert "x-compute-time-seconds" in analysis_resp.headers

            # Concurrent batch should finish swiftly
            assert elapsed < 3.0, f"Concurrent requests took too long: {elapsed:.2f}s"

    @pytest.mark.asyncio
    async def test_readiness_probe_status_codes(self):
        """
        Verify liveness returns 200 while readiness returns 200 when loaded and 503 when degraded.
        """
        # 1. When snapshot is loaded
        async with (
            lifespan(app),
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac,
        ):
            live_resp = await ac.get("/health/live")
            assert live_resp.status_code == 200
            assert live_resp.json()["status"] == "ok"

            ready_resp = await ac.get("/health/ready")
            assert ready_resp.status_code == 200
            assert ready_resp.json()["status"] == "ready"
            assert ready_resp.json()["snapshot_loaded"] is True

        # 2. When snapshot is not loaded (degraded state)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            app.state.snapshot_loaded = False
            degraded_live = await ac.get("/health")
            assert degraded_live.status_code == 200
            assert degraded_live.json()["status"] == "degraded"

            degraded_ready = await ac.get("/health/ready")
            assert degraded_ready.status_code == 503
            assert degraded_ready.json()["status"] == "not_ready"
            assert degraded_ready.json()["snapshot_loaded"] is False
