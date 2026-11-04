#!/usr/bin/env python3
"""Import licensed Witch voice previews for the Fighters static game.

Pixabay death sound is included only when its actual MP3 is supplied;
the Pixabay page URL is not an audio file. Never substitute watermarked
or unlicensed audio for a missing file.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path("docs/sounds/witches")
SOURCES = [
    {
        "category": "interaction",
        "name": "Witch_Interaction",
        "path": "interaction/Witch_Interaction.mp3",
        "preview_url": "https://cdn.freesound.org/previews/349/349052_6244580-lq.mp3",
        "source_url": "https://freesound.org/people/InSintesi/sounds/349052/",
        "author": "InSintesi",
        "title": "Witch's whisper.wav",
        "license": "CC BY 4.0",
    },
    {
        "category": "creation",
        "name": "Witch_Creation",
        "path": "creation/Witch_Creation.mp3",
        "preview_url": "https://cdn.freesound.org/previews/348/348142_6358944-lq.mp3",
        "source_url": "https://freesound.org/people/NikoMyth/sounds/348142/",
        "author": "NikoMyth",
        "title": "Witch's Laugh.wav",
        "license": "CC0",
    },
]

def download(source: dict) -> None:
    path = ROOT / source["path"]
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 2000:
        print(f"Already present: {path}")
        return
    request = urllib.request.Request(
        source["preview_url"],
        headers={"User-Agent": "Fighters game audio importer (source credits preserved)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read(4_000_001)
    if len(content) > 4_000_000:
        raise RuntimeError(f"Audio unexpectedly large: {source['name']}")
    if len(content) < 2000 or not (
        content[:3] == b"ID3" or
        (content[0] == 0xFF and (content[1] & 0xE0) == 0xE0)
    ):
        raise RuntimeError(f"Not valid MP3 data: {source['name']}")
    path.write_bytes(content)
    print(f"Imported {len(content)} bytes: {path}")

def main() -> None:
    for source in SOURCES:
        download(source)
    sounds = [
        {k: value for k, value in source.items() if k != "preview_url"}
        for source in SOURCES
    ]
    death_path = ROOT / "destruction/Witch_Destruction.mp3"
    if death_path.exists() and death_path.stat().st_size > 2000:
        sounds.append({
            "category": "destruction",
            "name": "Witch_Destruction",
            "path": "destruction/Witch_Destruction.mp3",
            "source_url": "https://pixabay.com/sound-effects/horror-witch-laugh-256450/",
            "author": "Alex_Jauk",
            "title": "Witch Laugh",
            "license": "Pixabay Content License",
        })
    manifest = {"sounds": sounds, "counts": {
        kind: sum(sound["category"] == kind for sound in sounds)
        for kind in ("interaction", "creation", "destruction")
    }}
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    credits = """# Witch voice sound credits

- **Interaction:** "Witch's whisper.wav" by [InSintesi](https://freesound.org/people/InSintesi/sounds/349052/), used under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The included MP3 is the freely available Freesound preview.
- **Creation:** "Witch's Laugh.wav" by [NikoMyth](https://freesound.org/people/NikoMyth/sounds/348142/), [Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/). The included MP3 is the freely available Freesound preview.
- **Destruction:** "Witch Laugh" by [Alex_Jauk on Pixabay](https://pixabay.com/sound-effects/horror-witch-laugh-256450/), [Pixabay Content License](https://pixabay.com/service/license-summary/)."""
    if manifest["counts"]["destruction"]:
        credits += " The MP3 is stored in destruction/Witch_Destruction.mp3.\n"
    else:
        credits += " Pending: the original downloadable MP3 has not yet been imported. No sound is played for this event.\n"
    (ROOT / "ATTRIBUTION.md").write_text(credits, encoding="utf-8")
    assert all((ROOT / sound["path"]).is_file() for sound in sounds)
    print(f"Ready: {manifest['counts']}")

if __name__ == "__main__":
    main()
