#!/usr/bin/env python3
"""Download *indexed, real* Mixamo FBX clips into a private research directory.

Provenance: Linzhan/Mixamo-Animations-Characters mirror (as used by WarConquer).
These are subject to Adobe Mixamo terms, NOT CC0. This tool never copies raw FBX
to the public Fighters repository and never treats downloaded clips as approved
in-game combat. Final model rig/visual playback and license review are separate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "assets" / "mixamo-available-clips.json"
BASE = (
    "https://huggingface.co/datasets/"
    "Linzhan/Mixamo-Animations-Characters/resolve/main/"
    "animation_motion_ybot/"
)
MAX_BYTES = 25 * 1024 * 1024
MIN_BYTES = 4096


def selected_clips(catalog: dict, families: list[str], names: list[str], limit: int | None) -> list[dict]:
    available = catalog["clips"]
    if not available or len({clip["filename"] for clip in available}) != len(available):
        raise ValueError("Clip catalog is empty or has duplicate filenames")
    wanted = set(names)
    if wanted - {clip["filename"] for clip in available}:
        raise ValueError("Unknown clip name(s): " + ", ".join(sorted(wanted)))
    result = [
        clip for clip in available
        if (not families or clip["family"] in families)
        and (not names or clip["filename"] in wanted)
    ]
    return result[:limit] if limit is not None else result


def safe_destination(folder: str) -> Path:
    path = Path(folder).expanduser().resolve()
    if path == ROOT or path.is_relative_to(ROOT):
        raise ValueError("Refusing to store raw third-party Mixamo FBX inside public Fighters repository")
    if path == Path("/"):
        raise ValueError("Choose a specific private asset directory, not filesystem root")
    return path


def download_one(clip: dict, destination: Path) -> dict:
    name = clip["filename"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.fbx", name) or ".." in name:
        raise ValueError("Unsafe source filename: " + repr(name))
    url = BASE + quote(name, safe="")
    out = destination / name
    if out.is_file():
        payload = out.read_bytes()
    else:
        request = Request(url, headers={"User-Agent": "Fighters-Mixamo-Asset-Research/1.0"})
        with urlopen(request, timeout=90) as response:
            payload = response.read(MAX_BYTES + 1)
        if not MIN_BYTES <= len(payload) <= MAX_BYTES:
            raise ValueError("Unexpected FBX size: " + name)
        if not payload.startswith(b"Kaydara FBX Binary"):
            raise ValueError("Downloaded file is not a binary FBX: " + name)
        destination.mkdir(parents=True, exist_ok=True)
        out.write_bytes(payload)
    if not MIN_BYTES <= len(payload) <= MAX_BYTES or not payload.startswith(b"Kaydara FBX Binary"):
        raise ValueError("Invalid existing/downloaded FBX: " + name)
    digest = hashlib.sha256(payload).hexdigest()
    expected = clip.get("sha256")
    if expected and digest != expected:
        raise ValueError("SHA-256 mismatch: " + name)
    return {
        "filename": name,
        "bytes": len(payload),
        "sha256": digest,
        "sourceUrl": url,
        "privatePath": str(out),
        "animationStatus": "downloaded_not_integrated",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", help="Private folder for source FBX; outside this repo")
    parser.add_argument("--family", action="append", default=[], help="Only this family; repeatable")
    parser.add_argument("--name", action="append", default=[], help="Exact .fbx filename; repeatable")
    parser.add_argument("--limit", type=int, help="Maximum clips in catalog order")
    parser.add_argument("--list", action="store_true", help="Print selection without downloading")
    options = parser.parse_args()
    if options.limit is not None and options.limit < 1:
        parser.error("--limit must be positive")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if catalog.get("schemaVersion") != 1 or catalog["source"]["license"] != "adobe-mixamo-terms":
        raise ValueError("Unsupported provenance catalog")
    families = {clip["family"] for clip in catalog["clips"]}
    if set(options.family) - families:
        parser.error("Unknown family: " + ", ".join(sorted(set(options.family) - families)))
    chosen = selected_clips(catalog, options.family, options.name, options.limit)
    if options.list:
        print(json.dumps({"count": len(chosen), "clips": chosen}, indent=2))
        return
    if not options.destination:
        parser.error("--destination is required for downloads")
    destination = safe_destination(options.destination)
    print("Adobe Mixamo terms apply; download for research, not raw public redistribution.", file=sys.stderr)
    results = []
    for i, clip in enumerate(chosen, 1):
        result = download_one(clip, destination)
        results.append(result)
        print(f"[{i}/{len(chosen)}] {result['filename']} {result['bytes']} bytes", file=sys.stderr)
    print(json.dumps({"count": len(results), "files": results}, indent=2))


if __name__ == "__main__":
    main()
