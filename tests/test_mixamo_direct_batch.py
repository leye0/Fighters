"""No Adobe credentials required. Fail-closed contract tests for direct-rig selection."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("fighters_mixamo_batch", ROOT/"scripts/mixamo-direct-batch.py")
batch=importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class FakeLocator:
    @property
    def first(self):
        return self

    def wait_for(self, timeout):
        pass


class FakePage:
    def __init__(self):
        self.page=0

    def goto(self, url, wait_until):
        assert "www.mixamo.com" in url
        self.page+=1

    def wait_for_load_state(self, kind, timeout):
        assert kind=="networkidle"

    def locator(self, key):
        return FakeLocator()


class DirectRigCatalogTest(unittest.TestCase):
    def test_exact_seven_original_adobe_identities(self):
        entries=batch.selected_catalog()
        self.assertEqual(len(entries),7)
        self.assertEqual([x[0] for x in entries],list(batch.MOTION_FILES))
        self.assertEqual(len({x["motionId"] for _,x in entries}),7)
        for name,meta in entries:
            self.assertTrue(meta["motionId"] and meta["originalTitle"] and meta["sourceDescription"],name)

    def test_same_title_different_walking_descriptions_select_correctly(self):
        walking=[(name,c) for name,c in batch.selected_catalog()
                 if name in ("Walking_21.fbx","Walking_6.fbx")]
        self.assertEqual([c["originalTitle"] for _,c in walking],["Walking","Walking"])
        candidates=[
            {"name":"Walking","description":"Feminine Walk Forward","numericId":"102",
             "outerHTML":"<p>Walking</p>"},
            {"name":"Walking","description":"Standard Walk","numericId":"101",
             "outerHTML":"<p>Walking</p>"},
        ]
        with patch.object(batch,"cards_on_page",return_value=candidates), patch.object(batch,"live_motion_metadata",side_effect=lambda m: m):
            self.assertEqual(batch.find_motion(FakePage(),*walking[0])[1]["numericId"],"101")
            self.assertEqual(batch.find_motion(FakePage(),*walking[1])[1]["numericId"],"102")

    def test_ambiguous_or_unmatched_motion_fails_closed(self):
        name,meta=batch.selected_catalog()[1]
        cards=[
            {"name":"Walking","description":"Ordinary Walk","numericId":"1","outerHTML":"no-uuid"},
            {"name":"Walking","description":"Ordinary Walk","numericId":"2","outerHTML":"no-uuid"},
        ]
        with patch.object(batch,"cards_on_page",return_value=cards), patch.object(batch,"live_motion_metadata",return_value=meta):
            with self.assertRaisesRegex(batch.MixamoBlocked,"No UNIQUE Adobe match"):
                batch.find_motion(FakePage(),name,meta)


    def test_adobe_description_drift_uses_live_api_for_exact_uuid(self):
        name, meta = batch.selected_catalog()[1]
        cards = [
            {"name":"Walking", "description":"Male Standard Walk", "numericId":"923", "outerHTML":"no-uuid"},
            {"name":"Walking", "description":"Feminine Walk Forward", "numericId":"674", "outerHTML":"no-uuid"},
        ]
        live={**meta,"sourceDescription":"Male Standard Walk"}
        with patch.object(batch,"cards_on_page",return_value=cards), patch.object(batch,"live_motion_metadata",return_value=live):
            self.assertEqual(batch.find_motion(FakePage(),name,meta)[1]["numericId"],"923")

    def test_public_api_uuid_response_identity_is_required(self):
        name, meta = batch.selected_catalog()[1]
        class Response:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,n):
                return ('{"id":"'+meta["motionId"]+'","name":"Walking","description":"Male Standard Walk"}').encode()
        with patch.object(batch,"urlopen",return_value=Response()):
            result=batch.live_motion_metadata(meta)
        self.assertEqual(result["sourceDescription"],"Male Standard Walk")
        self.assertEqual(result["motionId"],meta["motionId"])
        class WrongResponse(Response):
            def read(self,n):
                return b'{"id":"wrong","name":"Walking","description":"Male Standard Walk"}'
        with patch.object(batch,"urlopen",return_value=WrongResponse()):
            with self.assertRaisesRegex(batch.MixamoBlocked,"UUID/title differs"):
                batch.live_motion_metadata(meta)

    def test_catalog_does_not_depend_on_rig_names(self):
        first=[x["motionId"] for _,x in batch.selected_catalog()]
        second=[x["motionId"] for _,x in batch.selected_catalog()]
        self.assertEqual(first,second)
        self.assertTrue(batch.FILE_MAGIC.startswith(b"Kaydara FBX"))

    def test_auth_state_is_not_stored_under_git(self):
        with self.assertRaises(batch.MixamoBlocked):
            batch.private_folder(ROOT/"browser_profile")
        with self.assertRaises(batch.MixamoBlocked):
            batch.private_folder(ROOT/"work")


if __name__=="__main__":
    unittest.main()
