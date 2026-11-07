#!/usr/bin/env python3
"""Finish the approved Witch/Orc speech libraries for the playable game.

Run in GitHub Actions with REPLICATE_API_KEY, after downloading the approved
Witch catalog/shout alternatives. No credentials or runtime API calls ship to
the browser. The original work SFX and Orc death grunts remain untouched.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import time

from generate_voice_catalog import (
    ATTACK_DIRECTION, LINES, MODEL, ORC_TESTS, WITCH_ROLES, synthesize,
)


ORC_LINES = {
    "creation": ("Ready for duty!", "Here I am!", "At last!",
                 "The clan grows!", "Ready to serve!"),
    "interaction": ("Yes, chief?", "At your command!", "What now?", "I obey!"),
    "attack": ("Crush them!", "For the orcs!", "Break their lines!", "No mercy!"),
}

ORC_ATTACK_DIRECTION = (
    "A savage, ferocious, and utterly confident WAR CRY during a battle. "
    "ROAR the whole line loudly with a rough chest voice and furious force. "
    "Full projection, emphatic attack, battle adrenaline and powerful endings. "
    "Not a normal speaking voice, not muttering, not a comedian or an imitation. "
    "Intelligible English spoken by a fearsome fantasy orc warrior."
)


def generate(token: str, payload: dict, target: Path, *, battle: bool = False) -> float:
    # A transient Replicate error must not throw away an expensive batch.
    for attempt in range(3):
        try:
            return synthesize(token, payload, target, battle=battle)
        except RuntimeError as exc:
            if attempt == 2 or not any(code in str(exc).lower() for code in
                                        ("429", "500", "502", "503", "504", "timed out")):
                raise
            delay = (attempt + 1) * 8
            print(f"Transient TTS error; retry in {delay}s", flush=True)
            time.sleep(delay)
    raise AssertionError("Unreachable")


def build_faction(token: str, faction: str, source: Path, stage: Path) -> dict:
    roles = WITCH_ROLES if faction == "witches" else ORC_TESTS
    lines = LINES if faction == "witches" else ORC_LINES
    manifest = {
        "generator": MODEL,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "faction": faction,
        "voice_roles": list(roles),
        "categories": {category: len(values) * len(roles)
                       for category, values in lines.items()},
        "sounds": [],
    }
    if faction == "witches":
        old = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
        if len(old.get("sounds", [])) != 52:
            raise RuntimeError("Approved Witch archive is incomplete")

    total = 0
    for voice, definition in roles.items():
        description = (definition["description"] if faction == "witches" else definition)
        for category, phrases in lines.items():
            for index, phrase in enumerate(phrases, 1):
                rel = Path(category) / f"{voice}_{index:02d}.mp3"
                destination = stage / rel
                destination.parent.mkdir(parents=True, exist_ok=True)
                if faction == "witches" and category != "attack":
                    # Friendly/selection lines already approved by the user.
                    approved = source / rel
                    if not approved.is_file():
                        raise RuntimeError(f"Missing approved Witch clip: {rel}")
                    shutil.copy2(approved, destination)
                    original = next((s for s in old["sounds"] if s.get("path") == rel.as_posix()), None)
                    if original is None or original.get("text") != phrase:
                        raise RuntimeError(f"Witch manifest differs: {rel}")
                    duration = original["duration_seconds"]
                    performance = "approved-character-voice"
                elif faction == "witches" and category == "attack" and index == 2:
                    # The four *directly voice-designed* battle shouts were
                    # selected; the calm-anchor voice clones are discarded.
                    approved = source / "alternatives" / f"{voice}_for_the_wiccans_designed.mp3"
                    if not approved.is_file():
                        raise RuntimeError(f"Missing approved direct battle shout: {voice}")
                    shutil.copy2(approved, destination)
                    duration = None
                    performance = "approved-direct-voice-design-shout"
                else:
                    style = (ATTACK_DIRECTION if faction == "witches" else ORC_ATTACK_DIRECTION)
                    if category != "attack":
                        style = ("A welcoming but short, strong and grounded Orc introduction. "
                                 "Confident natural game acting, not loud or cartoonish."
                                 if category == "creation" else
                                 "A short, attentive, gruff acknowledgement. Controlled, direct, "
                                 "no yelling, no sensuality or parody.")
                    duration = generate(token, {
                        "mode": "voice_design", "language": "English",
                        "text": phrase, "voice_description": description + " " + style,
                        "style_instruction": style,
                    }, destination, battle=category == "attack")
                    performance = ("direct-voice-design-battle-cry" if category == "attack"
                                   else "role-directed-voice-design")
                if destination.stat().st_size < 2_000:
                    raise RuntimeError(f"Invalid voice file {destination}")
                manifest["sounds"].append({
                    "category": category, "voice": voice, "path": rel.as_posix(),
                    "text": phrase, "duration_seconds": duration, "model": MODEL,
                    "performance": performance,
                })
                total += 1
                print(f"{faction}: {total:02d}/52 {voice}/{category} {phrase}", flush=True)
    if len(manifest["sounds"]) != 52:
        raise RuntimeError(f"Incomplete {faction} catalog")
    (stage / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def install(stage: Path, destination: Path) -> None:
    original = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    created = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
    # Preserve the pre-existing licensed hammer (work), and death SFX
    # (Orc loud). Remove older voice entries from *the manifest*, not from
    # Git history, so the game can no longer select those inconsistent takes.
    preserved = [s for s in original.get("sounds", [])
                 if s.get("category") in ("work", "loud", "destruction")]
    for sound in created["sounds"]:
        src = stage / sound["path"]
        dst = destination / sound["path"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    created["sounds"].extend(preserved)
    (destination / "manifest.json").write_text(
        json.dumps(created, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Remove old *voice* MP3s only after the complete replacement is present.
    # Historical commits preserve their bytes for rollback and attribution.
    active = {sound["path"] for sound in created["sounds"]}
    retired = []
    for sound in original.get("sounds", []):
        rel = sound.get("path", "")
        parts = Path(rel).parts
        if (rel in active or len(parts) != 2 or
                parts[0] not in ("short", "long", "creation", "interaction") or
                not parts[1].endswith(".mp3")):
            continue
        old_file = destination / rel
        if old_file.is_file():
            old_file.unlink()
            retired.append(rel)
    print(f"{destination}: retired {len(retired)} obsolete voice files", flush=True)
    (destination / "GENERATED_VOICES.md").write_text(
        "# Role-based game voices\n\n"
        "English role voices generated with `qwen/qwen3-tts` on Replicate. "
        "5 formation lines, 4 interaction lines, 4 attack lines for each "
        "of four roles (the fourth is reserved for a future character). "
        "All battle commands are independently designed forceful shouts; "
        "Witch `attack/*_02.mp3` uses the directly designed takes approved "
        "by the creator, not the calm-reference clones.\n\n"
        "The replaced Freesound voice clips were removed (recoverable in Git history); "
        "retained `work/` and Orc `loud/` sounds retain their original "
        "attributions and licenses. Audio is pre-generated and served "
        "statically; `REPLICATE_API_KEY` is never included in the game.\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approved-witches", type=Path, required=True)
    parser.add_argument("--stage", type=Path, default=Path("generated-voices/final"))
    parser.add_argument("--install-root", type=Path, default=Path("app/sounds"))
    args = parser.parse_args()
    token = os.environ.get("REPLICATE_API_KEY")
    if not token:
        parser.error("REPLICATE_API_KEY is required")
    if [len(x) for x in ORC_LINES.values()] != [5, 4, 4]:
        raise RuntimeError("Unexpected Orc phrase counts")
    for faction in ("witches", "orcs"):
        build_faction(token, faction, args.approved_witches,
                      args.stage / faction)
    # Install only after *both* factions generated successfully.
    for faction in ("witches", "orcs"):
        install(args.stage / faction, args.install_root / faction)
    print("All 104 lines generated, 2 manifests installed, 64 new TTS calls maximum")


if __name__ == "__main__":
    main()
