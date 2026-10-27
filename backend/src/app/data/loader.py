"""
data/loader.py
Reads the committed snapshot JSON files into raw DataFrames.
No network access. No transformations beyond parsing JSON.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def _load_json(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_snapshot(snapshot_dir: str) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """
    Load the raw snapshot files.

    Returns
    -------
    fuelhh_df : pd.DataFrame  — raw FUELHH rows
    windfor_df : pd.DataFrame — raw WINDFOR rows
    manifest   : dict
    """
    d = Path(snapshot_dir)
    fuelhh_path = d / "fuelhh_wind.json"
    windfor_path = d / "windfor.json"
    manifest_path = d / "manifest.json"

    if not fuelhh_path.exists():
        raise FileNotFoundError(f"Snapshot missing: {fuelhh_path}")
    if not windfor_path.exists():
        raise FileNotFoundError(f"Snapshot missing: {windfor_path}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"Snapshot missing: {manifest_path}")

    fuelhh_df = pd.DataFrame(_load_json(fuelhh_path))
    windfor_df = pd.DataFrame(_load_json(windfor_path))
    manifest = _load_json(manifest_path)

    return fuelhh_df, windfor_df, manifest
