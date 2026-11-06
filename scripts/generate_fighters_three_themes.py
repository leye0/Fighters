#!/usr/bin/env python3
"""Create three separate original RTS themes using the GitHub Replicate secret.

Two exploration themes and one battle theme share D minor, 96 BPM and 4/4.
The loop processing wraps each individual track's outro into its own intro;
it NEVER concatenates two different themes.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DESTINATION = Path("docs/music/three-themes")
RAW_DIR = DESTINATION / "originals"
MODEL = "minimax/music-2.6"
LOOP_CROSSFADE_SECONDS = 5.0  # two 4/4 measures at 96 beats/minute
COMMON = (
    "Original instrumental high-fidelity orchestral dark fantasy real-time strategy game score. "
    "D minor, exactly 96 BPM, steady 4/4 time, medieval forest of witches and orcs. "
    "Natural acoustic orchestra, dark strings, clear woodwinds, rich French horns and hand drums. "
    "A memorable four-note D-F-E-A melodic motif that develops into new phrases. "
    "Musically composed, varied motifs and harmonic movement, not a repetitive ambient loop. "
    "No singing, no vocals, no choir, no electronics, no EDM, no rock guitars, no artificial trailer impacts. "
    "Wide dynamic range with space for game dialogue and sound effects. "
)
THEMES = {
    "01-forest-whispers": (
        "A beautiful eerie but inviting melody; serious ancient magical forest atmosphere, quietly compelling and emotional. "
        "Start very soft with distant solo flute, bowed strings and harp. "
        "After the introduction establish a gently propulsive bass and plucked strings pulse, then a distinct new melodic theme. "
        "Explore contrasting woodwind and warm horn countermelodies with a strong memorable musical hook. "
        "Build to a restrained epic orchestral passage, then return to subtle mystery at the ending. "
        "Clearly differentiated sections and development every 25 to 40 seconds. "
        "Never settle into a repeating four-bar ostinato. Make a full instrumental composition for exploration."
    ),
    "02-mystic-roads": (
        "A second, clearly different beautiful exploration composition, darker and more adventurous, with witchcraft and distant orc threat. "
        "Begin mysterious and restrained with harp, bassoon and low strings, and a haunting original woodwind melody. "
        "Build an engaging, flowing 96 BPM rhythm with pizzicato strings and discreet hand percussion. "
        "Introduce a noble horn melody after the opening, then explore rich contrasting harmonies, an emotional quiet middle, "
        "and a serious cinematic epic rise near the end. "
        "A full multi-section melody-led fantasy score, not constant drums, not repetitive drones, no battle climax. "
        "End with a graceful return to the eerie opening atmosphere."
    ),
    "03-war-of-witches-and-orcs": (
        "A serious epic fantasy battle theme, intense and very melodic, sharing the same D minor key and exactly 96 BPM as both exploration pieces. "
        "Begin with a tense musical pickup of low strings and muffled war drums; rapidly establish a powerful steady marching beat. "
        "Staccato strings race against bold French horn and low brass themes, a clear heroic four-note D-F-E-A motif recurs in transformations. "
        "Include different sections: fierce first engagement, urgent brass response, a sudden quieter dramatic tactical pause, "
        "then a thunderous decisive climax with full acoustic orchestra and layered percussion. "
        "Make the melody memorable and the harmonic progression adventurous, not a wall of noise or an endlessly repeated drum pattern. "
        "Finish with an unresolved rhythmic transition suited to looping during battle."
    ),
}


def api_request(url, token, payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url, data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Fighters-Three-Themes/1.0",
        },
        method="POST" if body is not None else "GET",
    )
    try:
        with urlopen(request, timeout=60) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read(1600).decode("utf-8", "replace")
        raise RuntimeError(f"Replicate API HTTP {exc.code}: {detail}") from None


def run_prediction(slug, description, token):
    prompt = COMMON + description
    if len(prompt) > 2000:
        raise ValueError(f"{slug}: prompt too long ({len(prompt)})")
    prediction = api_request(
        f"https://api.replicate.com/v1/models/{MODEL}/predictions",
        token,
        {
            "input": {
                "prompt": prompt,
                "is_instrumental": True,
                "lyrics_optimizer": False,
                "audio_format": "mp3",
                "sample_rate": 44100,
                "bitrate": 256000,
            }
        },
    )
    prediction_id = prediction["id"]
    print(f"{slug}: started {prediction_id}", flush=True)
    deadline = time.monotonic() + 12 * 60
    last_status = None
    while prediction["status"] not in ("succeeded", "failed", "canceled"):
        if time.monotonic() >= deadline:
            raise TimeoutError(f"{slug}: prediction took longer than 12 minutes")
        if prediction["status"] != last_status:
            last_status = prediction["status"]
            print(f"{slug}: {last_status}", flush=True)
        time.sleep(8)
        prediction = api_request(
            f"https://api.replicate.com/v1/predictions/{prediction_id}", token
        )
    if prediction["status"] != "succeeded":
        raise RuntimeError(f"{slug}: {prediction['status']}: {prediction.get('error')}")
    audio_url = prediction["output"]
    if isinstance(audio_url, list):
        audio_url = audio_url[0]
    if not isinstance(audio_url, str) or not audio_url.startswith("https://"):
        raise RuntimeError(f"{slug}: unexpected output format")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    file = RAW_DIR / f"{slug}.mp3"
    with urlopen(Request(audio_url, headers={"User-Agent": "Fighters/1.0"}), timeout=180) as response:
        with file.open("wb") as target:
            shutil.copyfileobj(response, target)
    if file.stat().st_size < 100_000:
        raise RuntimeError(f"{slug}: suspiciously small output")
    print(f"{slug}: downloaded {file.stat().st_size:,} bytes", flush=True)
    return {"slug": slug, "file": str(file), "prediction_id": prediction_id, "prompt": prompt}


def duration_seconds(path):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path)
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def create_seamless_loop(source, target, seconds):
    """Wrap tail -> head with a five-second crossfade, preserving the middle."""
    source, target = Path(source), Path(target)
    length = duration_seconds(source)
    if length < seconds * 4 + 20:
        raise RuntimeError(f"{source}: too short to create a loop ({length:.2f}s)")
    start_tail = length - 2 * seconds
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="fighters-loop-") as temporary:
        fragments = {}
        for name, start, duration in [
            ("head", 0.0, 2 * seconds),
            ("tail", start_tail, 2 * seconds),
            ("middle", 2 * seconds, length - 4 * seconds),
        ]:
            fragment = Path(temporary) / f"{name}.wav"
            result = subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-nostats", "-y",
                    "-ss", f"{start:.5f}", "-t", f"{duration:.5f}",
                    "-i", str(source), "-vn", "-c:a", "pcm_s16le",
                    "-ar", "44100", "-ac", "2", str(fragment),
                ],
                capture_output=True, text=True,
            )
            if result.returncode:
                raise RuntimeError(f"Failed to trim {name}: {result.stderr[-1200:]}")
            fragments[name] = fragment
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-nostats", "-y",
                "-i", str(fragments["tail"]),
                "-i", str(fragments["head"]),
                "-i", str(fragments["middle"]),
                "-filter_complex",
                f"[0:a][1:a]acrossfade=d={seconds:.3f}:c1=tri:c2=tri[seam];"
                "[seam][2:a]concat=n=2:v=0:a=1[out]",
                "-map", "[out]", "-c:a", "libmp3lame",
                "-b:a", "192k", "-ar", "44100", "-ac", "2", str(target),
            ],
            capture_output=True, text=True,
        )
        if result.returncode:
            raise RuntimeError(f"Failed to make loop for {source}: {result.stderr[-1800:]}")
    loop_duration = duration_seconds(target)
    if abs(loop_duration - (length - seconds)) > 0.5:
        raise RuntimeError(
            f"{target}: unexpected loop duration {loop_duration:.2f}s; expected {length - seconds:.2f}s"
        )
    return length, loop_duration


def main():
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError(
            "Missing GitHub Actions secret: REPLICATE_API_TOKEN "
            "(or REPLICATE_API_KEY / REPLICATE_TOKEN)"
        )
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe are required for seamless loops")
    destination = DESTINATION
    destination.mkdir(parents=True, exist_ok=True)
    results = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(run_prediction, slug, description, token): slug
            for slug, description in THEMES.items()
        }
        for future in as_completed(futures):
            item = future.result()
            results[item["slug"]] = item

    metadata = {
        "model": MODEL,
        "requested_bpm": 96,
        "requested_key": "D minor",
        "time_signature": "4/4",
        "are_separate_tracks": True,
        "estimated_replicate_cost_usd": round(len(THEMES) * 0.15, 2),
        "tracks": [],
    }
    for slug in THEMES:
        entry = results[slug]
        source = Path(entry["file"])
        target = destination / f"{slug}-loop.mp3"
        original_duration, loop_duration = create_seamless_loop(
            source, target, LOOP_CROSSFADE_SECONDS
        )
        metadata["tracks"].append({
            "name": slug,
            "prediction_id": entry["prediction_id"],
            "original_seconds": round(original_duration, 2),
            "loop_seconds": round(loop_duration, 2),
            "loop_crossfade_seconds": LOOP_CROSSFADE_SECONDS,
            "loop_file": str(target),
            "original_file": str(source),
            "prompt": entry["prompt"],
        })
        print(
            f"{slug}: {original_duration:.2f}s original, "
            f"{loop_duration:.2f}s seamless loop",
            flush=True,
        )
    (destination / "generation.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Three independent loop-ready pieces completed.", flush=True)


if __name__ == "__main__":
    main()
