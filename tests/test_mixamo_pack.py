"""Synthetic binary GLB tests: all 63 approved motions, no duplicate donor meshes."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "pack-selected-mixamo.py"
spec = importlib.util.spec_from_file_location("selected_mixamo_pack", MODULE)
assert spec and spec.loader
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


def fixture_glb(reordered: bool = False, wrong_rig: bool = False) -> bytes:
    if reordered:
        nodes = [
            {"name": "Leg" if wrong_rig else "Arm"},
            {"name": "YBot", "children": [2]},
            {"name": "Hips", "children": [0]},
        ]
        hips, arm = 2, 0
    else:
        nodes = [
            {"name": "YBot", "children": [1]},
            {"name": "Hips", "children": [2]},
            {"name": "Arm"},
        ]
        hips, arm = 1, 2
    data = struct.pack("<ff", 0.0, 1.0) + struct.pack("<ffffffff", 0, 0, 0, 1, 0, .5, 0, .866)
    document = {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [1 if reordered else 0]}],
        "scene": 0,
        "nodes": nodes,
        "skins": [{"joints": [hips, arm]}],
        "buffers": [{"byteLength": len(data)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 8},
            {"buffer": 0, "byteOffset": 8, "byteLength": 32},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 2, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": 2, "type": "VEC4"},
        ],
        "animations": [{
            "name": "Source",
            "samplers": [{"input": 0, "output": 1, "interpolation": "LINEAR"}],
            "channels": [{"sampler": 0, "target": {"node": arm, "path": "rotation"}}],
        }],
    }
    return pack.write_glb(document, data)


def sources() -> tuple[list[dict], dict[str, bytes]]:
    rows, loaded = [], {}
    for i in range(63):
        name = "Fighting_Idle.fbx" if i == 0 else f"Motion_{i:02}.fbx"
        data = fixture_glb(reordered=bool(i % 2))
        loaded[name] = data
        rows.append({
            "filename": name, "motionId": f"motion-{i}",
            "sourceSha256": "a" * 64,
            "researchGlbSha256": hashlib.sha256(data).hexdigest(),
            "choice": "keep",
        })
    return rows, loaded


class PackSelectedMixamoTest(unittest.TestCase):
    def test_sixty_three_names_channels_and_rebound_bones(self):
        rows, loaded = sources()
        document, payload = pack.graft_animations(rows, loaded)
        parsed, binary = pack.parse_glb(payload)
        self.assertEqual(len(parsed["animations"]), 63)
        self.assertEqual([a["name"] for a in parsed["animations"]],
                         [r["filename"][:-4] for r in rows])
        self.assertEqual(parsed["buffers"][0]["byteLength"], len(binary))
        self.assertEqual(parsed["asset"]["extras"]["fightersSelectedMixamo"]["count"], 63)
        for animation, record in zip(parsed["animations"], rows):
            self.assertEqual(animation["extras"]["mixamoMotionId"], record["motionId"])
            self.assertEqual(animation["channels"][0]["target"]["node"], 2)
            sample = animation["samplers"][0]
            self.assertLess(sample["input"], len(parsed["accessors"]))
            self.assertLess(sample["output"], len(parsed["accessors"]))
        # Copy only keyframes, NOT geometry or 63 whole duplicated GLBs.
        self.assertLess(len(payload), 60000)

    def test_rejects_bad_hash_and_mismatched_rig(self):
        rows, loaded = sources()
        loaded["Motion_02.fbx"] = fixture_glb(reordered=True, wrong_rig=True)
        rows[2]["researchGlbSha256"] = hashlib.sha256(loaded["Motion_02.fbx"]).hexdigest()
        with self.assertRaisesRegex(ValueError, "Incompatible"):
            pack.graft_animations(rows, loaded)
        rows, loaded = sources()
        loaded["Motion_03.fbx"] += b"bad"
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            pack.graft_animations(rows, loaded)

    def test_rejects_missing_or_unselected_clips(self):
        rows, loaded = sources()
        del loaded["Motion_04.fbx"]
        with self.assertRaisesRegex(ValueError, "Missing converted"):
            pack.graft_animations(rows, loaded)
        rows, loaded = sources()
        rows[1]["choice"] = "reject"
        with self.assertRaisesRegex(ValueError, "Invalid selected"):
            pack.graft_animations(rows, loaded)
        with self.assertRaisesRegex(ValueError, "Exactly 63"):
            pack.graft_animations(rows[:-1], loaded)

    def test_rejects_invalid_glb_and_repo_local_output(self):
        with self.assertRaisesRegex(ValueError, "Invalid GLB"):
            pack.parse_glb(b"not a glb")
        with self.assertRaisesRegex(ValueError, "outside Fighters"):
            pack.safe_private_path(str(pack.ROOT / "assets"))


if __name__ == "__main__":
    unittest.main()
