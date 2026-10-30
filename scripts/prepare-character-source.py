#!/usr/bin/env python3
"""Safely extract an audited Sketchfab source ZIP for glTF conversion."""

from __future__ import annotations

import argparse
import stat
import zipfile
from pathlib import Path

MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024


def validate_entries(entries: list[zipfile.ZipInfo]) -> list[zipfile.ZipInfo]:
    files = [entry for entry in entries if not entry.is_dir()]
    if sum(entry.file_size for entry in files) > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("Sketchfab source is too large when extracted")
    for entry in files:
        name = entry.filename.replace("\\", "/")
        parts = name.split("/")
        if name.startswith("/") or ".." in parts or any(not part for part in parts):
            raise ValueError("Unsafe archive member path")
        mode = entry.external_attr >> 16
        if stat.S_ISLNK(mode):
            raise ValueError("Archive symlinks are not supported")
    return files


def extract_source(archive_path: Path, destination: Path) -> Path:
    with zipfile.ZipFile(archive_path) as archive:
        files = validate_entries(archive.infolist())
        sources = [entry for entry in files if entry.filename.lower().endswith(".gltf")]
        if len(sources) != 1:
            raise ValueError(f"Expected one source .gltf, found {len(sources)}")
        destination.mkdir(parents=True, exist_ok=True)
        for entry in files:
            output = destination / entry.filename
            output.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(entry) as source, output.open("wb") as target:
                while block := source.read(1024 * 1024):
                    target.write(block)
        return destination / sources[0].filename


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    print(extract_source(args.archive, args.destination))


if __name__ == "__main__":
    main()
