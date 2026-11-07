#!/usr/bin/env python3
"""Regenerate all 52 Witch lines from four fixed MiniMax voice identities.

One identity per role, not a new voice-design prompt for every sentence.
Each role's creator-approved ferocious "For the Wiccans!" take is the seed:
Qwen extends the very short seed into a 10+ second anchor, MiniMax clones it
once, and all 13 lines use the resulting *same* MiniMax voice_id. Attacks are
generated with an explicit angry emotion, not a gentle narration.

The complete output is staged and checked before replacing any game assets.
Requires REPLICATE_API_KEY in the GitHub Actions secret store.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

from generate_voice_catalog import (
    LINES, MODEL as QWEN_MODEL,
    convert, download, mp3_data_url, request_json,
)


ROLES = ("worker", "guard", "arcane", "elder")
VOICE_CLONER = "minimax/voice-cloning"
TTS_MODEL = "minimax/speech-02-turbo"
APPROVED_SHOUT = "For the Wiccans!"
LONG_REFERENCE = (
    "For the Wiccans! The ancient circle is our home and we will defend it. "
    "I stand with my sisters through fire and shadow. Let our courage shake "
    "the enemy, for we will not abandon our village!"
)


def prediction(token: str, model: str, payload: dict):
    url = f"https://api.replicate.com/v1/models/{model}/predictions"
    for attempt in range(3):
        try:
            result = request_json(url, token, {"input": payload})
            deadline = time.monotonic() + 300
            while result.get("status") not in ("succeeded", "failed", "canceled"):
                if time.monotonic() > deadline:
                    raise RuntimeError(f"Replicate {model}: timed out")
                polling = result.get("urls", {}).get("get", "")
                if not polling.startswith("https://api.replicate.com/v1/predictions/"):
                    raise RuntimeError("Unexpected Replicate status URL")
                time.sleep(2)
                result = request_json(polling, token)
            if result["status"] != "succeeded":
                raise RuntimeError(f"Replicate {model}: {str(result.get('error'))[:180]}")
            return result["output"]
        except RuntimeError as exc:
            if attempt == 2 or not any(code in str(exc).lower() for code in
                                       ("429", "500", "502", "503", "504", "timed out")):
                raise
            print(f"Transient {model} error, retrying", flush=True)
            time.sleep(8 * (attempt + 1))
    raise AssertionError("Unreachable")


def output_url(value) -> str:
    if isinstance(value, list) and len(value) == 1:
        value = value[0]
    if not isinstance(value, str):
        raise RuntimeError("Replicate speech output is not an audio URL")
    return value


def make_long_anchor(token: str, approved: Path, target: Path) -> float:
    payload = {
        "mode": "voice_clone", "language": "English", "text": LONG_REFERENCE,
        "reference_audio": mp3_data_url(approved),
        "reference_text": APPROVED_SHOUT,
        "style_instruction": (
            "Strong mature confident fantasy heroine. A bold grounded voice "
            "with clear natural consonants, capable of shouting fiercely. "
            "Do not whisper, flirt, laugh or speak like a cartoon."
        ),
    }
    with tempfile.TemporaryDirectory(prefix="witch-anchor-") as folder:
        raw = Path(folder) / "anchor.wav"
        download(output_url(prediction(token, QWEN_MODEL, payload)), raw)
        length = convert(raw, target)
        if length < 4:
            raise RuntimeError("Cloned reference did not contain enough genuine speech")
        if length < 10.5:
            # MiniMax requires 10+ seconds of reference speech. A second
            # playback of the same anchored voice is safe as a bootstrap.
            repeated = Path(folder) / "extended.mp3"
            subprocess.run([
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-stream_loop", "3", "-i", str(target), "-t", "12",
                "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame",
                "-b:a", "64k", str(repeated),
            ], check=True)
            target.write_bytes(repeated.read_bytes())
            length = 12.0
        if target.stat().st_size >= 190_000:
            raise RuntimeError("Voice reference exceeds Replicate data URL limit")
        return length


def generate(directory: Path, token: str, stage: Path) -> int:
    manifest_file = directory / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("stable_voice_identities"):
        print("Witch voices already regenerated with stable IDs")
        return 0
    existing = {s["path"]: s for s in manifest["sounds"]}
    count = 0
    identities = {}
    generated = {}
    # Persistent staging lives in the runner workspace. A failed step uploads
    # it as an Actions artifact, which the next attempt restores. Never pay
    # again for a valid voice ID or MP3 already present in the checkpoint.
    stage.mkdir(parents=True, exist_ok=True)
    for role in ROLES:
            approved_path = f"attack/{role}_02.mp3"
            approved_file = directory / approved_path
            if (not approved_file.is_file() or approved_path not in existing or
                    existing[approved_path].get("text") != APPROVED_SHOUT or
                    existing[approved_path].get("performance") !=
                    "approved-direct-voice-design-shout"):
                raise RuntimeError(f"Missing creator-approved role sample: {role}")
            source_sha = hashlib.sha256(approved_file.read_bytes()).hexdigest()
            reference = stage / f"reference-{role}.mp3"
            identity_path = stage / f"identity-{role}.json"
            if identity_path.is_file():
                identity = json.loads(identity_path.read_text(encoding="utf-8"))
                if (identity.get("approved_shout_sha256") != source_sha or
                        identity.get("model") != TTS_MODEL or
                        not isinstance(identity.get("voice_id"), str)):
                    raise RuntimeError(f"Voice checkpoint does not match Witch {role}")
                print(f"Restored paid MiniMax voice identity for {role}", flush=True)
            else:
                print(f"Building one permanent voice identity for Witch {role}", flush=True)
                if reference.is_file() and reference.stat().st_size > 2000:
                    reference_seconds = float(subprocess.check_output([
                        "ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1", str(reference),
                    ], text=True).strip())
                else:
                    reference_seconds = make_long_anchor(token, approved_file, reference)
                clone = prediction(token, VOICE_CLONER, {
                    "model": "speech-02-turbo", "voice_file": mp3_data_url(reference),
                    "need_noise_reduction": False,
                    "need_volume_normalization": True,
                })
                voice_id = clone.get("voice_id") if isinstance(clone, dict) else None
                if not isinstance(voice_id, str) or len(voice_id) < 3:
                    raise RuntimeError(f"MiniMax returned no voice ID for {role}")
                identity = {"model": TTS_MODEL, "voice_id": voice_id,
                    "approved_shout_sha256": source_sha,
                    "reference_seconds": reference_seconds}
                identity_path.write_text(json.dumps(identity, indent=2) + "\n",
                                         encoding="utf-8")
            if any(previous["voice_id"] == identity["voice_id"]
                   for previous in identities.values()):
                raise RuntimeError("MiniMax reused a different role's voice ID")
            identities[role] = identity
            voice_id = identity["voice_id"]
            for category, phrases in LINES.items():
                for index, phrase in enumerate(phrases, 1):
                    path = f"{category}/{role}_{index:02d}.mp3"
                    if path not in existing or existing[path].get("text") != phrase:
                        raise RuntimeError(f"Incompatible Witch phrase catalog: {path}")
                    is_attack = category == "attack"
                    destination = stage / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    record = stage / "metadata" / f"{role}-{category}-{index:02d}.json"
                    if destination.is_file() and destination.stat().st_size > 2000 and record.is_file():
                        info = json.loads(record.read_text(encoding="utf-8"))
                        if (info.get("voice_id") != voice_id or
                                info.get("voice_reference_sha256") != source_sha):
                            raise RuntimeError(f"Checkpoint voice mismatch: {path}")
                        print(f"Reused previously paid phrase: {path}", flush=True)
                    else:
                        output = prediction(token, TTS_MODEL, {
                            "text": phrase.upper() if is_attack else phrase,
                            "voice_id": voice_id,
                            "emotion": "angry" if is_attack else "neutral",
                            "speed": 1.07 if is_attack else 1,
                            "volume": 2.0 if is_attack else 1,
                            "pitch": 0,
                            "language_boost": "English",
                        })
                        with tempfile.TemporaryDirectory(prefix="witch-sentence-") as temp:
                            raw = Path(temp) / "speech.mp3"
                            download(output_url(output), raw)
                            seconds = convert(raw, destination, battle=is_attack)
                        info = {"model": TTS_MODEL, "duration_seconds": seconds,
                            "voice_id": voice_id, "voice_reference_sha256": source_sha,
                            "performance": ("consistent-role-battle-cry" if is_attack else
                                            "consistent-role-character-voice")}
                        record.parent.mkdir(parents=True, exist_ok=True)
                        record.write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
                    generated[path] = info
                    count += 1
                    print(f"Witch {count:02d}/52 {role} {category}: {phrase}", flush=True)

    if count != 52:
        raise RuntimeError(f"Incomplete Witch regeneration: {count}/52")
    if len({x["voice_id"] for x in identities.values()}) != 4:
        raise RuntimeError("MiniMax assigned duplicate role identities")
    for path, info in generated.items():
        (directory / path).write_bytes((stage / path).read_bytes())
        existing[path].update(info)
    manifest["generator"] = TTS_MODEL
    manifest["generated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest["stable_voice_identities"] = identities
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")

    print("Installed 52 new lines from 4 persistent Witch voice IDs")
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("app/sounds/witches"))
    parser.add_argument("--checkpoint", type=Path,
                        default=Path("generated-voices/witches-checkpoint"))
    arguments = parser.parse_args()
    secret = os.environ.get("REPLICATE_API_KEY")
    if not secret:
        parser.error("REPLICATE_API_KEY is required")
    generate(arguments.directory, secret, arguments.checkpoint)
