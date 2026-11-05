#!/usr/bin/env python3
"""Generate a five-voice audition for Fighters, without changing in-game sounds.

Run from a GitHub Actions job with REPLICATE_API_KEY configured as a secret.
This intentionally creates just one phrase per persona, one Replicate call each.
"""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


MODEL = "qwen/qwen3-tts"
ENDPOINT = "https://api.replicate.com/v1/models/qwen/qwen3-tts/predictions"
PHRASE = "At your service!"
VOICES = (
    (
        "elder",
        "Mature English-speaking woman in her fifties, rich low contralto "
        "with a slight natural grain, composed authority and unhurried, "
        "precisely articulated speech. Grounded medieval-fantasy acting; "
        "natural and understated, never seductive, breathy or theatrical.",
    ),
    (
        "warrior",
        "Adult English-speaking woman in her thirties, firm medium-low "
        "mezzo-soprano, clear direct consonants, confident and vigorous "
        "without shouting. A capable soldier, natural grounded game acting; "
        "never cartoonish, flirtatious or exaggerated.",
    ),
    (
        "young",
        "Young adult English-speaking woman, bright clear medium-high voice, "
        "quick responsive cadence and natural restrained enthusiasm. "
        "Alert, resourceful and believable, not childish, giggly, "
        "flirtatious or overexcited.",
    ),
    (
        "mystic",
        "Adult English-speaking woman, distinctive dusky lower mezzo "
        "with smooth resonance, slow thoughtful phrasing and a quiet "
        "enigmatic confidence. Fully voiced and intelligible, not "
        "whispered, breathy, seductive, spooky or melodramatic.",
    ),
    (
        "guardian",
        "Adult English-speaking woman, warm full midrange voice, lightly "
        "husky natural timbre, even pace and reassuring firmness. "
        "Practical, kind and self-possessed; no caricature, sensuality, "
        "affected accent or comedy delivery.",
    ),
)


def request_json(url: str, token: str, payload: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "wait"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers,
                                     method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=75) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        # Don't print request headers or anything derived from the API key.
        detail = exc.read(512).decode("utf-8", "replace")
        raise RuntimeError(f"Replicate HTTP {exc.code}: {detail}") from None
    if not isinstance(result, dict):
        raise RuntimeError("Unexpected Replicate prediction response")
    return result


def predict(token: str, prompt: str) -> str:
    result = request_json(ENDPOINT, token, {
        "input": {
            "mode": "voice_design",
            "language": "English",
            "text": PHRASE,
            "voice_description": prompt,
        }
    })
    deadline = time.monotonic() + 240
    while result.get("status") not in ("succeeded", "failed", "canceled"):
        if time.monotonic() > deadline:
            raise RuntimeError("Timed out waiting for Replicate prediction")
        polling_url = result.get("urls", {}).get("get")
        if not isinstance(polling_url, str) or not polling_url.startswith(
            "https://api.replicate.com/v1/predictions/"
        ):
            raise RuntimeError("Replicate did not return a safe polling URL")
        time.sleep(2)
        result = request_json(polling_url, token)
    if result["status"] != "succeeded":
        raise RuntimeError(f"Replicate prediction {result['status']}: "
                           f"{str(result.get('error') or '')[:300]}")
    output = result.get("output")
    if isinstance(output, list) and len(output) == 1:
        output = output[0]
    if not isinstance(output, str):
        raise RuntimeError("Replicate returned no single audio URL")
    return output


def download_audio(url: str, destination: Path) -> None:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (
        host == "replicate.delivery" or host.endswith(".replicate.delivery")
        or host == "stream.replicate.com"
    ):
        raise RuntimeError(f"Unexpected Replicate audio host: {host}")
    request = urllib.request.Request(url, headers={"User-Agent": "Fighters-voice-audition"})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(20_000_001)
    if not 3_000 < len(data) <= 20_000_000:
        raise RuntimeError("Generated audio is empty or suspiciously large")
    destination.write_bytes(data)


def convert_audio(source: Path, destination: Path) -> float:
    subprocess.run([
        "ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(source), "-ac", "1", "-ar", "24000", "-af",
        "loudnorm=I=-19:TP=-3:LRA=7", "-codec:a", "libmp3lame",
        "-b:a", "64k", str(destination),
    ], check=True)
    duration = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(destination),
    ], text=True)
    seconds = float(duration)
    if not .5 < seconds < 9 or destination.stat().st_size < 3000:
        raise RuntimeError(f"Invalid audition clip: {destination} ({seconds}s)")
    return seconds


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("witch-voice-audition"))
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and list the five prompts without API calls")
    args = parser.parse_args()
    if args.dry_run:
        for name, prompt in VOICES:
            print(f"{name}: {PHRASE} | {prompt}")
        return
    token = os.environ.get("REPLICATE_API_KEY")
    if not token:
        sys.exit("REPLICATE_API_KEY is missing: no API calls were made")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {"model": MODEL, "phrase": PHRASE,
                "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "voices": []}
    for index, (name, prompt) in enumerate(VOICES, 1):
        print(f"Generating {index}/{len(VOICES)}: {name}", flush=True)
        source = args.output / f"{name}.wav"
        target = args.output / f"{name}.mp3"
        download_audio(predict(token, prompt), source)
        seconds = convert_audio(source, target)
        manifest["voices"].append({
            "id": name, "text": PHRASE, "voice_description": prompt,
            "wav": source.name, "mp3": target.name, "duration_seconds": seconds,
        })
        print(f"OK {name}: {seconds:.2f}s", flush=True)
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.output / "README.md").write_text(
        "# Witch voice audition — Qwen3-TTS\n\n"
        "Five independent voice-design candidates saying **At your service!**.\n"
        "Listen to the MP3 files, keeping the WAVs for potential future cloning.\n"
        "These are **not** used in Fighters yet.\n\n"
        "| Persona | Sample |\n| --- | --- |\n" +
        "".join(f"| {name} | [{name}.mp3]({name}.mp3) |\n" for name, _ in VOICES),
        encoding="utf-8",
    )
    print("Audition ready: 5 WAVs, 5 MP3s, manifest and README", flush=True)


if __name__ == "__main__":
    main()
