#!/usr/bin/env python3
"""Generate one original Fighters soundtrack via a GitHub Actions secret."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


MODEL_VERSION = "4469141c115f136a809884f6ccde7c9cd54f76e32f7621d137667cefa80f1fbe"
PROMPT = (
    "Instrumental dark fantasy RTS soundtrack for witches vs orcs in an enchanted forest. "
    "D minor, 86 BPM, medieval orchestral. Eerie witch motif: celesta, woodwinds, "
    "tremolo strings; earthy orc motif: low brass, frame drums, toms. Alternate mystery, "
    "strategic tension, restrained battle energy and quiet respite; weave both motifs "
    "throughout 8 minutes. Clear melody, evolving harmony, organic acoustics, spacious "
    "mix, understated for gameplay, loop-friendly ending. No vocals, pop, synths or abrupt climax."
)
OUTPUT = Path("docs/music/fighters-witches-orcs-8min.mp3")


def api_request(url, token, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Fighters-soundtrack-generation/1.0",
        },
        method="POST" if data is not None else "GET",
    )
    try:
        with urlopen(req, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        # Do not print headers: those may contain authentication information.
        detail = error.read(2000).decode("utf-8", "replace")
        raise RuntimeError(f"Replicate API HTTP {error.code}: {detail}") from None


def main():
    if len(PROMPT) > 512:
        raise ValueError(f"Prompt has {len(PROMPT)} characters; maximum is 512")
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError(
            "No Replicate API token: configure REPLICATE_API_TOKEN, "
            "REPLICATE_API_KEY, or REPLICATE_TOKEN as a GitHub Actions secret."
        )

    prediction = api_request(
        "https://api.replicate.com/v1/predictions",
        token,
        {
            "version": MODEL_VERSION,
            "input": {
                "prompt": PROMPT,
                "lyrics": "[Instrumental]",
                "duration": 480,
                "bpm": 86,
                "key_scale": "D minor",
                "time_signature": "4",
                "inference_steps": 8,
                "guidance_scale": 7,
                "shift": 3,
                "thinking": True,
                "batch_size": 1,
                "seed": -1,
                "audio_format": "mp3",
            },
        },
    )
    prediction_id = prediction["id"]
    print(f"Started ACE-Step 1.5 prediction {prediction_id}", flush=True)

    deadline = time.monotonic() + 25 * 60
    last_status = None
    while prediction["status"] not in ("succeeded", "failed", "canceled"):
        if time.monotonic() >= deadline:
            raise TimeoutError(f"Prediction {prediction_id} exceeded 25 minutes")
        if prediction["status"] != last_status:
            print(f"Prediction status: {prediction['status']}", flush=True)
            last_status = prediction["status"]
        time.sleep(10)
        prediction = api_request(
            f"https://api.replicate.com/v1/predictions/{prediction_id}", token
        )
    if prediction["status"] != "succeeded":
        raise RuntimeError(
            f"Prediction {prediction_id}: {prediction['status']}; "
            f"error: {prediction.get('error')}"
        )

    output = prediction["output"]
    if isinstance(output, list):
        if not output:
            raise RuntimeError("Prediction succeeded without an audio output")
        output = output[0]
    if not isinstance(output, str) or not output.startswith("https://"):
        raise RuntimeError("Unexpected Replicate audio output format")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(Request(output, headers={"User-Agent": "Fighters/1.0"}), timeout=180) as source:
        with OUTPUT.open("wb") as target:
            shutil.copyfileobj(source, target)
    size = OUTPUT.stat().st_size
    if size < 100_000:
        raise RuntimeError(f"Audio output is suspiciously small: {size} bytes")

    duration = None
    if shutil.which("ffprobe"):
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(OUTPUT)],
            capture_output=True,
            text=True,
            check=True,
        )
        duration = round(float(result.stdout.strip()), 2)
        print(f"Audio length: {duration} seconds", flush=True)

    metadata = {
        "model": "fishaudio/ace-step-1.5",
        "version": MODEL_VERSION,
        "prediction_id": prediction_id,
        "requested_seconds": 480,
        "actual_seconds": duration,
        "bytes": size,
        "prompt": PROMPT,
    }
    OUTPUT.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Downloaded {OUTPUT} ({size:,} bytes)", flush=True)
    if duration is not None and not 420 <= duration <= 540:
        raise RuntimeError(
            f"Generated audio length {duration}s is far from the requested 480s; "
            "keeping the file for inspection."
        )


if __name__ == "__main__":
    main()
