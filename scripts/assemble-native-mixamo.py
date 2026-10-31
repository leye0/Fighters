#!/usr/bin/env python3
"""Assemble seven *native Mixamo-on-this-character* FBX animations in one GLB.

No retargeting is performed. All FBX files must be downloads for the SAME
uploaded humanoid, with SKIN. Their armatures must match exactly in hierarchy
and local bind/rest orientation. Incompatible clips fail closed.

blender -b --python-exit-code 1 --python scripts/assemble-native-mixamo.py -- \
  /private/claudia-mixamo-fbx /private/claudia-native.glb

Input basenames must match the seven existing Mixamo source labels. The output
has all seven Fighters_Mixamo_* animation names expected by Three.js.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

MOTIONS = (
    ("Fighting_Idle.fbx", "Fighters_Mixamo_Fighting_Idle"),
    ("Walking_21.fbx", "Fighters_Mixamo_Walk_Standard"),
    ("Walking_6.fbx", "Fighters_Mixamo_Walk_Feminine"),
    ("Walking_Backwards.fbx", "Fighters_Mixamo_Walk_Backward"),
    ("Left_Turn_3.fbx", "Fighters_Mixamo_Left_Turn_180"),
    ("Jump.fbx", "Fighters_Mixamo_Jump"),
    ("Falling_Idle.fbx", "Fighters_Mixamo_Fall"),
)

def insist(ok, message):
    if not ok:
        raise RuntimeError("MIXAMO_NATIVE_IMPORT_REJECTED: " + message)

def skinned_rig(items):
    rigged=[]
    for arm in (o for o in items if o.type=="ARMATURE"):
        meshes=[o for o in items if o.type=="MESH" and o.find_armature()==arm
                and any(mod.type=="ARMATURE" and mod.object==arm for mod in o.modifiers)
                and len(o.vertex_groups)>0]
        if meshes:
            rigged.append((arm,meshes))
    insist(len(rigged)==1, "expected exactly 1 skinned armature; found %d" % len(rigged))
    rig,meshes=rigged[0]
    insist(len(rig.data.bones)>=15, "rig with fewer than 15 bones")
    return rig,meshes

def signature(rig):
    # Compare bone parents and bind transforms, not mesh shapes or rig names.
    return {b.name: (b.parent.name if b.parent else None, b.matrix_local.copy())
            for b in rig.data.bones}

def assert_same_skeleton(base, other, name):
    a,b=signature(base),signature(other)
    insist(set(a)==set(b),name+" has incompatible bone names: missing="+
            str(sorted(set(a)-set(b))[:8])+" extra="+str(sorted(set(b)-set(a))[:8]))
    for bone in a:
        ap,am=a[bone]
        bp,bm=b[bone]
        insist(ap==bp, "%s parent changed at %s" % (name,bone))
        # Mixamo may rewrite FBX numerical precision, but a different bind pose
        # cannot be safely reused on a skinned mesh. Tolerance is in bone
        # local scene units, not fixed character metres.
        relative=(am.inverted_safe() @ bm)
        loc,rot,scale=relative.decompose()
        insist(loc.length<0.005 and rot.angle<0.008 and
               max(abs(v-1) for v in scale)<0.02,
               "%s different joint rest pose: %s" % (name,bone))

def animated_bones(action):
    insist(action is not None,"FBX has no animation action")
    return {p.split('"')[1] for f in action.fcurves
            for p in [f.data_path]
            if p.startswith('pose.bones["') and '"' in p[12:]}

def take_rigged_fbx(path):
    insist(os.path.isfile(path) and os.path.getsize(path)>2000,
           "missing Mixamo With Skin FBX: "+path)
    old=set(bpy.data.objects[:])
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    bpy.context.view_layer.update()
    new=set(bpy.data.objects[:])-old
    rig,meshes=skinned_rig(new)
    action=rig.animation_data.action if rig.animation_data else None
    animated=animated_bones(action)
    insist(len(animated)>=15,
           os.path.basename(path)+" has only %d animated bones; expected With Skin animation" %
           len(animated))
    insist(animated.issubset(set(rig.data.bones.keys())),
           "animation references bones missing from the skinned rig")
    frame_range=action.frame_range
    insist(frame_range[1]>frame_range[0] and frame_range[1]-frame_range[0]<1500,
           "empty or implausibly long animation range")
    return rig,meshes,new,action,animated

def main(folder,output):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    folder=os.path.abspath(folder)
    insist(os.path.isdir(folder),"source folder missing")
    base_rig=None
    base_meshes=None
    evidence=[]
    for index,(filename,clip_name) in enumerate(MOTIONS):
        rig,meshes,items,source,animated=take_rigged_fbx(os.path.join(folder,filename))
        if base_rig is None:
            base_rig,base_meshes=rig,meshes
            base_rig.animation_data_clear()
            base_rig.animation_data_create()
        else:
            assert_same_skeleton(base_rig,rig,filename)
        # Blender actions are keyed by bone name. Applying them to the original
        # imported rig is direct animation playback, NOT retargeting.
        action=source.copy()
        action.name=clip_name
        action.use_fake_user=True
        # The gameplay engine owns global movement. Preserve authentic bone
        # rotations (including arm swing) but omit translation and scale curves.
        removed=0
        for fc in list(action.fcurves):
            if not fc.data_path.startswith("pose.bones[") or not (
                fc.data_path.endswith(".rotation_quaternion") or
                fc.data_path.endswith(".rotation_euler") or
                fc.data_path.endswith(".rotation_axis_angle")):
                action.fcurves.remove(fc)
                removed+=1
        insist(len(animated_bones(action))>=15,
               filename+" has too few keyed bone rotations for native playback")
        track=base_rig.animation_data.nla_tracks.new()
        track.name=clip_name
        start=max(1,round(source.frame_range[0]))
        strip=track.strips.new(clip_name,start,action)
        strip.blend_type="REPLACE"
        strip.extrapolation="HOLD"
        strip.use_sync_length=True
        evidence.append({"source":filename,"clip":clip_name,
                         "original_anim_bones":len(animated),
                         "retained_rotation_bones":len(animated_bones(action)),
                         "nonrotation_channels_removed":removed,
                         "source_frames":[round(float(v),2) for v in source.frame_range]})
        if rig != base_rig:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in items:
                obj.select_set(True)
            bpy.ops.object.delete(use_global=False)
    insist(base_rig is not None and len(evidence)==7,
           "exactly seven same-rig FBX motions required")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [base_rig]+base_meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=base_rig
    os.makedirs(os.path.dirname(os.path.abspath(output)),exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output,export_format="GLB",use_selection=True,
        export_animations=True,export_nla_strips=True,
        export_force_sampling=True,export_frame_range=False,
        export_current_frame=False,export_skins=True,
        export_all_influences=True,
    )
    insist(os.path.getsize(output)>1024,"exported native gameplay GLB missing")
    print("MIXAMO_NATIVE_ASSEMBLY_OK",json.dumps({
        "output":output,
        "bones":len(base_rig.data.bones),"meshes":len(base_meshes),
        "animations":evidence,"skeleton_retarged":False
    }))

if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    insist(len(args)==2,
           "Usage: blender -b --python-exit-code 1 --python ... -- <7 FBX folder> <output.glb>")
    main(*args)
