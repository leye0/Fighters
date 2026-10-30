"""Test character source safety and GLB skin validation without disk or network."""

import importlib.util
import io
import json
import struct
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace


def load_script(name: str):
    script = Path(__file__).resolve().parents[1] / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SOURCE = load_script("prepare-character-source.py")
GLB = load_script("inspect-runtime-glb.py")


def binary_model(skinned: bool = True) -> bytes:
    document = {
        "asset": {"version": "2.0"},
        "meshes": [{}],
        "skins": [{"joints": [0]}] if skinned else [],
        "nodes": [{"mesh": 0, "skin": 0}] if skinned else [{"mesh": 0}],
    }
    raw = json.dumps(document).encode()
    raw += b" " * ((-len(raw)) % 4)
    return b"glTF" + struct.pack("<II", 2, 20 + len(raw)) + struct.pack("<II", len(raw), 0x4E4F534A) + raw


class InMemoryPath:
    def __init__(self, data: bytes):
        self.data = data

    def stat(self):
        return SimpleNamespace(st_size=len(self.data))

    def open(self, mode):
        assert mode == "rb"
        return io.BytesIO(self.data)


class PrepareCharacterTests(unittest.TestCase):
    def test_accepts_safe_archive_entries(self):
        entries = [zipfile.ZipInfo("scene.gltf"), zipfile.ZipInfo("textures/diffuse.png")]
        self.assertEqual(len(SOURCE.validate_entries(entries)), 2)

    def test_rejects_traversal(self):
        with self.assertRaisesRegex(ValueError, "Unsafe archive"):
            SOURCE.validate_entries([zipfile.ZipInfo("../scene.gltf")])

    def test_rejects_absolute_path(self):
        with self.assertRaisesRegex(ValueError, "Unsafe archive"):
            SOURCE.validate_entries([zipfile.ZipInfo("/scene.gltf")])

    def test_rejects_uncompressed_size_bomb(self):
        entry = zipfile.ZipInfo("scene.gltf")
        entry.file_size = SOURCE.MAX_UNCOMPRESSED_BYTES + 1
        with self.assertRaisesRegex(ValueError, "too large"):
            SOURCE.validate_entries([entry])

    def test_accepts_actual_rigged_glb(self):
        result = GLB.inspect_glb(InMemoryPath(binary_model()))
        self.assertEqual(result["skinned_nodes"], 1)
        self.assertEqual(result["skins"], 1)

    def test_rejects_unrigged_glb(self):
        with self.assertRaisesRegex(ValueError, "no skinned mesh"):
            GLB.inspect_glb(InMemoryPath(binary_model(False)))

    def test_rejects_bad_glb_length(self):
        with self.assertRaisesRegex(ValueError, "Invalid GLB"):
            GLB.inspect_glb(InMemoryPath(binary_model()[:-5]))


if __name__ == "__main__":
    unittest.main()
