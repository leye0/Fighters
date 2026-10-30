#!/usr/bin/env python3
"""Convert privately acquired Mixamo FBX animation clips into *research-only* GLBs.

The converter is the pinned FBX2glTF tool used by WarConquer. Output must remain
outside the public Fighters repository until licensing and distribution are reviewed.
GLB conversion verifies animation tracks, not artistic quality or playable attacks.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "assets" / "mixamo-available-clips.json"
DEFAULT_CONVERTER = ROOT / "node_modules" / "fbx2gltf" / "bin" / "Linux" / "FBX2glTF"
MAGIC_FBX = b"Kaydara FBX Binary"


def private_dir(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if path == Path("/") or path == ROOT or path.is_relative_to(ROOT):
        raise ValueError("Mixamo FBX/standalone GLB must stay outside public Fighters repo")
    return path


def inspect_glb_bytes(payload: bytes) -> dict:
    """Check GLB v2 framing, JSON chunk and at least one real animation channel."""
    if len(payload) < 32 or payload[:4] != b"glTF":
        raise ValueError("Invalid GLB header")
    version, full_length = struct.unpack_from("<II", payload, 4)
    if version != 2 or full_length != len(payload):
        raise ValueError("Invalid GLB version/length")
    chunk_length, chunk_kind = struct.unpack_from("<II", payload, 12)
    if chunk_kind != 0x4E4F534A or chunk_length <= 0 or 20 + chunk_length > len(payload):
        raise ValueError("Invalid glTF JSON chunk")
    document = json.loads(payload[20:20 + chunk_length])
    animations = document.get("animations", [])
    channels = sum(len(animation.get("channels", [])) for animation in animations)
    if not animations or channels == 0 or not document.get("nodes"):
        raise ValueError("GLB has no skeletal animation tracks")
    return {
        "animations": len(animations),
        "channels": channels,
        "nodes": len(document.get("nodes", [])),
        "skins": len(document.get("skins", [])),
        "animationNames": [a.get("name", "") for a in animations],
    }


def convert_one(clip: dict, input_dir: Path, output_dir: Path, converter: Path) -> dict:
    name = clip["filename"]
    original = input_dir / name
    destination = output_dir / (Path(name).stem + ".glb")
    if not original.is_file():
        raise FileNotFoundError(original)
    payload = original.read_bytes()
    if not payload.startswith(MAGIC_FBX) or len(payload) < 4096:
        raise ValueError(f"{name}: not a real binary FBX")
    input_sha256 = hashlib.sha256(payload).hexdigest()
    if clip.get("sha256") and clip["sha256"] != input_sha256:
        raise ValueError(f"{name}: source hash mismatch")
    reused = destination.is_file()
    if not reused:
        output_stem = output_dir / (Path(name).stem + "_working_mx")
        command = [
            str(converter), "--binary", "--anim-framerate", "bake30",
            "--input", str(original), "--output", str(output_stem),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise RuntimeError(f"{name}: FBX2glTF failed: {result.stderr[-1000:]}")
        working = output_stem.with_suffix(".glb")
        if not working.is_file():
            raise RuntimeError(f"{name}: converter did not produce GLB")
        working.rename(destination)
    glb = destination.read_bytes()
    details = inspect_glb_bytes(glb)
    return {
        "filename": name, "sourceMotionId": clip["motionId"],
        "sourceFbxSha256": input_sha256,
        "researchGlbSha256": hashlib.sha256(glb).hexdigest(),
        "glbBytes": len(glb), "glbPath": str(destination),
        "reused": reused, **details,
        "approvedForGameplay": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Private FBX source folder")
    parser.add_argument("--output", required=True, help="Private converted GLB folder")
    parser.add_argument("--converter", default=str(DEFAULT_CONVERTER), help="Absolute FBX2glTF executable")
    parser.add_argument("--family", action="append", default=[], help="Select a family, repeatable")
    parser.add_argument("--name", action="append", default=[], help="Select an indexed file name, repeatable")
    parser.add_argument("--limit", type=int, help="Limit selected clips")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent conversion workers (1..8)")
    parser.add_argument("--require-all", action="store_true", help="Fail if any selected FBX source is absent")
    parser.add_argument("--summary", action="store_true", help="Count available source FBXs; no conversion")
    opts = parser.parse_args()
    if not 1 <= opts.workers <= 8 or (opts.limit is not None and opts.limit < 1):
        parser.error("Invalid worker count or limit")
    input_dir, output_dir = private_dir(opts.input), private_dir(opts.output)
    if input_dir == output_dir:
        parser.error("Use separate private input and output directories")
    converter = Path(opts.converter).expanduser().resolve()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if catalog.get("schemaVersion") != 1 or catalog["source"]["license"] != "adobe-mixamo-terms":
        raise ValueError("Unexpected source catalog")
    families = {clip["family"] for clip in catalog["clips"]}
    if set(opts.family) - families:
        parser.error("Unknown family")
    names = {clip["filename"] for clip in catalog["clips"]}
    if set(opts.name) - names:
        parser.error("Unknown indexed file name")
    selected = [
        clip for clip in catalog["clips"]
        if (not opts.family or clip["family"] in opts.family)
        and (not opts.name or clip["filename"] in opts.name)
    ]
    if opts.limit:
        selected = selected[:opts.limit]
    available = [clip for clip in selected if (input_dir / clip["filename"]).is_file()]
    missing = [clip["filename"] for clip in selected if not (input_dir / clip["filename"]).is_file()]
    print(f"Selected {len(selected)}; available FBX {len(available)}; missing {len(missing)}.", file=sys.stderr)
    if opts.summary:
        print(json.dumps({
            "selected": len(selected), "available": len(available),
            "missing": len(missing),
            "families": dict(Counter(c["family"] for c in available)),
        }, indent=2))
        return
    if opts.require_all and missing:
        raise FileNotFoundError(f"{len(missing)} indexed FBX are missing; run acquire-mixamo.py first")
    if not converter.is_file():
        raise FileNotFoundError(f"Install fbx2gltf@0.9.7-p1 or pass --converter: {converter}")
    output_dir.mkdir(parents=True, exist_ok=True)
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=opts.workers) as executor:
        futures = {
            executor.submit(convert_one, clip, input_dir, output_dir, converter): clip
            for clip in available
        }
        for done, future in enumerate(as_completed(futures), 1):
            clip = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                errors.append({"filename": clip["filename"], "error": str(exc)})
                print(f"FAILED {clip['filename']}: {exc}", file=sys.stderr)
            if done % 20 == 0 or done == len(available):
                print(f"Converted/checked {done}/{len(available)}, failed={len(errors)}", file=sys.stderr)
    report = {
        "sourceLicense": "adobe-mixamo-terms",
        "gameplayIntegration": "none; research-only converted motions",
        "totalInCatalog": len(selected),
        "missingSourceFiles": missing,
        "convertedOrReused": len(results),
        "errors": errors,
        "clips": sorted(results, key=lambda row: row["filename"]),
    }
    (output_dir / "conversion-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "convertedOrReused": len(results), "failed": len(errors),
        "missing": len(missing),
        "totalGlbBytes": sum(row["glbBytes"] for row in results),
    }, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
