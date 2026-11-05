#!/usr/bin/env python3
"""Lower Orc dialogue pitch without altering its speaking speed.

This intentionally excludes the original death grunts and work impacts.
Retunes from the untouched pre-processing recordings, never the prior retune,
so adjusting the target later cannot accumulate audio damage or pitch shifts.
The manifest marker makes repeated CI dispatches safe.
All conversions are prepared and checked before the installed files change.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import tempfile


PITCH_FACTOR = 0.75  # 25% below the original pitch; tempo stays at 1.00.
# Last revision before the original Orc speech was deepened to 0.72.
UNPROCESSED_SOURCE_REVISION = "9b8239db721835042a5a217006256dfb4d4cb675"
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
        if previous.get("pitch_factor") == PITCH_FACTOR:
            print("Orc voices have already been retuned; nothing to do")
            return 0
        if previous.get("pitch_factor") != 0.72:
            raise RuntimeError("Unexpected existing Orc pitch processing; inspect before retuning")
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
        filters = (f"rubberband=pitch={PITCH_FACTOR}:tempo=1:transients=smooth:formant=shifted,"
                   "loudnorm=I=-19:TP=-2:LRA=7")
    else:
        # GitHub's standard FFmpeg build may lack librubberband. Correct the
        # rate-induced slowdown with a tempo resampler; duration stays 1x.
        method = "ffmpeg-rate-and-atempo"
        filters = (f"aresample=24000,asetrate=24000*{PITCH_FACTOR},aresample=24000,"
                   f"atempo={1 / PITCH_FACTOR:.12f},loudnorm=I=-19:TP=-2:LRA=7")
    print(f"Using {method} for fixed-speed low Orc voices", flush=True)

    with tempfile.TemporaryDirectory(prefix="retune-orc-") as temp:
        prepared = []
        for sound in sounds:
            installed = directory / sound["path"]
            if not installed.is_file():
                raise RuntimeError(f"Missing Orc recording: {installed}")
            source = installed
            if previous is not None:
                # Restore only each spoken MP3 from the recorded pristine
                # revision; do not touch newer grunts, work audio or metadata.
                source = Path(temp) / "original" / sound["path"]
                source.parent.mkdir(parents=True, exist_ok=True)
                original = subprocess.run([
                    "git", "show", f"{UNPROCESSED_SOURCE_REVISION}:docs/sounds/orcs/{sound['path']}"
                ], check=True, capture_output=True).stdout
                if len(original) < 2000:
                    raise RuntimeError(f"Original Orc recording invalid: {sound['path']}")
                source.write_bytes(original)
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
            prepared.append((target, installed))
        for source, destination in prepared:
            destination.write_bytes(source.read_bytes())

    manifest["dialogue_processing"] = {
        "method": method, "pitch_factor": PITCH_FACTOR,
        "tempo_factor": 1.0, "processed_clips": len(sounds),
        "categories": sorted(TARGET_CATEGORIES),
        "original_revision": UNPROCESSED_SOURCE_REVISION,
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
