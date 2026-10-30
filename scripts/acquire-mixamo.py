#!/usr/bin/env python3
"""Acquire real indexed Mixamo motion FBXs for private research, never for public raw redistribution.

Source: https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters
Origin: Adobe Mixamo; third-party mirror does not grant CC0 or standalone redistribution.
The manifest is a discovery candidate catalog. No candidate is a playable move yet.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "assets" / "mixamo-available-clips.json"
BASE = "https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/resolve/main/animation_motion_ybot/"
MAX_BYTES = 64 * 1024 * 1024
MIN_BYTES = 4096
FBX_MAGIC = b"Kaydara FBX Binary"


def selected_clips(catalog: dict, families: list[str], names: list[str], limit: int | None) -> list[dict]:
    clips = catalog["clips"]
    indexed = {clip["filename"] for clip in clips}
    if not indexed or len(indexed) != len(clips):
        raise ValueError("Empty source catalog or repeated FBX filenames")
    if set(names) - indexed:
        raise ValueError("Unknown clip(s): " + ", ".join(sorted(set(names) - indexed)))
    return [
        clip for clip in clips
        if (not families or clip["family"] in families)
        and (not names or clip["filename"] in names)
    ][:limit]


def safe_destination(folder: str) -> Path:
    path = Path(folder).expanduser().resolve()
    if path == ROOT or path.is_relative_to(ROOT):
        raise ValueError("Refusing raw Mixamo files inside the public Fighters git repository")
    if path == Path("/"):
        raise ValueError("Choose a specific private research folder, not /")
    return path


def validate_payload(payload: bytes, clip: dict) -> str:
    name = clip["filename"]
    if not MIN_BYTES <= len(payload) <= MAX_BYTES or not payload.startswith(FBX_MAGIC):
        raise ValueError(f"{name}: file is not a valid binary FBX, or unexpected size")
    digest = hashlib.sha256(payload).hexdigest()
    expected = clip.get("sha256")
    if expected and digest != expected:
        raise ValueError(f"{name}: SHA-256 mismatch (do not overwrite a suspect file)")
    return digest


def download_one(clip: dict, destination: Path, retries: int) -> dict:
    name = clip["filename"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.fbx", name) or ".." in name:
        raise ValueError(f"Unsafe indexed filename: {name!r}")
    out = destination / name
    url = BASE + quote(name, safe="")
    if out.is_file():
        payload = out.read_bytes()
        digest = validate_payload(payload, clip)
        return dict(filename=name, bytes=len(payload), sha256=digest, sourceUrl=url, privatePath=str(out), reused=True)

    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": "Fighters-Mixamo-Asset-Research/2.0"})
            with urlopen(request, timeout=90) as response:
                payload = response.read(MAX_BYTES + 1)
            digest = validate_payload(payload, clip)
            temporary = out.with_name(out.name + ".part")
            with temporary.open("wb") as handle:
                handle.write(payload)
            os.replace(temporary, out)
            return dict(filename=name, bytes=len(payload), sha256=digest, sourceUrl=url, privatePath=str(out), reused=False)
        except (OSError, ValueError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"{name}: failed after {retries + 1} attempts: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", help="Private FBX folder outside Fighters repo")
    parser.add_argument("--family", action="append", default=[], help="Select a movement family (repeatable)")
    parser.add_argument("--name", action="append", default=[], help="Select an exact FBX filename (repeatable)")
    parser.add_argument("--limit", type=int, help="Maximum selected clips")
    parser.add_argument("--list", action="store_true", help="Print full clip metadata without downloading")
    parser.add_argument("--summary", action="store_true", help="Print count and breakdown without downloading")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent network downloads (1..20)")
    parser.add_argument("--retries", type=int, default=3, help="Network retries per clip (0..5)")
    options = parser.parse_args()
    if options.limit is not None and options.limit < 1:
        parser.error("--limit must be positive")
    if not 1 <= options.workers <= 20 or not 0 <= options.retries <= 5:
        parser.error("--workers must be 1..20 and --retries 0..5")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if catalog.get("schemaVersion") != 1 or catalog["source"]["license"] != "adobe-mixamo-terms":
        raise ValueError("Unsupported or unlicensed provenance catalog")
    families = {clip["family"] for clip in catalog["clips"]}
    if set(options.family) - families:
        parser.error("Unknown family: " + ", ".join(sorted(set(options.family) - families)))
    chosen = selected_clips(catalog, options.family, options.name, options.limit)
    summary = {"total": len(chosen), "families": dict(sorted(Counter(c["family"] for c in chosen).items()))}
    if options.summary:
        print(json.dumps(summary, indent=2))
        return
    if options.list:
        print(json.dumps({**summary, "clips": chosen}, indent=2))
        return
    if not options.destination:
        parser.error("--destination is required for downloads")
    destination = safe_destination(options.destination)
    destination.mkdir(parents=True, exist_ok=True)
    print("Adobe Mixamo terms apply. Research FBX only; do not publish standalone assets.", file=sys.stderr)
    print(f"Downloading or verifying {len(chosen)} real indexed files with {options.workers} workers.", file=sys.stderr)
    success, failures = [], []
    with ThreadPoolExecutor(max_workers=options.workers) as executor:
        futures = {executor.submit(download_one, clip, destination, options.retries): clip for clip in chosen}
        for completed, future in enumerate(as_completed(futures), start=1):
            clip = futures[future]
            try:
                success.append(future.result())
            except Exception as exc:
                failures.append({"filename": clip["filename"], "error": str(exc)})
                print("FAILED " + str(exc), file=sys.stderr)
            if completed % 25 == 0 or completed == len(chosen):
                print(f"Progress: {completed}/{len(chosen)}, ok={len(success)}, failed={len(failures)}", file=sys.stderr)
    report = {
        **summary, "downloadedOrReused": len(success), "failed": len(failures),
        "bytes": sum(f["bytes"] for f in success),
        "files": sorted(success, key=lambda f: f["filename"]),
        "errors": sorted(failures, key=lambda f: f["filename"]),
        "license": "adobe-mixamo-terms",
        "gameplayStatus": "not_retargeted_or_approved",
    }
    (destination / "acquisition-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in {"files"}}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
