#!/usr/bin/env python3
"""Give each Witch role three additional shouts in ONE approved battle voice.

The already-approved "For the Wiccans!" recording for a role is never
replaced. A longer, fiercely shouted reference is cloned from that exact
take, then the other three phrases are cloned from the longer reference.
This prevents four unrelated voice-design performances from masquerading as
one character. All new files are staged before any installed file changes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time

from generate_voice_catalog import (
    ATTACK_DIRECTION, LINES, MODEL, download, mp3_data_url, predict, convert,
)


ROLES = ("worker", "guard", "arcane", "elder")
APPROVED_INDEX = 2
SHOUT_REFERENCE_TEXT = "For the Wiccans!"
LONG_SHOUT_TEXT = (
    "For the Wiccans! Together we rise! We will defend our sisters! "
    "Let the enemy hear our battle cry!"
)
MAX_CALLS = len(ROLES) * 4  # 1 long reference + 3 lines, per role.


def produce(token: str, payload: dict, dest: Path) -> float:
    for attempt in range(3):
        try:
            with tempfile.TemporaryDirectory(prefix="witch-shout-") as folder:
                raw = Path(folder) / "generated.wav"
                download(predict(token, payload), raw)
                return convert(raw, dest, battle=True)
        except RuntimeError as error:
            if attempt == 2 or not any(word in str(error).lower() for word in
                                       ("429", "500", "502", "503", "504", "timed out")):
                raise
            time.sleep(8 * (attempt + 1))
    raise AssertionError("Unreachable")


def generate(directory: Path, token: str) -> int:
    manifest_file = directory / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("battle_voice_clone"):
        print("Witch battle-voice clones already installed; nothing to do")
        return 0
    existing = {s["path"]: s for s in manifest["sounds"]}
    new_details = {}
    with tempfile.TemporaryDirectory(prefix="witch-battle-catalog-") as stage_dir:
        stage = Path(stage_dir)
        for role in ROLES:
            approved_path = f"attack/{role}_{APPROVED_INDEX:02d}.mp3"
            approved_file = directory / approved_path
            approved = existing.get(approved_path)
            if (approved is None or approved.get("text") != SHOUT_REFERENCE_TEXT or
                    approved.get("performance") != "approved-direct-voice-design-shout" or
                    not approved_file.is_file()):
                raise RuntimeError(f"Missing approved shouted reference for {role}")

            sha = hashlib.sha256(approved_file.read_bytes()).hexdigest()
            reference_file = stage / f"{role}_battle_reference.mp3"
            print(f"Preparing {role} battle identity from approved shouted take", flush=True)
            reference_duration = produce(token, {
                "mode": "voice_clone", "language": "English", "text": LONG_SHOUT_TEXT,
                "reference_audio": mp3_data_url(approved_file),
                "reference_text": SHOUT_REFERENCE_TEXT,
                "style_instruction": ATTACK_DIRECTION,
            }, reference_file)
            if reference_duration < 3.0:
                raise RuntimeError(f"{role} battle reference too short")

            for number, phrase in enumerate(LINES["attack"], start=1):
                if number == APPROVED_INDEX:
                    continue  # Preserve exactly the battle cry the user approved.
                path = f"attack/{role}_{number:02d}.mp3"
                if path not in existing or existing[path].get("text") != phrase:
                    raise RuntimeError(f"Incompatible Witch battle catalog: {path}")
                target = stage / path
                target.parent.mkdir(parents=True, exist_ok=True)
                seconds = produce(token, {
                    "mode": "voice_clone", "language": "English", "text": phrase,
                    "reference_audio": mp3_data_url(reference_file),
                    "reference_text": LONG_SHOUT_TEXT,
                    "style_instruction": ATTACK_DIRECTION,
                }, target)
                new_details[path] = {"duration_seconds": seconds, "model": MODEL,
                    "performance": "battle-cry-cloned-from-approved-role-voice",
                    "battle_voice_reference_sha256": sha}
                print(f"Cloned {role} battle phrase {number}/4: {phrase}", flush=True)

        if len(new_details) != 12:
            raise RuntimeError("Expected exactly 12 new Witch battle cries")
        for path in new_details:
            (directory / path).write_bytes((stage / path).read_bytes())
        for sound in manifest["sounds"]:
            if sound["path"] in new_details:
                sound.update(new_details[sound["path"]])
        manifest["battle_voice_clone"] = {
            "method": "qwen/qwen3-tts voice_clone", "generated_clips": 12,
            "reference_category": "approved directly designed For the Wiccans battle cry",
            "reference_index": APPROVED_INDEX,
            "identity_by_role": {role: hashlib.sha256(
                (directory / f"attack/{role}_02.mp3").read_bytes()).hexdigest()
                for role in ROLES},
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")
    print("Installed 12 cloned Witch battle cries; all 4 approved anchors retained")
    return 12


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("docs/sounds/witches"))
    arguments = parser.parse_args()
    secret = os.environ.get("REPLICATE_API_KEY")
    if not secret:
        parser.error("REPLICATE_API_KEY is required")
    generate(arguments.directory, secret)
