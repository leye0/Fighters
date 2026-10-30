#!/usr/bin/env python3
"""Reproduce the exact 63-clip owner selection into one private YBot GLB pack.

The download is paced and resumable. No source FBX, GLB or pack is committed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / "assets" / "mixamo-selected.json"


def selected_names() -> list[str]:
    selection = json.loads(SELECTION.read_text(encoding="utf8"))
    clips = selection.get("clips", [])
    names = [clip["filename"] for clip in clips]
    if (len(names) != 63 or len(set(names)) != 63 or
            any(clip.get("choice") != "keep" for clip in clips)):
        raise ValueError("Owner selection must contain exactly 63 kept motions")
    return names


def commands(workspace: Path, names: list[str], request_interval: float) -> list[list[str]]:
    names_arg = [item for name in names for item in ("--name", name)]
    fbx = workspace / "fbx"
    glb = workspace / "glb"
    output = workspace / "Fighters-selected-63.glb"
    return [
        [sys.executable, str(ROOT / "scripts" / "acquire-mixamo.py"),
         "--destination", str(fbx), "--workers", "1",
         "--request-interval", str(request_interval), *names_arg],
        [sys.executable, str(ROOT / "scripts" / "convert-mixamo-fbx.py"),
         "--input", str(fbx), "--output", str(glb), "--require-all",
         "--workers", "4", *names_arg],
        [sys.executable, str(ROOT / "scripts" / "pack-selected-mixamo.py"),
         "--input", str(glb), "--output", str(output)],
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="Private location outside Fighters")
    parser.add_argument("--request-interval", type=float, default=5.0)
    parser.add_argument("--pack-only", action="store_true", help="Reuse 63 verified converted GLBs")
    args = parser.parse_args()
    workspace = Path(args.workspace).expanduser().resolve()
    if (workspace == Path("/") or workspace == ROOT or workspace.is_relative_to(ROOT) or
            args.request_interval < 0.5):
        parser.error("Use a private workspace outside Fighters and a request interval >= 0.5 s")
    names = selected_names()
    steps = commands(workspace, names, args.request_interval)
    if args.pack_only:
        steps = steps[-1:]
    else:
        workspace.mkdir(parents=True, exist_ok=True)
    for index, command in enumerate(steps, 1):
        print(f"Step {index}/{len(steps)}: {Path(command[1]).name}", file=sys.stderr)
        subprocess.run(command, check=True)
    print(f"Ready: {workspace / 'Fighters-selected-63.glb'}")


if __name__ == "__main__":
    main()
