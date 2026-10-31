#!/usr/bin/env python3
"""Create synthetic, clearly NON-MIXAMO FBX motions to integration-test import.

Only for a private CI workspace. Never publish these as game assets and never
claim that a synthetic animation means Adobe Mixamo accepted a model.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Quaternion, Vector

MOTIONS=("Fighting_Idle","Walking_21","Walking_6","Walking_Backwards",
         "Left_Turn_3","Jump","Falling_Idle")

def check(ok,message):
    if not ok:raise RuntimeError("SYNTHETIC_PIPELINE_FIXTURE_FAILED: "+message)

def main(source,folder):
    check(os.path.isfile(source),"Missing original skinned FBX")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=source,use_anim=False)
    rigs=[o for o in bpy.data.objects if o.type=="ARMATURE"]
    check(len(rigs)==1,"Expected one imported armature")
    rig=rigs[0]
    meshes=[o for o in bpy.data.objects if o.type=="MESH" and o.find_armature()==rig]
    check(len(meshes)>0,"Fixture must contain real skinned meshes")
    active=[b for b in rig.pose.bones if b.bone.use_deform]
    check(len(active)>=20,"Need >=20 bones for animated smoke fixture")
    os.makedirs(folder,exist_ok=True)
    bpy.context.scene.render.fps=30
    bpy.context.scene.frame_start=1
    bpy.context.scene.frame_end=30
    for index,basename in enumerate(MOTIONS):
        if rig.animation_data:
            rig.animation_data_clear()
        rig.animation_data_create()
        action=bpy.data.actions.new("SYNTHETIC_TEST_ONLY_"+basename)
        rig.animation_data.action=action
        for i,bone in enumerate(active[:40]):
            bone.rotation_mode="QUATERNION"
            for frame,sign in ((1,0),(10,1),(20,-0.4),(30,0)):
                angle=(index+1)*0.09*(1+(i%7)/7)*sign
                bone.rotation_quaternion=Quaternion(Vector((0,0,1)),angle)
                bone.keyframe_insert(data_path="rotation_quaternion",frame=frame)
        bpy.context.scene.frame_set(1)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in [rig]+meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=rig
        out=os.path.join(folder,basename+".fbx")
        bpy.ops.export_scene.fbx(
            filepath=out,use_selection=True,object_types={"ARMATURE","MESH"},
            use_mesh_modifiers=False,use_armature_deform_only=True,
            add_leaf_bones=False,bake_anim=True,bake_anim_use_nla_strips=False,
            bake_anim_use_all_actions=False,bake_anim_force_startend_keying=True,
            bake_anim_simplify_factor=0,
            path_mode="COPY",embed_textures=True,
            axis_forward="-Z",axis_up="Y",
            apply_unit_scale=True,apply_scale_options="FBX_SCALE_NONE")
        check(os.path.isfile(out) and os.path.getsize(out)>3000,
              "FBX fixture export missing: "+out)
    # This marker is intentionally visible in every CI log. No demo imports
    # these files and no Github release/commit includes them.
    print("SYNTHETIC_ONLY_NOT_ADOBE_MIXAMO",json.dumps({
        "rig":rig.name,"bones":len(active),"clips":len(MOTIONS),
        "folder":folder
    }))

if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    check(len(args)==2,"Usage: blender ... -- input-upload.fbx synthetic-folder")
    main(*args)
