"""
main.py — FastAPI application entry point.

Lifespan: loads snapshot at startup, runs analysis for both cutoff presets,
caches results. Serves read-only JSON endpoints.
"""

from __future__ import annotations

import functools
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load snapshot at startup; release at shutdown."""
    snapshot_dir = os.path.join(os.path.dirname(__file__), "..", "..", settings.snapshot_dir)
    # Resolve relative paths
    if not os.path.isabs(snapshot_dir):
        # Try path relative to the package root
        pkg_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        snapshot_dir = os.path.join(pkg_root, settings.snapshot_dir)

    logger.info(f"Loading snapshot from: {snapshot_dir}")

    try:
        from app.data.loader import load_snapshot  # noqa: PLC0415
        from app.data.normalise import normalise  # noqa: PLC0415
        from app.analysis.service import build_analysis  # noqa: PLC0415

        fuelhh_raw, windfor_raw, manifest = load_snapshot(snapshot_dir)
        norm = normalise(fuelhh_raw, windfor_raw)

        logger.info(
            f"Snapshot loaded: FUELHH={len(norm.fuelhh)}, WINDFOR={len(norm.windfor)}, "
            f"fetched_at={manifest.get('fetched_at_utc')}"
        )

        # Pre-compute analysis for both presets and cache
        @functools.lru_cache(maxsize=8)
        def _get_analysis(cutoff_hhmm: str) -> dict:
            logger.info(f"Computing analysis for cutoff={cutoff_hhmm}")
            return build_analysis(norm, manifest, cutoff_hhmm)

        # Warm the cache
        for preset in settings.allowed_cutoffs:
            _get_analysis(preset)
            logger.info(f"Analysis cached for cutoff={preset}")

        app.state.snapshot_loaded = True
        app.state.manifest = manifest
        app.state.norm = norm
        app.state.windfor_aligned = norm.windfor  # for drilldown
        app.state.get_analysis = _get_analysis

    except FileNotFoundError as e:
        logger.error(f"Snapshot not found: {e}. Run scripts/fetch_snapshot.py first.")
        app.state.snapshot_loaded = False
        app.state.manifest = {}
        app.state.get_analysis = lambda _: {}
    except Exception as e:
        logger.error(f"Startup failed: {e}", exc_info=True)
        app.state.snapshot_loaded = False
        app.state.manifest = {}
        app.state.get_analysis = lambda _: {}

    yield  # app runs here

    logger.info("Shutting down.")


# ── App ────────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Wind Forecast Accuracy API",
        description="Decision-time wind forecast accuracy for January 2026 GB day-ahead market",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_methods=["GET"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # Compression
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Routes
    from app.api.routes import router  # noqa: PLC0415
    app.include_router(router)

    return app


app = create_app()
