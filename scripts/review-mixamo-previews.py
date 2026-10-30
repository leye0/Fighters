#!/usr/bin/env python3
"""Acquire source-hosted MP4 previews privately for human screening of Fighters' shortlist.

This is research only. Videos remain outside the public repository and no verdict
is inferred from their names or technical validity.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "assets" / "mixamo-shortlist.json"
AVAILABLE = ROOT / "assets" / "mixamo-available-clips.json"
BASE = "https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/resolve/main/animation_motion_render"


def safe_destination(raw: str) -> Path:
    destination = Path(raw).expanduser().resolve()
    if destination == Path("/") or destination == ROOT or destination.is_relative_to(ROOT):
        raise ValueError("Keep source previews in a private directory outside the public repository")
    return destination


def download(clip: str, view: int, destination: Path) -> dict:
    stem = clip.removesuffix(".fbx")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", stem):
        raise ValueError("Unsafe animation name: " + clip)
    file = destination / stem / f"v{view:03d}.mp4"
    url = f"{BASE}/{quote(stem, safe='')}/v{view:03d}.mp4"
    if file.is_file() and file.stat().st_size > 1000:
        return {"filename": clip, "view": view, "size": file.stat().st_size, "reused": True}
    request = Request(url, headers={"User-Agent": "Fighters-Mixamo-Visual-Research/1.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=120) as response:
                payload = response.read(2 * 1024 * 1024)
            if len(payload) < 1000 or payload[4:8] != b"ftyp":
                raise ValueError("Not a valid small MP4 preview: " + url)
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(payload)
            return {"filename": clip, "view": view, "size": len(payload), "reused": False}
        except HTTPError as exc:
            if exc.code == 429:
                delay = exc.headers.get("Retry-After", "180")
                raise RuntimeError(f"Source rate limit (429); pause {delay} seconds before resuming") from exc
            if attempt == 2:
                raise
        except (OSError, ValueError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--name", action="append", help="Exact indexed FBX name; repeat for alternatives")
    parser.add_argument("--limit", type=int, default=63)
    parser.add_argument("--views", type=int, default=1, choices=[1, 4])
    parser.add_argument("--request-interval", type=float, default=1.0,
                        help="Minimum pause between remote requests, in seconds")
    options = parser.parse_args()
    if not 1 <= options.limit <= 471 or options.request_interval < 0:
        parser.error("Limit must be 1..471 and request interval nonnegative")
    destination = safe_destination(options.destination)
    if options.name:
        indexed = {clip["filename"] for clip in json.loads(AVAILABLE.read_text(encoding="utf-8"))["clips"]}
        if any(name not in indexed for name in options.name):
            parser.error("Every --name must match a filename from the available Mixamo catalog")
        clips = list(dict.fromkeys(options.name))[:options.limit]
    else:
        selection = json.loads(CATALOG.read_text(encoding="utf-8"))
        clips = [name for group in selection["groups"] for name in group["filenames"]][:options.limit]
    jobs = [(clip, view) for clip in clips for view in range(options.views)]
    results, errors = [], []
    last_request = 0.0
    for clip, view in jobs:
        try:
            file = destination / clip.removesuffix(".fbx") / f"v{view:03d}.mp4"
            if not (file.is_file() and file.stat().st_size > 1000):
                elapsed = time.monotonic() - last_request
                time.sleep(max(0.0, options.request_interval - elapsed))
                last_request = time.monotonic()
            results.append(download(clip, view, destination))
        except Exception as exc:
            errors.append({"filename": clip, "view": view, "error": str(exc)})
            if "429" in str(exc):
                print(f"Rate limit encountered after {len(results)} clips; stopping immediately", flush=True)
                break
        if (len(results) + len(errors)) % 10 == 0:
            print(f"Previews processed: {len(results) + len(errors)}/{len(jobs)}, ok={len(results)}, failed={len(errors)}", flush=True)
    report = {"requested": len(jobs), "downloadedOrReused": len(results), "errors": errors,
              "files": sorted(results, key=lambda item: (item["filename"], item["view"])),
              "visualApproval": "not_performed"}
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "preview-acquisition-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "files"}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
