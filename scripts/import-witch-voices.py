#!/usr/bin/env python3
"""Import short, licensed female acknowledgements for Fighters.

The previews are downloaded at build time, normalized with ffmpeg, checked,
and committed by GitHub Actions. The original source, author and license are
preserved. No runtime CDN fetches, long speech compilations or watermarks.
"""
from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

ROOT = Path("docs/sounds/witches")
BASE = "https://freesound.org/people/{author}/sounds/{sound_id}/"

# Individually checked for a short affirmative female utterance and explicit
# Creative Commons licensing (November 2026). Some say "yeah" or "yep".
ACKNOWLEDGEMENTS = [
    ("Yes_Excited", "musamdu", 353103, "Girl Screams 'Yes!'", "CC0", "yes"),
    ("Yes_Dignified", "Reitanna", 235073, "mnyes2.wav", "CC0", "yes"),
    ("Yes_RealReaction", "Reitanna", 242693, "oh yes!.wav", "CC0", "yes"),
    ("Yes_YepYep", "Legnalegna55", 547354, "YEP YEP.", "CC0", "yes"),
    ("Yes_OhYeah", "Legnalegna55", 539277, "OH YEAH", "CC0", "yes"),
    ("Yes_Playful", "melisandepope", 572608, "Yeah03.wav", "CC0", "yes"),
    ("Yes_Clear", "NoiseCollector", 71466, "yes.wav", "CC BY 3.0", "yes"),
    ("Yes_Morena", "MatteusNova", 157506, "The word yes", "CC BY 4.0", "yes"),
    ("Uhu_Assured", "shadoWisp", 264610, "uh huh.wav", "CC BY 3.0", "uhu"),
    ("Uhu_Cartoon", "Iceofdoom", 436443, "Uh Huh - Little Cartoon Female", "CC BY 4.0", "uhu"),
]


class PreviewMeta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.url = None

    def handle_starttag(self, tag, attrs):
        if tag != "meta":
            return
        values = dict(attrs)
        if values.get("property") == "og:audio" or values.get("name") == "twitter:player:stream":
            content = values.get("content", "")
            if re.fullmatch(r"https://cdn\.freesound\.org/previews/\d+/\d+_\d+-lq\.mp3", content):
                self.url = content


def preview_url(author: str, sound_id: int) -> str:
    page = BASE.format(author=author, sound_id=sound_id)
    request = urllib.request.Request(page, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read(1_000_000).decode("utf-8", "replace")
    parser = PreviewMeta()
    parser.feed(html)
    if not parser.url or f"/{sound_id}_" not in parser.url:
        raise RuntimeError(f"Missing Freesound preview URL for {page}")
    return parser.url


def fetch_mp3(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        content = response.read(3_000_001)
    if not 2_000 < len(content) < 3_000_000 or not (
        content[:3] == b"ID3" or (content[0] == 0xFF and content[1] & 0xE0 == 0xE0)
    ):
        raise RuntimeError(f"Missing or invalid Freesound MP3 preview: {url}")
    destination.write_bytes(content)


def duration(path: Path) -> float:
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True)
    return float(output.strip())


def import_acknowledgement(row: tuple) -> dict:
    name, author, sound_id, title, license_name, utterance = row
    target = ROOT / "interaction" / f"{name}.mp3"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file():
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mp3"
            fetch_mp3(preview_url(author, sound_id), source)
            seconds = duration(source)
            if not .35 < seconds < 3.3:
                raise RuntimeError(f"Expected a short voice, got {seconds}s: {sound_id}")
            subprocess.run([
                "ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
                "-i", str(source), "-ac", "1", "-ar", "24000",
                "-af", "loudnorm=I=-19:TP=-3:LRA=7",
                "-codec:a", "libmp3lame", "-b:a", "64k", str(target),
            ], check=True)
    length = duration(target)
    if not .30 < length < 3.3 or target.stat().st_size < 2_000:
        raise RuntimeError(f"Bad processed acknowledgement {target} ({length}s)")
    return {
        "category": "interaction", "name": name,
        "path": f"interaction/{name}.mp3", "utterance": utterance,
        "freesound_id": sound_id,
        "source_url": BASE.format(author=author, sound_id=sound_id),
        "author": author, "title": title, "license": license_name,
    }


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    # Retain creation/work and any optional death sound, replacing only the
    # old unsuitable whisper. Preserve the work sample already in the repo.
    original = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    other = [sound for sound in original["sounds"] if sound["category"] != "interaction"]
    for sound in other:
        if not (ROOT / sound["path"]).is_file():
            raise RuntimeError(f"Missing existing Witch sound: {sound['path']}")
    sounds = [import_acknowledgement(row) for row in ACKNOWLEDGEMENTS] + other
    counts = {kind: sum(sound["category"] == kind for sound in sounds)
              for kind in ("interaction", "creation", "destruction", "work")}
    assert counts["interaction"] == len(ACKNOWLEDGEMENTS)
    (ROOT / "manifest.json").write_text(
        json.dumps({"sounds": sounds, "counts": counts}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    licenses = {
        "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
        "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
        "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
        "Pixabay Content License": "https://pixabay.com/service/license-summary/",
    }
    lines = ["# Witch voice sound credits", "",
             "Each acknowledgement MP3 is an edited Freesound preview, mono 24 kHz,",
             "loudness-normalized. Ten original recordings yield fifteen stable",
             "character voice profiles with small pitch/speed variations; they",
             "are not fifteen separate performers. The old whisper is unused.", ""]
    for sound in sounds:
        url, lic = sound["source_url"], sound["license"]
        lines.append(f"- **{sound['category']} · {sound['name']}**: "
                     f"[{sound['title']}]({url}) by {sound['author']} — "
                     f"[{lic}]({licenses[lic]}).")
    (ROOT / "ATTRIBUTION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Imported and verified {counts}; {len(ACKNOWLEDGEMENTS)} short voices")


if __name__ == "__main__":
    main()
