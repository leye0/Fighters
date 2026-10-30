"""Pure structural checks for the offline FBX→GLB research conversion."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import struct
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "convert-mixamo-fbx.py"
spec = importlib.util.spec_from_file_location("fighters_converter", SOURCE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def glb(document: dict) -> bytes:
    body = json.dumps(document).encode("utf-8")
    padded = body + b" " * ((4 - len(body) % 4) % 4)
    return b"glTF" + struct.pack("<II", 2, 20 + len(padded)) + struct.pack("<II", len(padded), 0x4E4F534A) + padded


class ConversionStructureTest(unittest.TestCase):
    def test_valid_animated_glb(self) -> None:
        output = module.inspect_glb_bytes(glb({"nodes": [{}], "animations": [{"channels": [{}]}]}))
        self.assertEqual(output["animations"], 1)
        self.assertEqual(output["channels"], 1)

    def test_static_glb_rejected(self) -> None:
        with self.assertRaises(ValueError):
            module.inspect_glb_bytes(glb({"nodes": [{}]}))

    def test_bad_length_rejected(self) -> None:
        payload = glb({"nodes": [{}], "animations": [{"channels": [{}]}]})
        with self.assertRaises(ValueError):
            module.inspect_glb_bytes(payload + b"x")


if __name__ == "__main__":
    unittest.main()
