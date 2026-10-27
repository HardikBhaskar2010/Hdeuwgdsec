"""
fetch_snapshot.py
Fetches January 2026 FUELHH (WIND only) and WINDFOR data from Elexon BMRS.
Writes raw snapshots + a manifest to data/snapshot/.
Run once. No external dependencies beyond the stdlib.

Usage: python scripts/fetch_snapshot.py
"""

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "snapshot")
CHUNK_DAYS = 2
MAX_RETRIES = 3
TIMEOUT = 30


def fetch_json(url: str) -> list:
    """Fetch a JSON array from the given URL with retries."""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read())
                if not isinstance(data, list):
                    raise ValueError(f"Expected list, got {type(data)}: {str(data)[:200]}")
                return data
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise  # client errors not retried
            last_exc = e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_exc = e
        wait = 2 ** attempt
        print(f"  Attempt {attempt+1} failed: {last_exc}. Retrying in {wait}s...", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts: {last_exc}")


def date_chunks(start_iso: str, end_iso: str, chunk_days: int = CHUNK_DAYS):
    """Yield (from_utc, to_utc) ISO strings in chunks."""
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    start = datetime.strptime(start_iso, fmt).replace(tzinfo=timezone.utc)
    end = datetime.strptime(end_iso, fmt).replace(tzinfo=timezone.utc)
    from datetime import timedelta

    cur = start
    while cur < end:
        chunk_end = min(cur + timedelta(days=chunk_days), end)
        yield cur.strftime(fmt), chunk_end.strftime(fmt)
        cur = chunk_end


def fetch_dataset(dataset: str, from_utc: str, to_utc: str, extra_params: dict = None) -> tuple[list, list]:
    """Fetch a full date range in chunks. Returns (all_rows, chunk_log)."""
    all_rows = []
    chunk_log = []
    for chunk_from, chunk_to in date_chunks(from_utc, to_utc):
        params = f"publishDateTimeFrom={chunk_from}&publishDateTimeTo={chunk_to}"
        if extra_params:
            params += "&" + "&".join(f"{k}={v}" for k, v in extra_params.items())
        url = f"{BASE_URL}/datasets/{dataset}/stream?{params}"
        print(f"  Fetching {dataset} [{chunk_from} -> {chunk_to}]...")
        rows = fetch_json(url)
        print(f"    -> {len(rows)} rows")
        all_rows.extend(rows)
        chunk_log.append({"from": chunk_from, "to": chunk_to, "url": url, "rows": len(rows)})
    return all_rows, chunk_log


def dedupe_fuelhh(rows: list) -> tuple[list, int]:
    """Keep one row per startTime (latest publishTime). Return (deduped, dupe_count)."""
    by_start: dict[str, dict] = {}
    for r in rows:
        key = r["startTime"]
        if key not in by_start or r["publishTime"] > by_start[key]["publishTime"]:
            by_start[key] = r
    deduped = sorted(by_start.values(), key=lambda x: x["startTime"])
    return deduped, len(rows) - len(deduped)


def dedupe_windfor(rows: list) -> tuple[list, int]:
    """Keep one row per (startTime, publishTime). Return (deduped, dupe_count)."""
    seen: set[tuple] = set()
    deduped = []
    for r in rows:
        key = (r["startTime"], r["publishTime"])
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    deduped.sort(key=lambda x: (x["startTime"], x["publishTime"]))
    return deduped, len(rows) - len(deduped)


def sha256_of_json(rows: list) -> str:
    data = json.dumps(rows, ensure_ascii=False).encode()
    return hashlib.sha256(data).hexdigest()


def write_snapshot(filename: str, rows: list) -> str:
    path = os.path.join(SNAPSHOT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    return path


def main():
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── FUELHH: actuals for Jan 2026 delivery ──────────────────────────────
    # Delivery dates: 2 Jan 2026 00:00 to 1 Feb 2026 24:00 (UTC=London in Jan)
    # publishTime for FUELHH is approximately equal to startTime + 30 min, so
    # we fetch publishDateTime window covering all delivery intervals.
    print("=== Fetching FUELHH (actuals) ===")
    fuelhh_rows, fuelhh_chunks = fetch_dataset(
        "FUELHH",
        "2026-01-02T00:00:00Z",
        "2026-02-02T01:00:00Z",
        extra_params={"fuelType": "WIND"},
    )
    print(f"FUELHH raw rows: {len(fuelhh_rows)}")

    # Filter to WIND only (server-side param is honoured, belt-and-suspenders)
    fuelhh_wind = [r for r in fuelhh_rows if r.get("fuelType") == "WIND"]
    print(f"FUELHH WIND rows: {len(fuelhh_wind)}")

    # Deduplicate
    fuelhh_deduped, fuelhh_dupes = dedupe_fuelhh(fuelhh_wind)
    print(f"FUELHH after dedupe: {len(fuelhh_deduped)} (removed {fuelhh_dupes} dupes)")

    # ── WINDFOR: forecasts published before the latest cutoff ──────────────
    # Latest cutoff is 31 Jan 15:30 London (=UTC in Jan).
    # Start a few days before to capture earliest vintages for Jan 2 delivery.
    print("\n=== Fetching WINDFOR (forecasts) ===")
    windfor_rows, windfor_chunks = fetch_dataset(
        "WINDFOR",
        "2025-12-28T00:00:00Z",
        "2026-02-01T00:00:00Z",
    )
    print(f"WINDFOR raw rows: {len(windfor_rows)}")

    windfor_deduped, windfor_dupes = dedupe_windfor(windfor_rows)
    print(f"WINDFOR after dedupe: {len(windfor_deduped)} (removed {windfor_dupes} dupes)")

    # ── Validate generation values ─────────────────────────────────────────
    def count_invalid(rows):
        return sum(
            1 for r in rows
            if not isinstance(r.get("generation"), (int, float)) or r.get("generation") < 0
        )

    fuelhh_invalid = count_invalid(fuelhh_deduped)
    windfor_invalid = count_invalid(windfor_deduped)
    print(f"\nInvalid generation rows — FUELHH: {fuelhh_invalid}, WINDFOR: {windfor_invalid}")

    # ── Write files ────────────────────────────────────────────────────────
    print("\n=== Writing snapshot files ===")
    fuelhh_sha = sha256_of_json(fuelhh_deduped)
    windfor_sha = sha256_of_json(windfor_deduped)

    write_snapshot("fuelhh_wind.json", fuelhh_deduped)
    write_snapshot("windfor.json", windfor_deduped)

    manifest = {
        "fetched_at_utc": fetched_at,
        "source": "Elexon BMRS",
        "base_url": BASE_URL,
        "datasets": {
            "FUELHH": {
                "file": "fuelhh_wind.json",
                "filter": "fuelType=WIND",
                "chunks": fuelhh_chunks,
                "raw_rows": len(fuelhh_wind),
                "deduped_rows": len(fuelhh_deduped),
                "duplicate_keys_removed": fuelhh_dupes,
                "invalid_generation": fuelhh_invalid,
                "sha256": fuelhh_sha,
            },
            "WINDFOR": {
                "file": "windfor.json",
                "chunks": windfor_chunks,
                "raw_rows": len(windfor_rows),
                "deduped_rows": len(windfor_deduped),
                "duplicate_keys_removed": windfor_dupes,
                "invalid_generation": windfor_invalid,
                "sha256": windfor_sha,
            },
        },
        "scope": {
            "decision_dates": "2026-01-01 to 2026-01-31",
            "delivery_dates": "2026-01-02 to 2026-02-01",
            "timezone": "Europe/London",
        },
    }
    write_snapshot("manifest.json", manifest)

    print("\n=== Summary ===")
    print(f"FUELHH rows written  : {len(fuelhh_deduped)}")
    print(f"WINDFOR rows written : {len(windfor_deduped)}")
    print(f"Manifest written     : data/snapshot/manifest.json")
    print(f"Fetched at           : {fetched_at}")
    print("\nDone. Snapshot is ready.")


if __name__ == "__main__":
    main()
