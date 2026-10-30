#!/usr/bin/env python3
"""Guard against publishing a fake or unskinned runtime character GLB."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

MAX_RUNTIME_BYTES = 95 * 1024 * 1024


def inspect_glb(path: Path) -> dict:
    size = path.stat().st_size
    if size > MAX_RUNTIME_BYTES:
        raise ValueError("GLB is too large for ordinary Git; optimize before committing")
    with path.open("rb") as stream:
        header = stream.read(20)
        if len(header) != 20 or header[:4] != b"glTF":
            raise ValueError("Expected binary glTF (GLB)")
        version, declared_size = struct.unpack_from("<II", header, 4)
        json_size, kind = struct.unpack_from("<II", header, 12)
        if version != 2 or declared_size != size or kind != 0x4E4F534A:
            raise ValueError("Invalid GLB version, length, or JSON chunk")
        if json_size + 20 > size or json_size > 40 * 1024 * 1024:
            raise ValueError("Invalid GLB JSON chunk length")
        data = json.loads(stream.read(json_size))
    nodes = data.get("nodes") or []
    skinned = [node for node in nodes if isinstance(node, dict)
               and isinstance(node.get("skin"), int) and isinstance(node.get("mesh"), int)]
    if not skinned or not data.get("skins") or not data.get("meshes"):
        raise ValueError("Runtime model has no skinned mesh")
    return {
        "bytes": size,
        "skins": len(data["skins"]),
        "skinned_nodes": len(skinned),
        "meshes": len(data["meshes"]),
        "animations": len(data.get("animations") or []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect_glb(args.path), indent=2))


if __name__ == "__main__":
    main()
