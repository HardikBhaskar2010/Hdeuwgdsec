"""API routes for the Wind Forecast Accuracy backend.

Enhanced using async-python-patterns:
- Offloads CPU-bound DataFrame computation to asyncio.to_thread to maintain non-blocking event loop.
- Adds Request-ID traceability and execution timing headers.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    state = request.app.state
    loaded = getattr(state, "snapshot_loaded", False)
    fetched_at = None
    if loaded and hasattr(state, "manifest"):
        fetched_at = state.manifest.get("fetched_at_utc")
    return {
        "status": "ok" if loaded else "degraded",
        "snapshot_loaded": loaded,
        "snapshot_fetched_at": fetched_at,
    }


@router.get("/api/v1/meta")
async def meta(request: Request):
    state = request.app.state
    fetched_at = "unknown"
    if hasattr(state, "manifest"):
        fetched_at = state.manifest.get("fetched_at_utc", "unknown")
    return {
        "decision_month": "2026-01",
        "decision_range": ["2026-01-01", "2026-01-31"],
        "delivery_range": ["2026-01-02", "2026-02-01"],
        "timezone": "Europe/London",
        "cutoff_presets": [
            {"value": "15:30", "label": "15:30 (GB half-hourly day-ahead auction)"},
            {"value": "09:50", "label": "09:50 (N2EX day-ahead gate closure)"},
        ],
        "unit": "MW",
        "source": {
            "datasets": ["FUELHH", "WINDFOR"],
            "fetched_at": fetched_at,
            "publisher": "Elexon BMRS",
        },
    }


@router.get("/api/v1/analysis")
async def analysis(
    request: Request,
    response: Response,
    cutoff: str = Query(default="15:30", description="HH:MM cutoff in Europe/London"),
):
    state = request.app.state

    if not getattr(state, "snapshot_loaded", False):
        raise HTTPException(status_code=503, detail={"error": {"code": "SNAPSHOT_NOT_LOADED", "message": "Snapshot data is not loaded"}})

    # Validate cutoff
    if cutoff not in settings.allowed_cutoffs:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "INVALID_CUTOFF", "message": f"cutoff must be one of {settings.allowed_cutoffs}"}},
        )

    req_id = str(uuid.uuid4())[:8]
    t0 = time.monotonic()
    logger.info(f"[{req_id}] GET /analysis cutoff={cutoff}")

    try:
        # Offload CPU work with asyncio.to_thread to keep the event loop non-blocking
        result = await asyncio.to_thread(state.get_analysis, cutoff)
    except Exception as e:
        logger.error(f"[{req_id}] Analysis failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "ANALYSIS_ERROR", "message": str(e)}})

    elapsed = time.monotonic() - t0
    logger.info(f"[{req_id}] completed in {elapsed:.4f}s")
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Compute-Time-Seconds"] = f"{elapsed:.4f}"
    return result


@router.get("/api/v1/intervals/{start_iso}")
async def interval_detail(
    start_iso: str,
    request: Request,
    response: Response,
    cutoff: str = Query(default="15:30"),
):
    state = request.app.state

    if not getattr(state, "snapshot_loaded", False):
        raise HTTPException(status_code=503, detail={"error": {"code": "SNAPSHOT_NOT_LOADED", "message": "Snapshot not loaded"}})

    if cutoff not in settings.allowed_cutoffs:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "INVALID_CUTOFF", "message": f"cutoff must be one of {settings.allowed_cutoffs}"}},
        )

    # Normalise the start ISO — replace URL-encoded colon if needed
    start_iso = start_iso.replace("%3A", ":").replace("%2B", "+")

    from app.analysis.service import get_interval_detail  # noqa: PLC0415

    # Offload interval slicing to thread
    result = await asyncio.to_thread(
        get_interval_detail,
        state.windfor_aligned,
        state.norm.fuelhh,
        start_iso,
        cutoff,
    )
    if result is None:
        raise HTTPException(status_code=422, detail={"error": {"code": "INVALID_START", "message": "Cannot parse start datetime"}})

    return result
