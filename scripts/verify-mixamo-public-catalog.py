#!/usr/bin/env python3
"""Verify that Fighters' seven exact source motions are visible in Mixamo's
public GET API. This is read-only: no credentials, uploads or exports.
Adobe does NOT offer a supported Mixamo developer API.
"""
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CATALOG = ROOT / "assets/mixamo-available-clips.json"
NAMES = ("Fighting_Idle", "Walking_21", "Walking_6",
         "Walking_Backwards", "Left_Turn_3", "Jump", "Falling_Idle")

def verify_one(filename, entry):
    motion_id = entry["motionId"]
    assert len(motion_id) == 36 and motion_id.count("-") == 4
    url = "https://www.mixamo.com/api/v1/products/" + motion_id + "?similar=0"
    req = urllib.request.Request(url, headers={"Accept":"application/json","X-Api-Key":"mixamo2"})
    with urllib.request.urlopen(req, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(filename + ": HTTP " + str(response.status))
        doc = json.loads(response.read(150000))
    if doc.get("id") != motion_id:
        raise RuntimeError(filename + ": incorrect Adobe motion ID")
    if doc.get("name","").lower().strip() != entry["originalTitle"].lower().strip():
        raise RuntimeError(filename + ": Adobe motion title differs: " + repr(doc.get("name")))
    # Adobe may update display copy (e.g. "Male Fight Idle Boxing Stance")
    # while preserving the immutable motion ID. Identity is the UUID, not
    # a brittle description string. Report text drift for human review.
    description_changed = (
        doc.get("description","").lower().strip() !=
        entry["sourceDescription"].lower().strip())
    if not isinstance((doc.get("details") or {}).get("gms_hash"), dict):
        raise RuntimeError(filename + ": no motion settings in public API")
    return {"local":filename,"name":doc["name"],"description":doc["description"],"id":motion_id,
            "catalog_description":entry["sourceDescription"],
            "description_changed":description_changed,"has_gms_hash":True}

def main():
    source = json.loads(CATALOG.read_text(encoding="utf8"))
    by_name = {c["filename"]:c for c in source["clips"]}
    verified = []
    for stem in NAMES:
        filename = stem + ".fbx"
        if filename not in by_name:
            raise RuntimeError("Missing catalog: " + filename)
        try:
            row=verify_one(filename, by_name[filename])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise RuntimeError("HTTP 429; STOP and respect Adobe's rate limit") from None
            raise RuntimeError(filename + " failed HTTP " + str(e.code)) from None
        verified.append(row)
        print("MIXAMO_PUBLIC_MOTION_VERIFIED",json.dumps(row),flush=True)
        time.sleep(0.6)
    if len({row["id"] for row in verified})!=len(NAMES):
        raise RuntimeError("Duplicate motion UUID")
    print("MIXAMO_PUBLIC_CATALOG_PASS",len(verified))

if __name__=="__main__":
    main()
