#!/usr/bin/env python3
"""Prepare genuine skinned Sketchfab characters as upload-ready Mixamo FBX.

Run under Blender in background mode:
  blender -b -t 2 --python scripts/export-character-for-mixamo.py -- \
    /path/to/clean-original.glb /path/to/output.fbx

The game GLB is not modified. The FBX includes original mesh skin weights,
deform armature and embedded texture images, but NO baked Mixamo clips.
All scene scaling is inferred from visible model bounds (not named rigs).
"""
import bpy
import hashlib
import json
import math
import os
import sys
from mathutils import Matrix, Vector

def require(test, message):
    if not test:
        raise RuntimeError(message)

def world_bounds(objects):
    coords = [obj.matrix_world @ Vector(v) for obj in objects for v in obj.bound_box]
    require(coords, "No mesh bounding box")
    mins = [min(point[k] for point in coords) for k in range(3)]
    maxs = [max(point[k] for point in coords) for k in range(3)]
    return mins, maxs

def skinned_objects():
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    groups = []
    for rig in rigs:
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and
                  obj.find_armature() == rig and
                  any(mod.type == "ARMATURE" and mod.object == rig for mod in obj.modifiers)]
        if meshes:
            groups.append((rig, meshes))
    require(len(groups) == 1, "Expected exactly one skinned deform armature; got %d" % len(groups))
    rig, meshes = groups[0]
    require(len(rig.data.bones) >= 15, "Humanoid armature is incomplete")
    require(all(any(len(g) for g in [obj.vertex_groups]) for obj in meshes),
            "Mesh has no bone weights")
    return rig, meshes

def main(input_glb, output_fbx):
    require(os.path.exists(input_glb) and os.path.getsize(input_glb) > 1024, "No clean original GLB")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=input_glb)
    bpy.context.view_layer.update()

    rig, meshes = skinned_objects()
    # GlTF can carry source animations. Keep ONLY the original bind/skin,
    # never export a frame from a diagnostic or retargeted Mixamo clip.
    for obj in [rig] + meshes:
        obj.animation_data_clear()
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    mins, maxs = world_bounds(meshes)
    original_height = maxs[2] - mins[2]
    require(math.isfinite(original_height) and 0.1 < original_height < 1e6,
            "Invalid humanoid model height: %s" % original_height)
    # Original models have different source units (e.g., Renderpeople centimeters
    # versus Sketchfab metres). Normalize without touching ANY bone rotations.
    scale = 1.75 / original_height
    center_xy = ((mins[0]+maxs[0])/2, (mins[1]+maxs[1])/2)
    correction = Matrix.Scale(scale, 4) @ Matrix.Translation(
        Vector((-center_xy[0],-center_xy[1],-mins[2])))
    # Export only one skinned rig and its meshes. Keep the world-space transforms
    # and original armature modifiers intact when unlinking exporter-only parents.
    for obj in [rig] + meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    bpy.context.view_layer.update()
    for obj in [rig] + meshes:
        obj.matrix_world = correction @ obj.matrix_world
    bpy.context.view_layer.update()

    normalized_min, normalized_max = world_bounds(meshes)
    height = normalized_max[2] - normalized_min[2]
    require(1.72 < height < 1.78, "Scaling failed: %.4f m" % height)
    require(abs(normalized_min[2]) < 0.04, "Feet do not start near floor")
    # No Armature modifiers, missing weights or accidental static-mesh uploads.
    require(all(obj.find_armature() == rig for obj in meshes), "Lost skin/armature relationship")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [rig] + meshes:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.makedirs(os.path.dirname(os.path.abspath(output_fbx)), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=output_fbx,
        use_selection=True, object_types={"ARMATURE", "MESH"},
        use_mesh_modifiers=False,
        use_armature_deform_only=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="COPY", embed_textures=True,
        axis_forward="-Z", axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_NONE",
    )
    require(os.path.exists(output_fbx) and os.path.getsize(output_fbx) > 2048,
            "FBX export missing or empty")

    info = {
        "input_original_sha256": hashlib.sha256(open(input_glb,"rb").read()).hexdigest(),
        "file": os.path.basename(output_fbx),
        "exported_sha256": hashlib.sha256(open(output_fbx,"rb").read()).hexdigest(),
        "bytes": os.path.getsize(output_fbx),
        "blender_version": bpy.app.version_string,
        "armature": rig.name,
        "deforming_bones": len(rig.data.bones),
        "skinned_meshes": len(meshes),
        "weighted_meshes": [obj.name for obj in meshes],
        "rest_body_height_m": round(height,5),
        "source_to_meters_scale": round(scale,8),
        "embedded_texture_requested": True,
        "third_party_mixamo_mapping": "NOT CHECKED: requires an authenticated Adobe session",
    }
    manifest=output_fbx+".json"
    with open(manifest,"w",encoding="utf8") as f:
        json.dump(info,f,indent=2,ensure_ascii=False)
    print("MIXAMO_EXPORT_OK",json.dumps(info))

if __name__=="__main__":
    argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    require(len(argv)==2, "Usage: blender -b --python script.py -- clean.glb output.fbx")
    main(*argv)
