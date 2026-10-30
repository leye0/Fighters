#!/usr/bin/env python3
"""Acquire one Sketchfab character candidate directly into GitHub source assets.

The Actions workflow commits the original via Git LFS, with CC BY attribution.
Playable character approval remains separate from source acquisition.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path


CHARACTERS = {
    "claudia": ("CHAR-CAND-006", "c659bd0accab47c6bbe390cf822a2b92"),
    "carla": ("CHAR-CAND-007", "acf520f450d14dd799f98a6fede3edf5"),
    "realistic-man": ("CHAR-CAND-003", "eaea58da1b3c4d4d9a75a68830959122"),
}
MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
MAX_GLTF_JSON_BYTES = 40 * 1024 * 1024


def api_json(model_id: str, suffix: str, token: str) -> dict:
    url = f"https://api.sketchfab.com/v3/models/{model_id}{suffix}"
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Token {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"Sketchfab API HTTP {exc.code} ({suffix or 'metadata'}). "
            "Verify SKETCHFAB_KEY, account permissions and Download API access."
        ) from None
    if not isinstance(data, dict):
        raise RuntimeError("Sketchfab returned a non-object JSON response")
    return data


def download_archive(url: str, destination: Path) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError("Sketchfab returned an invalid archive URL")
    digest = hashlib.sha256()
    length = 0
    request = urllib.request.Request(url, headers={"User-Agent": "Fighters-character-import/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            length += len(chunk)
            if length > MAX_ARCHIVE_BYTES:
                raise RuntimeError("Model archive exceeds the 1 GiB staging limit")
            digest.update(chunk)
            output.write(chunk)
    if length == 0:
        raise RuntimeError("Sketchfab returned an empty archive")
    return digest.hexdigest()


def inspect_gltf_document(document: dict) -> dict:
    skinned_nodes = [
        node for node in document.get("nodes", [])
        if isinstance(node, dict) and isinstance(node.get("mesh"), int)
        and isinstance(node.get("skin"), int)
    ]
    return {
        "skins": len(document.get("skins", [])),
        "meshes": len(document.get("meshes", [])),
        "skinned_nodes": len(skinned_nodes),
        "animations": len(document.get("animations", [])),
        "nodes": len(document.get("nodes", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
    }


def read_gltf_document(contents: bytes, filename: str) -> dict:
    if filename.lower().endswith(".glb"):
        if len(contents) < 20 or contents[:4] != b"glTF":
            raise RuntimeError(f"Invalid GLB header: {filename}")
        version, declared_size = struct.unpack_from("<II", contents, 4)
        json_size, chunk_type = struct.unpack_from("<II", contents, 12)
        if version != 2 or declared_size != len(contents) or chunk_type != 0x4E4F534A:
            raise RuntimeError(f"Invalid GLB structure: {filename}")
        if json_size > MAX_GLTF_JSON_BYTES or 20 + json_size > len(contents):
            raise RuntimeError(f"Invalid GLB JSON length: {filename}")
        contents = contents[20 : 20 + json_size]
    if len(contents) > MAX_GLTF_JSON_BYTES:
        raise RuntimeError(f"glTF metadata is too large: {filename}")
    document = json.loads(contents)
    if not isinstance(document, dict) or not isinstance(document.get("asset"), dict):
        raise RuntimeError(f"Invalid glTF document: {filename}")
    return document


def audit_zip(path: Path) -> dict:
    if not zipfile.is_zipfile(path):
        raise RuntimeError("Sketchfab response is not a ZIP archive")
    with zipfile.ZipFile(path) as archive:
        files = [member for member in archive.infolist() if not member.is_dir()]
        if any(".." in Path(member.filename).parts or member.filename.startswith("/") for member in files):
            raise RuntimeError("Unsafe paths in Sketchfab archive")
        candidates = [member for member in files if member.filename.lower().endswith((".gltf", ".glb"))]
        if not candidates:
            raise RuntimeError("No glTF or GLB scene in downloaded archive")
        documents = []
        for member in candidates:
            if member.file_size > MAX_GLTF_JSON_BYTES and member.filename.lower().endswith(".gltf"):
                raise RuntimeError("Excessively large glTF metadata")
            # GLBs can contain a large binary mesh, so inspect only its JSON header.
            if member.filename.lower().endswith(".glb"):
                with archive.open(member) as binary:
                    header = binary.read(20)
                    if len(header) < 20 or header[:4] != b"glTF":
                        raise RuntimeError("Invalid GLB file")
                    version, declared_size = struct.unpack_from("<II", header, 4)
                    json_size = struct.unpack_from("<I", header, 12)[0]
                    chunk_type = struct.unpack_from("<I", header, 16)[0]
                    if version != 2 or declared_size != member.file_size or chunk_type != 0x4E4F534A:
                        raise RuntimeError("Invalid GLB header/length")
                    if json_size > MAX_GLTF_JSON_BYTES or json_size + 20 > member.file_size:
                        raise RuntimeError("Excessively large GLB JSON")
                    document = json.loads(binary.read(json_size))
            else:
                document = read_gltf_document(archive.read(member), member.filename)
            documents.append({"file": member.filename, **inspect_gltf_document(document)})
        return {
            "archive_files": len(files),
            "scene_documents": documents,
            "has_skinned_mesh": any(item["skinned_nodes"] > 0 for item in documents),
        }


def acquire(character: str, output: Path, token: str) -> dict:
    candidate_id, model_id = CHARACTERS[character]
    metadata = api_json(model_id, "", token)
    license_info = metadata.get("license") or {}
    if not metadata.get("isDownloadable"):
        raise RuntimeError(f"{character} is no longer downloadable")
    if license_info.get("slug") != "by":
        raise RuntimeError(f"Expected CC BY candidate; found {license_info.get('slug')!r}")
    response = api_json(model_id, "/download", token)
    gltf = response.get("gltf") or {}
    archive_url = gltf.get("url")
    if not isinstance(archive_url, str):
        raise RuntimeError("Sketchfab Download API did not return a glTF archive URL")
    destination = output / character
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / "original-sketchfab-gltf.zip"
    archive_sha256 = download_archive(archive_url, archive)
    audit = audit_zip(archive)
    report = {
        "candidate_id": candidate_id,
        "model_id": model_id,
        "source_url": metadata.get("viewerUrl") or f"https://sketchfab.com/models/{model_id}",
        "title": metadata.get("name"),
        "author": (metadata.get("user") or {}).get("displayName"),
        "license": license_info,
        "archive_sha256": archive_sha256,
        "archive_bytes": archive.stat().st_size,
        "audit": audit,
        "status": "raw_source_downloaded_into_git_lfs_pending_visual_review",
    }
    (destination / "audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    if not audit["has_skinned_mesh"]:
        raise RuntimeError("No skinned mesh found; model is not approved for Fighters")
    author = report["author"] or "Sketchfab model author (see original page)"
    title = report["title"] or character
    (destination / "ATTRIBUTION.md").write_text(
        f"# {title}\n\n"
        f"- Creator: {author}\n"
        f"- Original: {report['source_url']}\n"
        "- License: Creative Commons Attribution 4.0 (CC BY 4.0)\n"
        "- License text: https://creativecommons.org/licenses/by/4.0/\n"
        f"- Original ZIP SHA-256: `{archive_sha256}`\n\n"
        "Original, unmodified download for the Fighters character source catalog. "
        "Not yet approved for playable character integration.\n",
        encoding="utf-8",
    )
    manifest_file = Path("assets/manifest.json")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    matching = [asset for asset in manifest["assets"] if asset["id"] == candidate_id]
    if len(matching) != 1:
        raise RuntimeError(f"Candidate {candidate_id} missing or duplicated in manifest")
    record = matching[0]
    record.update({
        "licenseStatus": "source_cc_by_verified",
        "redistributionStatus": "source_cc_by_with_attribution",
        "integrationStatus": "raw_downloaded_pending_game_review",
        "sha256": archive_sha256,
        "attribution": f"assets/source/characters/{character}/ATTRIBUTION.md",
    })
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character", choices=sorted(CHARACTERS), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("SKETCHFAB_KEY", "").strip()
    if not token:
        raise SystemExit("Missing GitHub Actions secret SKETCHFAB_KEY")
    report = acquire(args.character, args.output, token)
    print(f"Acquired {report['candidate_id']} into GitHub source assets: {report['archive_bytes']} bytes; SHA-256 {report['archive_sha256']}")
    print(f"Rig audit: {json.dumps(report['audit'], ensure_ascii=False)}")
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(f"### {report['candidate_id']}: original download ready for GitHub\n\n")
            summary.write(f"ZIP SHA-256: `{report['archive_sha256']}`. Git LFS source commit follows.\n\n")
            summary.write("Original is attributed under CC BY; game integration still requires visual and rig review.\n")


if __name__ == "__main__":
    main()
