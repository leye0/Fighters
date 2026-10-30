"""Offline validation for the Sketchfab staging audit (no network or credentials)."""

import importlib.util
import io
import json
import struct
import unittest
import zipfile
from pathlib import Path


IMPORTER = Path(__file__).resolve().parents[1] / "scripts" / "import-sketchfab-character.py"
SPEC = importlib.util.spec_from_file_location("sketchfab_import", IMPORTER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def make_zip(scene: bytes, name: str = "scene.gltf") -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(name, scene)
    return output.getvalue()


def scene(mesh=True, skin=True) -> bytes:
    return json.dumps({
        "asset": {"version": "2.0"},
        "meshes": [{}] if mesh else [],
        "skins": [{"joints": [0]}] if skin else [],
        "nodes": [{"mesh": 0, "skin": 0}] if mesh and skin else [],
    }).encode()


class SketchfabImportTests(unittest.TestCase):
    def audit(self, data: bytes):
        return MODULE.audit_zip(io.BytesIO(data))

    def test_selected_characters_are_exact_catalog_candidates(self):
        self.assertEqual(set(MODULE.CHARACTERS), {"claudia", "carla", "realistic-man"})
        self.assertEqual(MODULE.CHARACTERS["claudia"][0], "CHAR-CAND-006")
        self.assertEqual(MODULE.CHARACTERS["carla"][0], "CHAR-CAND-007")
        self.assertEqual(MODULE.CHARACTERS["realistic-man"][0], "CHAR-CAND-003")

    def test_audits_skinned_gltf(self):
        report = self.audit(make_zip(scene()))
        self.assertTrue(report["has_skinned_mesh"])
        self.assertEqual(report["scene_documents"][0]["skins"], 1)

    def test_flags_unrigged_model(self):
        self.assertFalse(self.audit(make_zip(scene(skin=False)))["has_skinned_mesh"])

    def test_reads_binary_glb_scene(self):
        document = scene()
        padding = (4 - len(document) % 4) % 4
        chunk = document + b" " * padding
        glb = b"glTF" + struct.pack("<II", 2, 20 + len(chunk))
        glb += struct.pack("<II", len(chunk), 0x4E4F534A) + chunk
        self.assertEqual(MODULE.read_gltf_document(glb, "scene.glb")["skins"], [{"joints": [0]}])
        self.assertTrue(self.audit(make_zip(glb, "scene.glb"))["has_skinned_mesh"])

    def test_rejects_traversal_paths(self):
        with self.assertRaisesRegex(RuntimeError, "Unsafe paths"):
            self.audit(make_zip(scene(), "../scene.gltf"))

    def test_rejects_archive_without_scene(self):
        with self.assertRaisesRegex(RuntimeError, "No glTF"):
            self.audit(make_zip(b"texture", "texture.png"))


if __name__ == "__main__":
    unittest.main()
