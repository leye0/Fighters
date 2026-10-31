#!/usr/bin/env python3
"""Cold re-import of a Mixamo-upload FBX, rejecting static/unbound meshes."""
import bpy
import hashlib
import json
import math
import os
import sys
from mathutils import Vector

def fail(message):
    raise RuntimeError("MIXAMO_FBX_REIMPORT_FAILED: " + message)

args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
if len(args) != 1:
    fail("Expected a single FBX path")
path=args[0]
report=json.load(open(path+".json",encoding="utf8"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=path, use_anim=False)
bpy.context.view_layer.update()
rigs=[o for o in bpy.data.objects if o.type=="ARMATURE"]
if len(rigs)!=1: fail("Expected one armature, got "+str(len(rigs)))
rig=rigs[0]
if len(rig.data.bones)<15: fail("Skeleton lost deform bones")
meshes=[o for o in bpy.data.objects if o.type=="MESH" and o.find_armature()==rig]
if len(meshes)!=report["skinned_meshes"]:
    fail("Skinned mesh count mismatch: %d vs %d" % (len(meshes),report["skinned_meshes"]))
for mesh in meshes:
    if not mesh.vertex_groups: fail("Missing vertex weights on "+mesh.name)
    if not any(mod.type=="ARMATURE" and mod.object==rig for mod in mesh.modifiers):
        fail("Missing armature modifier on "+mesh.name)
coords=[obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
height=max(p.z for p in coords)-min(p.z for p in coords)
if not math.isfinite(height) or not 1.55 < height < 1.95:
    fail("Re-imported body scale is wrong: "+str(height))
if hashlib.sha256(open(path,"rb").read()).hexdigest()!=report["exported_sha256"]:
    fail("FBX SHA256 mismatch")
print("MIXAMO_FBX_REIMPORT_OK", json.dumps({
    "file": os.path.basename(path), "bones":len(rig.data.bones),
    "meshes":len(meshes), "height_m":round(height,4),
    "material_count":len(bpy.data.materials),
    "loaded_images":len(bpy.data.images),
}))
