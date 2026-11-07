#!/usr/bin/env python3
"""Generate only continuous battle-score candidates for Fighters.

The existing two exploration pieces are deliberately left untouched. Every
candidate uses D minor, 96 BPM, 4/4; no separate tracks are joined.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.request import Request, urlopen

from generate_fighters_three_themes import (
    MODEL, api_request, create_seamless_loop, duration_seconds,
)


DESTINATION = Path("app/music/battle-v2-candidates")
RAW_DIR = DESTINATION / "originals"
COMMON = (
    "Original fully instrumental fantasy RTS battle soundtrack for an eerie war of witches versus orcs. "
    "D MINOR, EXACTLY 96 BPM, 4/4; an unbroken driving pulse from the first bar until the last. "
    "The same clearly audible rhythm, constantly active harmony, and musical momentum MUST persist "
    "throughout ALL sections. Every bar has sustained orchestral music, purposeful melodic playing "
    "and a complete accompaniment, not just occasional drums. "
    "A memorable, sinister D-F-E-A leitmotif, urgent flowing counterpoint, rich chord progressions, "
    "high-quality acoustic strings, French horns, low brass, eerie bassoons and woodwinds, deep war drums. "
    "Powerful epic combat, dark magic and ancient forests, haunting yet thrilling, varied melodies and "
    "harmonic development over a coherent FULL composition. Continuous energetic score, instrumental only. "
    "NO silence, NO dramatic stops, NO breaks, NO drops, NO quiet interludes, NO stop-start structure, "
    "NO solo drum passages, NO ambient-only sections, NO slow intro, NO sparse isolated hits, "
    "NO fade-outs, NO vocals, NO choir, NO electronic dance music. "
)

CANDIDATES = {
    "battle-a-unbroken-siege": (
        "From the very first second: driving low-string eighth-note ostinato, urgent violins, "
        "constant full drum groove and dark, soaring French-horn melody. Firm bassline and chord "
        "progression every bar. Overlapping orchestral phrases keep moving in constant combat motion. "
        "Eerie flutes weave witchcraft countermelodies above pounding orc percussion. "
        "Develop distinct themes, shift harmonies and register, add and subtract layers but NEVER "
        "remove the full rhythmic and melodic foundation. Sustain intensity to the final measure."
    ),
    "battle-b-hexfire-assault": (
        "A relentless and catchy dark-fantasy battle dance in duple subdivisions of 96 BPM, "
        "with rhythmic sixteenth-note string figures, rolling hand drums, double bass movement, "
        "powerful low brass and ominous swirling woodwinds ALL the way through. "
        "Witches launch spells against charging orcs in a mysterious haunted wood. "
        "Use a fierce recurring melody and 3 distinct harmonically evolving passages, "
        "while maintaining a constant continuous full-band arrangement, percussion groove, "
        "harmonic momentum and orchestral drive, with zero gaps or breakdowns."
    ),
    "battle-c-blood-moon-clash": (
        "Grand, serious, sinister and deeply melodic nonstop orchestral combat from bar one. "
        "Steady layered battle drums carry the 96 BPM beat with rich heroic low horns, "
        "active spiccato strings, ominous bassoons and haunting witch-like clarinets. "
        "The orchestra plays interlocking melodies constantly; no empty beats and no isolated percussion. "
        "Evolve a clear original minor-key theme with dramatic modulations that return to D minor. "
        "Stronger second half through rising harmony and orchestration, never by interrupting the beat. "
        "End at full fighting energy with a musically complete final bar ready to repeat."
    ),
}


def render(slug, description, token):
    prompt = COMMON + description
    if len(prompt) > 2000:
        raise ValueError(f"{slug}: prompt exceeds 2000 characters ({len(prompt)})")
    data = api_request(
        f"https://api.replicate.com/v1/models/{MODEL}/predictions",
        token,
        {"input": {
            "prompt": prompt,
            "is_instrumental": True,
            "lyrics_optimizer": False,
            "audio_format": "mp3",
            "sample_rate": 44100,
            "bitrate": 256000,
        }},
    )
    prediction_id = data["id"]
    print(f"{slug}: prediction {prediction_id}", flush=True)
    deadline = time.monotonic() + 12 * 60
    while data["status"] not in ("succeeded", "failed", "canceled"):
        if time.monotonic() > deadline:
            raise TimeoutError(f"{slug}: prediction timed out")
        time.sleep(8)
        data = api_request(f"https://api.replicate.com/v1/predictions/{prediction_id}", token)
    if data["status"] != "succeeded":
        raise RuntimeError(f"{slug}: {data['status']}: {data.get('error')}")
    source_url = data["output"]
    if isinstance(source_url, list):
        source_url = source_url[0]
    if not isinstance(source_url, str) or not source_url.startswith("https://"):
        raise ValueError(f"{slug}: unexpected output")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{slug}.mp3"
    with urlopen(Request(source_url, headers={"User-Agent": "Fighters/2.0"}), timeout=180) as response:
        with path.open("wb") as target:
            shutil.copyfileobj(response, target)
    if path.stat().st_size < 100_000:
        raise ValueError(f"{slug}: output too small")
    return {"name": slug, "prediction_id": prediction_id, "prompt": prompt, "raw_path": str(path)}


def quiet_window_analysis(source):
    """Check for energy collapses; this cannot substitute for musical listening."""
    proc = subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(source), "-ac", "1", "-ar", "8000",
        "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
    ], capture_output=True, check=True)
    from array import array
    pcm = array("h")
    pcm.frombytes(proc.stdout)
    step = 16000  # 2 seconds
    energies = []
    for start in range(0, len(pcm) - step + 1, step):
        segment = pcm[start:start + step]
        root_mean_square = math.sqrt(sum(float(s) * s for s in segment) / len(segment))
        energies.append(20 * math.log10(max(1, root_mean_square) / 32768))
    if not energies:
        raise ValueError("audio too short for continuity assessment")
    interior = energies[5:-5] or energies
    ordered = sorted(interior)
    median = ordered[len(ordered) // 2]
    gaps = [index for index, dB in enumerate(interior) if dB < median - 12]
    drops = [index for index, dB in enumerate(interior) if dB < median - 9]
    return {
        "median_loudness_dbfs_2sec": round(median, 2),
        "worst_2sec_dbfs": round(min(interior), 2),
        "windows_12db_below_median": len(gaps),
        "windows_9db_below_median": len(drops),
        "total_interior_windows": len(interior),
        "interior_fraction_9db_below_median": round(len(drops) / len(interior), 3),
    }


def main():
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError("Missing REPLICATE_API_TOKEN (or alternate GitHub Replicate secret)")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe required")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    finished = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(render, slug, prompt, token): slug
            for slug, prompt in CANDIDATES.items()
        }
        for future in as_completed(futures):
            item = future.result()
            finished[item["name"]] = item
    result = {
        "model": MODEL,
        "requested_key": "D minor",
        "requested_bpm": 96,
        "requested_meter": "4/4",
        "estimated_cost_usd": round(len(CANDIDATES) * 0.15, 2),
        "note": "New battle candidates only. Earlier two exploration themes are unchanged.",
        "tracks": [],
    }
    for slug in CANDIDATES:
        track = finished[slug]
        raw = Path(track["raw_path"])
        loop_file = DESTINATION / f"{slug}-loop.mp3"
        original_length, loop_length = create_seamless_loop(raw, loop_file, 5.0)
        track.update({
            "loop_path": str(loop_file),
            "original_seconds": round(original_length, 2),
            "loop_seconds": round(loop_length, 2),
            "continuity_analysis": quiet_window_analysis(loop_file),
        })
        result["tracks"].append(track)
        print(f"{slug} {loop_length:.1f}s: {track['continuity_analysis']}", flush=True)
    (DESTINATION / "generation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Completed three full-action battle candidates; exploration themes untouched.", flush=True)


if __name__ == "__main__":
    main()
