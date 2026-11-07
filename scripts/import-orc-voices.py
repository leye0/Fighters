#!/usr/bin/env python3
"""Download and classify the 51 Voices - Orcs Freesound MP3 previews.

python3 scripts/import-orc-voices.py download --output /tmp/orc-previews
python3 scripts/import-orc-voices.py classify --input /tmp/orc-previews --output app/sounds/orcs
"""
from __future__ import annotations
import argparse
from array import array
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import Request, urlopen

PACK_URL = "https://freesound.org/people/LittleRobotSoundFactory/packs/17722/"
AUTHOR = "LittleRobotSoundFactory"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
# Freesound IDs are ordered by their original file names Orc_00 through Orc_50.
# All URLs below were observed in Freesound pack 17722 on 2026-11-04.
SOUND_IDS = (
    316316, 316315, 316314, 316313, 316320, 316319, 316318, 316317,
    316322, 316321, 316347, 316346, 316345, 316344, 316351, 316350,
    316349, 316348, 316353, 316352, 316334, 316335, 316332, 316333,
    316338, 316339, 316336, 316337, 316326, 316327, 316357, 316356,
    316359, 316358, 316361, 316360, 316363, 316362, 316355, 316354,
    316324, 316325, 316323, 316341, 316328, 316329, 316330, 316331,
    316342, 316343, 316340,
)
assert len(SOUND_IDS) == 51 and len(set(SOUND_IDS)) == 51

def files():
    for i, sound_id in enumerate(SOUND_IDS):
        yield f"Orc_{i:02d}.mp3", sound_id

def url(sound_id):
    return f"https://cdn.freesound.org/previews/316/{sound_id}_5123851-lq.mp3"

def validate(path):
    data = path.read_bytes()
    if len(data) < 1500 or not (data.startswith(b"ID3") or (data[0] == 255 and data[1] & 224 == 224)):
        raise ValueError(f"Invalid MP3: {path}")
    return len(data)

def one_download(item, dest):
    name, sound_id = item
    target = dest / name
    if target.exists():
        try:
            return name, validate(target)
        except ValueError:
            target.unlink()
    for attempt in range(4):
        try:
            req = Request(url(sound_id), headers={
                "User-Agent": "Mozilla/5.0 (compatible; Fighters-Orc-Importer/1.0)",
                "Accept": "audio/mpeg,*/*",
            })
            with urlopen(req, timeout=35) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status} for {url(sound_id)}")
                payload = response.read()
            temp = target.with_suffix(".part")
            temp.write_bytes(payload)
            size = validate(temp)
            temp.replace(target)
            return name, size
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")

def download(dest):
    dest.mkdir(parents=True, exist_ok=True)
    total = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(one_download, item, dest) for item in files()]
        for future in as_completed(futures):
            name, size = future.result()
            total += size
            print(f"Downloaded {name}: {size} bytes", flush=True)
    print(f"Verified {len(SOUND_IDS)} MP3 previews ({total} bytes)", flush=True)

def percentile(values, fraction):
    values = sorted(values)
    at = (len(values) - 1) * fraction
    lo, hi = math.floor(at), math.ceil(at)
    return values[lo] * (hi - at) + values[hi] * (at - lo) if lo != hi else values[lo]

def features(path):
    process = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
        capture_output=True, check=True,
    )
    samples = array("h")
    samples.frombytes(process.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise ValueError(f"No audio decoded: {path}")
    rms_blocks = []
    for i in range(0, len(samples), 320):
        block = samples[i:i + 320]
        rms_blocks.append(math.sqrt(sum(x * x for x in block) / len(block)) / 32768.0)
    # Silence is removed from loudness analysis, but retained in the duration.
    cutoff = max(0.006, max(rms_blocks) * 0.12)
    active = [x for x in rms_blocks if x >= cutoff] or [max(rms_blocks)]
    rms = math.sqrt(sum(x * x for x in active) / len(active))
    peak = max(abs(x) for x in samples) / 32768.0
    clipped = sum(abs(x) >= 32000 for x in samples) / len(samples)
    return {
        "duration_seconds": round(len(samples) / 16000.0, 3),
        "active_rms_dbfs": round(20 * math.log10(max(rms, 1e-10)), 2),
        "peak_dbfs": round(20 * math.log10(max(peak, 1e-10)), 2),
        "crest_db": round(20 * math.log10(max(peak / max(rms, 1e-10), 1)), 2),
        "near_clip_percent": round(clipped * 100, 3),
    }

def classify(src, dest):
    if not src.is_dir():
        raise SystemExit(f"Missing raw previews at {src}; run download first")
    entries = []
    for name, sound_id in files():
        validate(src / name)
        data = features(src / name)
        # Higher RMS, less dynamic headroom, and clipping raise the loud score.
        score = data["active_rms_dbfs"] - 0.8 * data["crest_db"] + min(8.0, data["near_clip_percent"] * 2.0)
        entries.append({
            "name": name, "freesound_id": sound_id,
            "preview_url": url(sound_id),
            "source_url": f"https://freesound.org/s/{sound_id}/",
            **data, "loud_score": round(score, 2),
        })
    score_cutoff = percentile([e["loud_score"] for e in entries], 0.78)
    crest_cutoff = percentile([e["crest_db"] for e in entries], 0.70)
    counts = {"loud": 0, "long": 0, "short": 0}
    for folder in counts:
        (dest / folder).mkdir(parents=True, exist_ok=True)
    for entry in entries:
        is_loud = entry["loud_score"] >= score_cutoff and (
            entry["crest_db"] <= crest_cutoff or entry["near_clip_percent"] >= 0.2
        )
        category = "loud" if is_loud else ("long" if entry["duration_seconds"] >= 1.85 else "short")
        entry["category"] = category
        entry["path"] = f"{category}/{entry['name']}"
        counts[category] += 1
        (dest / category / entry["name"]).write_bytes((src / entry["name"]).read_bytes())
        print(f"{entry['name']} -> {category} | {entry['duration_seconds']}s | "
              f"RMS={entry['active_rms_dbfs']} dBFS | crest={entry['crest_db']} dB", flush=True)
    expected = {e["path"] for e in entries}
    for folder in counts:
        for path in (dest / folder).glob("Orc_??.mp3"):
            if path.relative_to(dest).as_posix() not in expected:
                path.unlink()

    (dest / "manifest.json").write_text(json.dumps({
        "author": AUTHOR, "pack_url": PACK_URL, "license": "CC BY 4.0",
        "license_url": LICENSE_URL, "format": "MP3 low-quality preview",
        "criteria": {
            "loud": "Top 22% loudness/low-crest score with low crest or clipping",
            "long": "Not loud; duration >= 1.85 seconds",
            "short": "Remaining sounds",
            "loud_score_cutoff": round(score_cutoff, 2),
            "crest_cutoff_db": round(crest_cutoff, 2),
        },
        "counts": counts, "sounds": entries,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (dest / "ATTRIBUTION.md").write_text(
        "# Orc voice attribution\n\n"
        "These 51 MP3 previews are by **LittleRobotSoundFactory** "
        f"from the Freesound pack [Voices - Orcs]({PACK_URL}).\n\n"
        f"License: [Creative Commons Attribution 4.0]({LICENSE_URL}). "
        "The MP3 previews are unmodified and sorted into folders. "
        "Each original sound ID and URL appears in manifest.json.\n\n"
        "Classification is an automatic first pass; audition each group "
        "before hooking the audio to game events.\n",
        encoding="utf-8",
    )
    print(f"Classification complete: {counts}", flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("download", "classify"))
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "download":
        download(args.output)
    else:
        if not args.input:
            parser.error("classify requires --input")
        classify(args.input, args.output)

if __name__ == "__main__":
    main()
