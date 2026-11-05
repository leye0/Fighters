#!/usr/bin/env python3
"""Make every generated Orc dialogue line markedly deeper without slowing it.

This intentionally excludes the original death grunts and work impacts.
The manifest marker makes a repeated CI dispatch safe (no cumulative shifts).
All conversions are prepared and checked before the installed files change.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import tempfile


PITCH_FACTOR = 0.72  # About -5.7 semitones; tempo stays at 1.00.
TARGET_CATEGORIES = {"creation", "interaction", "attack"}


def duration(path: Path) -> float:
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(output)


def retune(directory: Path) -> int:
    manifest_file = directory / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    previous = manifest.get("dialogue_processing")
    if previous is not None:
        if previous.get("pitch_factor") != PITCH_FACTOR:
            raise RuntimeError("A different Orc pitch processing already exists")
        print("Orc voices have already been retuned; nothing to do")
        return 0
    sounds = [s for s in manifest["sounds"]
              if s.get("category") in TARGET_CATEGORIES]
    if len(sounds) != 52:
        raise RuntimeError(f"Expected 52 spoken Orc clips, got {len(sounds)}")
    if len({s["path"] for s in sounds}) != 52:
        raise RuntimeError("Duplicate audio paths")

    rubberband = subprocess.run(["ffmpeg", "-hide_banner", "-h", "filter=rubberband"],
                                capture_output=True).returncode == 0
    if rubberband:
        method = "ffmpeg-rubberband"
        filters = ("rubberband=pitch=0.72:tempo=1:transients=smooth:formant=shifted,"
                   "loudnorm=I=-19:TP=-2:LRA=7")
    else:
        # GitHub's standard FFmpeg build may lack librubberband. Correct the
        # rate-induced 28% slowdown with a tempo resampler; duration stays 1x.
        method = "ffmpeg-rate-and-atempo"
        filters = ("aresample=24000,asetrate=24000*0.72,aresample=24000,"
                   "atempo=1.3888888889,loudnorm=I=-19:TP=-2:LRA=7")
    print(f"Using {method} for fixed-speed low Orc voices", flush=True)

    with tempfile.TemporaryDirectory(prefix="retune-orc-") as temp:
        prepared = []
        for sound in sounds:
            source = directory / sound["path"]
            if not source.is_file():
                raise RuntimeError(f"Missing Orc recording: {source}")
            target = Path(temp) / sound["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            old_duration = duration(source)
            subprocess.run([
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source), "-ac", "1", "-ar", "24000",
                "-af", filters,
                "-codec:a", "libmp3lame", "-b:a", "64k", str(target),
            ], check=True)
            new_duration = duration(target)
            if (target.stat().st_size < 2000 or
                    abs(new_duration - old_duration) > max(.15, .08 * old_duration)):
                raise RuntimeError(f"Tempo or size changed unexpectedly: {sound['path']}")
            prepared.append((target, source))
        for source, destination in prepared:
            destination.write_bytes(source.read_bytes())

    manifest["dialogue_processing"] = {
        "method": method, "pitch_factor": PITCH_FACTOR,
        "tempo_factor": 1.0, "processed_clips": len(sounds),
        "categories": sorted(TARGET_CATEGORIES),
    }
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    print(f"Retuned {len(sounds)} Orc dialogues to {PITCH_FACTOR:.2f} pitch at 1x tempo")
    return len(sounds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("docs/sounds/orcs"))
    arguments = parser.parse_args()
    retune(arguments.directory)
