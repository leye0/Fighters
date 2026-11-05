#!/usr/bin/env python3
"""Generate role-stable Witch lines and a separate Orc voice audition.

Outputs are review artifacts; this tool does not alter the in-game manifests.
The 52 Witch audio clips support 4 * 5 * 4 * 4 = 320 three-event
combinations (one greeting, one selection, one attack for each role).
"""

import argparse
import base64
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


MODEL = "qwen/qwen3-tts"
ENDPOINT = "https://api.replicate.com/v1/models/qwen/qwen3-tts/predictions"
SEED_TEXT = "At your service!"
ANCHOR_TEXT = (
    "Our circle stands together beneath these ancient trees. "
    "We will protect our village, and our magic will not fail us."
)
LINES = {
    "creation": ("Hi!", "Hello!", "Here I am!", "Good morning!", "The coven is ready!"),
    "interaction": ("Yes?", "At your service!", "I'm listening.", "What is your wish?"),
    "attack": ("Attack!", "For the Wiccans!", "For the witches!", "Fight!"),
}
WITCH_ROLES = {
    "worker": {
        "seed": "guardian",
        "description": "Adult English-speaking woman, warm full midrange voice, lightly "
                       "husky natural timbre, even pace and reassuring firmness. "
                       "Practical, kind and self-possessed; no caricature, sensuality, "
                       "affected accent or comedy delivery.",
    },
    "guard": {
        "seed": "warrior",
        "description": "Adult English-speaking woman in her thirties, firm medium-low "
                       "mezzo-soprano, clear direct consonants, confident and vigorous "
                       "without shouting. A capable soldier, natural grounded game "
                       "acting; never cartoonish, flirtatious or exaggerated.",
    },
    "arcane": {
        "seed": "mystic",
        "description": "Adult English-speaking woman, distinctive dusky lower mezzo "
                       "with smooth resonance, slow thoughtful phrasing and a quiet "
                       "enigmatic confidence. Fully voiced and intelligible, not "
                       "whispered, breathy, seductive, spooky or melodramatic.",
    },
    "elder": {
        "seed": "elder",
        "description": "Mature English-speaking woman in her fifties, rich low contralto "
                       "with a slight natural grain, composed authority and unhurried, "
                       "precisely articulated speech. Grounded medieval-fantasy acting; "
                       "natural and understated, never seductive, breathy or theatrical.",
    },
}
ORC_TESTS = {
    "worker": "Male English-speaking fantasy orc, practical and weary, low "
              "rough baritone with dry breath and naturally gravelly edges. "
              "Clear words, no cartoon acting, no shouting or gibberish.",
    "warrior": "Male English-speaking fantasy orc, strong deep harsh baritone, "
               "slightly guttural and intimidating, clipped powerful consonants. "
               "Controlled force and menace, natural not theatrical or comedic.",
    "shaman": "Older male English-speaking fantasy orc, dark raspy low bass, "
              "slow deliberate cadence with a weathered ancient quality. "
              "Intelligible ritual seriousness, no cackle or caricature.",
    "brute": "Very large male English-speaking fantasy orc, heavy chesty bass, "
             "thick rough timbre with low vocal fry and blunt measured rhythm. "
             "Fearsome but believable, no exaggerated growls or monster noises.",
}
ORC_TEST_LINE = "At your command!"
PLANNED_CALLS = len(WITCH_ROLES) * (1 + sum(map(len, LINES.values()))) + len(ORC_TESTS)
MAX_CALLS = PLANNED_CALLS + len(WITCH_ROLES)  # Only if a short reference fails.


def request_json(url: str, token: str, body: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        headers.update({"Content-Type": "application/json", "Prefer": "wait"})
    request = urllib.request.Request(
        url, data=json.dumps(body).encode() if body is not None else None,
        headers=headers, method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=75) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        # Secrets are never logged. Truncate potentially lengthy API errors.
        detail = exc.read(400).decode("utf-8", "replace")
        raise RuntimeError(f"Replicate HTTP {exc.code}: {detail}") from None
    if not isinstance(result, dict):
        raise RuntimeError("Unexpected Replicate prediction JSON")
    return result


def predict(token: str, inputs: dict) -> str:
    result = request_json(ENDPOINT, token, {"input": inputs})
    deadline = time.monotonic() + 240
    while result.get("status") not in {"succeeded", "failed", "canceled"}:
        if time.monotonic() > deadline:
            raise RuntimeError("Replicate prediction timed out")
        polling = result.get("urls", {}).get("get")
        if not isinstance(polling, str) or not polling.startswith(
            "https://api.replicate.com/v1/predictions/"
        ):
            raise RuntimeError("Replicate polling URL is invalid")
        time.sleep(2)
        result = request_json(polling, token)
    if result["status"] != "succeeded":
        raise RuntimeError(f"Replicate {result['status']}: {str(result.get('error'))[:200]}")
    output = result.get("output")
    if isinstance(output, list) and len(output) == 1:
        output = output[0]
    if not isinstance(output, str):
        raise RuntimeError("Replicate returned no audio URL")
    return output


def download(url: str, path: Path) -> None:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (
        host == "replicate.delivery" or host.endswith(".replicate.delivery")
        or host == "stream.replicate.com"
    ):
        raise RuntimeError(f"Unexpected audio URL host: {host}")
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read(20_000_001)
    if not 2_000 < len(data) <= 20_000_000:
        raise RuntimeError("Generated audio too small or large")
    path.write_bytes(data)


def convert(source: Path, target: Path, *, gritty: bool = False) -> float:
    filters = "loudnorm=I=-19:TP=-3:LRA=7"
    if gritty:
        # Roughly 1.5 semitones down without slowing the sentence. This is
        # an *optional* comparison; the unprocessed Orc sample is preserved.
        filters = "asetrate=24000*0.917,aresample=24000,atempo=1.0905," + filters
    subprocess.run([
        "ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(source), "-ac", "1", "-ar", "24000", "-af", filters,
        "-codec:a", "libmp3lame", "-b:a", "64k", str(target),
    ], check=True)
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(target),
    ], text=True).strip())
    if not .35 < duration < 20 or target.stat().st_size < 2_000:
        raise RuntimeError(f"Invalid audio duration or size: {target} ({duration}s)")
    return round(duration, 3)


def mp3_data_url(path: Path) -> str:
    data = path.read_bytes()
    if len(data) >= 190_000:
        raise RuntimeError(f"Reference clip exceeds data URL limit: {path}")
    return "data:audio/mpeg;base64," + base64.b64encode(data).decode("ascii")


def wav_data_url(path: Path) -> str:
    data = path.read_bytes()
    if len(data) >= 190_000:
        raise RuntimeError(f"Original audition reference too large: {path}")
    return "data:audio/wav;base64," + base64.b64encode(data).decode("ascii")


def synthesize(token: str, payload: dict, destination: Path) -> float:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        raw = Path(temporary) / "audio.wav"
        download(predict(token, payload), raw)
        return convert(raw, destination)


def catalog(token: str, seed_dir: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "model": MODEL, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "counts": {category: len(lines) * len(WITCH_ROLES)
                   for category, lines in LINES.items()},
        "combination_count": len(WITCH_ROLES) * 5 * 4 * 4,
        "voices": {}, "sounds": [],
    }
    for role, identity in WITCH_ROLES.items():
        original = seed_dir / (identity["seed"] + ".wav")
        if not original.is_file():
            raise RuntimeError(f"Missing approved Witch audition seed: {original}")
        reference = output / "references" / f"{role}.mp3"
        reference.parent.mkdir(parents=True, exist_ok=True)
        # Grow the selected audition take into a longer, reusable sample.
        # A 1.2s seed is shorter than Qwen's recommended 3s: use it only for
        # this bootstrap, then use the resulting 7-10s reference for all lines.
        bootstrap = {
            "mode": "voice_clone", "language": "English", "text": ANCHOR_TEXT,
            "reference_audio": wav_data_url(original), "reference_text": SEED_TEXT,
            "style_instruction": "Speak clearly and naturally with restrained medieval-fantasy seriousness.",
        }
        origin = "cloned-from-approved-audition"
        try:
            duration = synthesize(token, bootstrap, reference)
            if duration < 3:
                raise RuntimeError("Cloned anchor was too short")
        except RuntimeError as exc:
            # The first audition clips are only about 1.2s, while Qwen
            # recommends a 3s seed. Preserve progress if short cloning fails.
            print(f"Short-seed clone for {role} failed: {exc}; using voice design", flush=True)
            origin = "voice-design-fallback"
            duration = synthesize(token, {
                "mode": "voice_design", "language": "English", "text": ANCHOR_TEXT,
                "voice_description": identity["description"],
            }, reference)
        manifest["voices"][role] = {
            "reference_path": str(reference.relative_to(output)),
            "reference_text": ANCHOR_TEXT, "source_audition": identity["seed"],
            "origin": origin, "duration_seconds": duration,
        }
        print(f"Witch {role}: reference {duration:.2f}s ({origin})", flush=True)
        for category, lines in LINES.items():
            for index, text in enumerate(lines, 1):
                target = output / category / f"{role}_{index:02d}.mp3"
                style = ("A short strong battle command, clear and assertive but not a scream."
                         if category == "attack" else
                         "A natural friendly greeting, alert and concise."
                         if category == "creation" else
                         "A calm quick acknowledgement, neutral and not flirtatious.")
                seconds = synthesize(token, {
                    "mode": "voice_clone", "language": "English", "text": text,
                    "reference_audio": mp3_data_url(reference),
                    "reference_text": ANCHOR_TEXT, "style_instruction": style,
                }, target)
                manifest["sounds"].append({
                    "category": category, "voice": role, "text": text,
                    "path": str(target.relative_to(output)),
                    "duration_seconds": seconds, "model": MODEL,
                })
                print(f"Witch {len(manifest['sounds']):02d}/52: {role}/{category} "
                      f"{text} ({seconds:.2f}s)", flush=True)
    if len(manifest["sounds"]) != 52:
        raise RuntimeError("Incomplete Witch voice catalog")
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "README.md").write_text(
        "# Witch voices — review library\n\n"
        "52 ready-to-review MP3s (5 creation + 4 selection + 4 attack for each "
        "of four roles). Together these yield 320 possible three-event "
        "combinations. This archive is **not yet used by the game**.\n\n"
        "Role voices: worker = guardian audition, guard = warrior audition, "
        "arcane = mystic audition, elder = elder audition (future role).\n"
        "Each reference and line is documented in `manifest.json`.\n",
        encoding="utf-8",
    )


def orc_audition(token: str, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    sounds = []
    for name, description in ORC_TESTS.items():
        with tempfile.TemporaryDirectory() as temporary:
            raw = Path(temporary) / "audio.wav"
            download(predict(token, {
                "mode": "voice_design", "language": "English",
                "text": ORC_TEST_LINE, "voice_description": description,
            }), raw)
            normal = output / f"{name}.mp3"
            altered = output / f"{name}_gritty.mp3"
            duration = convert(raw, normal)
            convert(raw, altered, gritty=True)
        sounds.append({"voice": name, "text": ORC_TEST_LINE,
                       "description": description, "path": normal.name,
                       "gritty_path": altered.name, "duration_seconds": duration})
        print(f"Orc {name}: raw + gritty, {duration:.2f}s", flush=True)
    (output / "manifest.json").write_text(
        json.dumps({"model": MODEL, "sounds": sounds}, indent=2) + "\n",
        encoding="utf-8",
    )
    (output / "README.md").write_text(
        "# Orc voice audition\n\nFour original Orc voice candidates saying "
        "**At your command!**, each with an unprocessed and a lightly "
        "pitch-lowered `*_gritty.mp3` version. No Orc sounds in Fighters "
        "have been replaced.\n", encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("witches", "orcs", "both"), default="both")
    parser.add_argument("--seeds", type=Path, default=Path("scripts/voice-seeds"))
    parser.add_argument("--output", type=Path, default=Path("generated-voices"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    assert len(WITCH_ROLES) == 4 and list(map(len, LINES.values())) == [5, 4, 4]
    assert len(ORC_TESTS) == 4 and PLANNED_CALLS == 60 and MAX_CALLS == 64
    if args.dry_run:
        print(f"4 roles, 52 Witch clips, 320 three-event combinations, "
              f"4 Orc candidates, {PLANNED_CALLS} expected / <= {MAX_CALLS} "
              "Replicate requests")
        for role in WITCH_ROLES:
            print(f"{role}: {WITCH_ROLES[role]['seed']}")
        return
    token = os.environ.get("REPLICATE_API_KEY")
    if not token:
        sys.exit("REPLICATE_API_KEY is missing: no calls were made")
    # Generate Orc auditions first so they remain available even if a Witch
    # line fails later. The workflow uploads partial artifacts on failure.
    if args.mode in ("orcs", "both"):
        orc_audition(token, args.output / "orcs")
    if args.mode in ("witches", "both"):
        catalog(token, args.seeds, args.output / "witches")


if __name__ == "__main__":
    main()
