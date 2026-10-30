#!/usr/bin/env python3
"""Assemble all 63 owner-selected Mixamo GLBs into one animation-bearing GLB.

Only the base rig/geometry is kept. Donor animations are re-bound to that rig,
and ONLY animation accessor bytes are copied: no 62 duplicate meshes/textures.
The source GLBs and the packed result stay outside the public repository.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / "assets" / "mixamo-selected.json"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def safe_private_path(path: str) -> Path:
    value = Path(path).expanduser().resolve()
    if value == ROOT or value.is_relative_to(ROOT) or value == Path("/"):
        raise ValueError("Source and output GLBs must stay outside Fighters")
    return value


def parse_glb(payload: bytes) -> tuple[dict, bytes]:
    if len(payload) < 20 or payload[:4] != b"glTF":
        raise ValueError("Invalid GLB header")
    version, length = struct.unpack_from("<II", payload, 4)
    if version != 2 or length != len(payload):
        raise ValueError("Invalid GLB version or length")
    offset = 12
    chunks = []
    while offset < length:
        if offset + 8 > length:
            raise ValueError("Truncated GLB chunk")
        size, kind = struct.unpack_from("<II", payload, offset)
        offset += 8
        if size % 4 or offset + size > length:
            raise ValueError("Invalid GLB chunk size")
        chunks.append((kind, payload[offset:offset + size]))
        offset += size
    if len(chunks) != 2 or chunks[0][0] != JSON_CHUNK or chunks[1][0] != BIN_CHUNK:
        raise ValueError("Expected a GLB with one JSON and one BIN chunk")
    document = json.loads(chunks[0][1])
    buffers = document.get("buffers", [])
    if len(buffers) != 1 or "uri" in buffers[0] or buffers[0]["byteLength"] > len(chunks[1][1]):
        raise ValueError("Expected one embedded GLB buffer")
    if document.get("extensionsRequired"):
        raise ValueError("Unsupported required GLB extensions")
    return document, chunks[1][1][:buffers[0]["byteLength"]]


def write_glb(document: dict, binary: bytes) -> bytes:
    data = bytearray(binary)
    data.extend(b"\0" * (-len(data) % 4))
    document["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    encoded += b" " * (-len(encoded) % 4)
    length = 12 + 8 + len(encoded) + 8 + len(data)
    return (struct.pack("<4sII", b"glTF", 2, length) +
            struct.pack("<II", len(encoded), JSON_CHUNK) + encoded +
            struct.pack("<II", len(data), BIN_CHUNK) + data)


def node_paths(document: dict) -> dict[str, int]:
    nodes = document.get("nodes", [])
    parents: dict[int, int] = {}
    for parent, node in enumerate(nodes):
        for child in node.get("children", []):
            if child in parents or not 0 <= child < len(nodes):
                raise ValueError("Malformed or multiply-parented rig hierarchy")
            parents[child] = parent

    cached: dict[int, str] = {}
    visiting: set[int] = set()

    def walk(index: int) -> str:
        if index in cached:
            return cached[index]
        if index in visiting:
            raise ValueError("Cyclic rig hierarchy")
        visiting.add(index)
        node = nodes[index]
        label = node.get("name") or f"@{index}"
        path = (walk(parents[index]) + "/" if index in parents else "") + label
        visiting.remove(index)
        cached[index] = path
        return path

    lookup: dict[str, int] = {}
    for index in range(len(nodes)):
        path = walk(index)
        if path in lookup:
            raise ValueError("Ambiguous rig node path: " + path)
        lookup[path] = index
    return lookup


def skin_signature(document: dict, lookup: dict[str, int]) -> list[list[str]]:
    inverse = {index: path for path, index in lookup.items()}
    skins = document.get("skins", [])
    if not skins:
        raise ValueError("Missing skinned rig")
    return sorted(sorted(inverse[joint] for joint in skin["joints"]) for skin in skins)


def graft_animations(
    selected: list[dict], loaded: dict[str, bytes], base_name: str = "Fighting_Idle.fbx",
) -> tuple[dict, bytes]:
    if len(selected) != 63 or len({row["filename"] for row in selected}) != 63:
        raise ValueError("Exactly 63 distinct selected animations are required")
    if base_name not in loaded:
        raise ValueError("Missing base rig: " + base_name)
    base, base_binary = parse_glb(loaded[base_name])
    base = deepcopy(base)
    base_lookup = node_paths(base)
    signature = skin_signature(base, base_lookup)
    result_binary = bytearray(base_binary)
    result_animations: list[dict] = []
    for record in selected:
        filename = record["filename"]
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.fbx", filename) or record.get("choice") != "keep":
            raise ValueError("Invalid selected motion: " + filename)
        payload = loaded.get(filename)
        if payload is None:
            raise ValueError("Missing converted GLB for: " + filename)
        if hashlib.sha256(payload).hexdigest() != record["researchGlbSha256"]:
            raise ValueError("Converted GLB SHA-256 mismatch: " + filename)
        donor, donor_binary = parse_glb(payload)
        donor_lookup = node_paths(donor)
        if skin_signature(donor, donor_lookup) != signature:
            raise ValueError("Incompatible YBot skin or rig: " + filename)
        if len(donor.get("animations", [])) != 1:
            raise ValueError("Expected one actual animation in: " + filename)
        reverse_donor = {index: path for path, index in donor_lookup.items()}
        accessor_map: dict[int, int] = {}
        view_map: dict[int, int] = {}

        def copy_accessor(index: int) -> int:
            if index in accessor_map:
                return accessor_map[index]
            accessor = deepcopy(donor["accessors"][index])
            if "sparse" in accessor or "bufferView" not in accessor:
                raise ValueError("Unsupported sparse/implicit animation accessor in " + filename)
            view_index = accessor["bufferView"]
            if view_index not in view_map:
                view = deepcopy(donor["bufferViews"][view_index])
                if view.get("buffer", 0) != 0:
                    raise ValueError("External animation buffer in " + filename)
                start = view.get("byteOffset", 0)
                end = start + view["byteLength"]
                if not 0 <= start <= end <= len(donor_binary):
                    raise ValueError("Out-of-bounds animation buffer view in " + filename)
                result_binary.extend(b"\0" * (-len(result_binary) % 4))
                view["byteOffset"] = len(result_binary)
                view["buffer"] = 0
                result_binary.extend(donor_binary[start:end])
                view_map[view_index] = len(base.setdefault("bufferViews", []))
                base["bufferViews"].append(view)
            accessor["bufferView"] = view_map[view_index]
            accessor_map[index] = len(base.setdefault("accessors", []))
            base["accessors"].append(accessor)
            return accessor_map[index]

        original = donor["animations"][0]
        copied = deepcopy(original)
        copied["name"] = filename[:-4]
        for sampler in copied.get("samplers", []):
            sampler["input"] = copy_accessor(sampler["input"])
            sampler["output"] = copy_accessor(sampler["output"])
        for channel in copied.get("channels", []):
            target = channel["target"]
            if target.get("path") not in ("translation", "rotation", "scale") or "node" not in target:
                raise ValueError("Unsupported non-skeletal animation channel: " + filename)
            path = reverse_donor[target["node"]]
            if path not in base_lookup:
                raise ValueError("Missing target rig bone " + path + " in " + filename)
            target["node"] = base_lookup[path]
        copied["extras"] = {
            **copied.get("extras", {}),
            "mixamoMotionId": record["motionId"],
            "sourceFbxSha256": record["sourceSha256"],
            "convertedGlbSha256": record["researchGlbSha256"],
        }
        result_animations.append(copied)
    base["animations"] = result_animations
    base.setdefault("asset", {}).setdefault("extras", {})["fightersSelectedMixamo"] = {
        "count": len(selected), "status": "research_pack_not_retargeted_or_gameplay_certified",
    }
    return base, write_glb(base, result_binary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Private directory containing the 63 verified GLBs")
    parser.add_argument("--output", required=True, help="Private destination for the combined GLB")
    args = parser.parse_args()
    source = safe_private_path(args.input)
    destination = safe_private_path(args.output)
    if not source.is_dir() or destination.exists() or destination.with_suffix(".manifest.json").exists():
        raise ValueError("Input must exist and output/manifest must not exist")
    selection = json.loads(SELECTION.read_text(encoding="utf8"))
    if (selection.get("status") != "selected_for_integration_not_runtime_approved" or
            selection.get("review", {}).get("decision") != "keep_all_63"):
        raise ValueError("Unexpected owner selection manifest")
    clips = selection["clips"]
    payloads = {}
    for clip in clips:
        file_path = source / (clip["filename"][:-4] + ".glb")
        payloads[clip["filename"]] = file_path.read_bytes()
    document, packed = graft_animations(clips, payloads)
    if len(document["animations"]) != 63:
        raise ValueError("Pack did not preserve all 63 animations")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(packed)
    report = {
        "schemaVersion": 1,
        "status": "research_not_runtime_approved",
        "filename": destination.name,
        "packSha256": hashlib.sha256(packed).hexdigest(),
        "bytes": len(packed),
        "clipNames": [animation["name"] for animation in document["animations"]],
        "source": "assets/mixamo-selected.json",
    }
    destination.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
