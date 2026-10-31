#!/usr/bin/env python3
"""Strictly validate/stamp a GLB composed of seven same-rig Mixamo FBX motions.

Does not certify that Adobe produced the FBX: it validates the exported GLB's
internal structure and its real keyed skeletal motions. No YBot retargeting.
"""
import json
import math
import os
import struct
import sys
from pathlib import Path

EXPECTED = {
 "Fighters_Mixamo_Fighting_Idle",
 "Fighters_Mixamo_Walk_Standard",
 "Fighters_Mixamo_Walk_Feminine",
 "Fighters_Mixamo_Walk_Backward",
 "Fighters_Mixamo_Left_Turn_180",
 "Fighters_Mixamo_Jump",
 "Fighters_Mixamo_Fall",
}
MARKER="same-rig-mixamo-fbx-v1"
JSON_KIND=0x4E4F534A
BIN_KIND=0x004E4942
def require(test,message):
    if not test: raise RuntimeError("NATIVE_MIXAMO_GLB_REJECTED: "+message)
def load(raw):
    require(raw[:4]==b"glTF" and len(raw)>32,"Not a GLB2")
    version,size=struct.unpack_from("<II",raw,4)
    require(version==2 and size==len(raw),"Bad GLB length/version")
    jlen,jtag=struct.unpack_from("<II",raw,12)
    require(jtag==JSON_KIND and 20+jlen+8<=len(raw),"Missing JSON chunk")
    doc=json.loads(raw[20:20+jlen].decode())
    start=20+jlen
    blen,btag=struct.unpack_from("<II",raw,start)
    require(btag==BIN_KIND and start+8+blen==len(raw),"Missing BIN chunk")
    return doc,raw[start+8:]
def accessor(doc,blob,index):
    a=doc["accessors"][index]
    require(a.get("componentType")==5126 and not a.get("sparse"),"Expected float32 accessor")
    b=doc["bufferViews"][a["bufferView"]]
    require(b.get("buffer",0)==0,"Expected local GLB buffer")
    comps={"SCALAR":1,"VEC4":4}[a["type"]]
    n=a["count"];stride=b.get("byteStride",4*comps)
    offset=b.get("byteOffset",0)+a.get("byteOffset",0)
    require(0<n<10000 and offset+(n-1)*stride+4*comps<=len(blob),"Invalid accessor offset")
    return [struct.unpack_from("<"+"f"*comps,blob,offset+stride*i) for i in range(n)]

def inspect(doc,bin):
    nodes=doc.get("nodes",[])
    skins=doc.get("skins",[])
    require(nodes and skins and doc.get("meshes"),"No skinned mesh in character GLB")
    joints={i for skin in skins for i in skin.get("joints",[])}
    require(len(joints)>=15,"Not enough skin joints")
    require(any("skin" in n and "mesh" in n for n in nodes),"Missing weighted mesh binding")
    animations=doc.get("animations",[])
    names=[a.get("name") for a in animations]
    require(len(names)==len(EXPECTED) and set(names)==EXPECTED and len(names)==len(set(names)),
            "Exactly seven uniquely named Fighters motions required, found: "+str(names))
    report=[]
    for anim in animations:
        channels=anim.get("channels",[])
        rotated=set()
        dynamic=set()
        times=[]
        for ch in channels:
            require(ch["target"]["path"]=="rotation",
                    anim["name"]+" includes nonrotation channels (root motion must be physics-owned)")
            idx=ch["target"]["node"]
            require(idx in joints,
                    anim["name"]+" rotates a node outside the original skin joints")
            require(idx not in rotated,anim["name"]+" rotates one joint multiple times")
            rotated.add(idx)
            samp=anim["samplers"][ch["sampler"]]
            interp=samp.get("interpolation","LINEAR")
            require(interp in ("LINEAR","STEP","CUBICSPLINE"),
                    "Unsupported glTF skeletal keyframe interpolation: "+interp)
            t=accessor(doc,bin,samp["input"])
            all_values=accessor(doc,bin,samp["output"])
            # glTF CUBICSPLINE uses in-tangent, value, out-tangent triples
            # per keyframe; the tangents are not unit quaternions.
            if interp=="CUBICSPLINE":
                require(len(all_values)==3*len(t),
                        "Cubic source quaternion keyframes are truncated")
                v=all_values[1::3]
            else:
                require(len(all_values)==len(t),
                        "Source quaternion sample count differs from timeline")
                v=all_values
            require(len(t)>=2,"Missing meaningful joint keyframes")
            require(all(math.isfinite(k[0]) for k in t) and t[-1][0]>t[0][0],
                    "Invalid animation timeline")
            require(all(t[j][0]>=t[j-1][0] for j in range(1,len(t))),
                    "Unsorted animation timestamps")
            require(all(all(math.isfinite(f) for f in q) for q in v),"NaN/Inf quaternion")
            require(all(0.98<math.sqrt(sum(f*f for f in q))<1.02 for q in v),
                    "Non-unit authored rotation")
            # Quaternion sign equivalence: use absolute dot, not array delta.
            if any(abs(sum(a*b for a,b in zip(v[0],q)))<0.99995 for q in v[1:]):
                dynamic.add(idx)
            times.append(t[-1][0])
        require(len(rotated)>=15 and len(dynamic)>=6,
                anim["name"]+" is static or has insufficient actual skeletal motion: "+
                str((len(rotated),len(dynamic))))
        report.append({"name":anim["name"],"joint_tracks":len(rotated),
                       "dynamic_joints":len(dynamic),"duration":round(max(times),3)})
    return {"joints":len(joints),"skinned_meshes":sum("skin" in n and "mesh" in n for n in nodes),
            "animations":report}

def glb_bytes(doc,bin):
    j=json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()
    j+=b" " * ((-len(j))%4)
    b=bin+b"\0"*((-len(bin))%4)
    body=struct.pack("<II",len(j),JSON_KIND)+j+struct.pack("<II",len(b),BIN_KIND)+b
    return b"glTF"+struct.pack("<II",2,len(body)+12)+body

def main(argv):
    require(len(argv) in (1,2),"Usage: check-native-mixamo-glb.py file.glb [--stamp]")
    path=Path(argv[0])
    require(path.exists() and path.stat().st_size>1024,"GLB missing or empty")
    doc,blob=load(path.read_bytes())
    if len(argv)==2:
        require(argv[1]=="--stamp","Only --stamp is allowed")
        # Blender 4.0 emits separate auto-generated Armature|Scene animation
        # tracks in addition to the explicitly named seven NLA strips. Only
        # known Blender-generated scene tracks can be dropped; any unknown
        # clip is a hard error, never an implicit acceptance.
        import re
        extras=[]
        chosen=[]
        for animation in doc.get("animations",[]):
            name=animation.get("name","")
            if name in EXPECTED:
                chosen.append(animation)
            elif re.fullmatch(r"Armature(?:\.\d+)?\|Scene(?:\.\d+)?",name):
                extras.append(name)
            else:
                raise RuntimeError("Unexpected animation in GLB: "+name)
        require(len(chosen)==7 and len(set(x["name"] for x in chosen))==7,
                "Seven uniquely named authored clips must be present")
        doc["animations"]=chosen
        # Blender glTF force-sampling recreates translation and scale curves
        # for NLA clips even after non-rotation F-curves were deleted. The
        # kinematic game owns position and scale. Keep ONLY skinned bone
        # rotations, and remove auto-sampled armature object tracks.
        joints={i for skin in doc.get("skins",[]) for i in skin.get("joints",[])}
        skipped={}
        for anim in doc["animations"]:
            retained=[]
            dropped=[]
            for channel in anim.get("channels",[]):
                target=channel["target"]
                path=target["path"]
                require(path in ("rotation","translation","scale"),
                        "Unknown glTF animation property: "+path)
                if path=="rotation" and target["node"] in joints:
                    retained.append(channel)
                else:
                    dropped.append(path)
            anim["channels"]=retained
            skipped[anim["name"]]={
                "retained_skeletal_rotation_channels":len(retained),
                "removed_object_translation_or_scale_channels":len(dropped)
            }
        print("DROPPED_BLENDER_SCENE_TRACKS",json.dumps(extras))
        print("NATIVE_RIG_ROTATION_ONLY_CHANNELS",json.dumps(skipped))
    report=inspect(doc,blob)
    if len(argv)==2:
        for anim in doc["animations"]:
            anim.setdefault("extras",{})["retargeting"]=MARKER
        path.write_bytes(glb_bytes(doc,blob))
        require(inspect(*load(path.read_bytes()))==report,"Stamp changed clip structure")
    print("NATIVE_MIXAMO_GLTF_QA",json.dumps({
        "file":str(path),"stamped":len(argv)==2,
        "retargeting":"none: all seven clips already share their own skinned rig",
        **report
    }))
if __name__=="__main__":
    main(sys.argv[1:])
