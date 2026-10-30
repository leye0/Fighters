import assert from "node:assert/strict";
import test from "node:test";
import { mixamoBoneForRigBone } from "../src/render/character-motion.ts";

test("retarget map covers torso, legs and both arms despite exporter suffixes", () => {
  const source = new Set(["mixamorig:Hips_32", "mixamorig:Spine_21", "mixamorig:LeftArm_9",
    "mixamorig:RightArm_17", "mixamorig:LeftUpLeg_26", "mixamorig:RightFoot_29"]);
  assert.equal(mixamoBoneForRigBone("hip_02", source), "mixamorig:Hips_32");
  assert.equal(mixamoBoneForRigBone("spine_01_03", source), "mixamorig:Spine_21");
  assert.equal(mixamoBoneForRigBone("upperarm_l_024", source), "mixamorig:LeftArm_9");
  assert.equal(mixamoBoneForRigBone("upperarm_r_049", source), "mixamorig:RightArm_17");
  assert.equal(mixamoBoneForRigBone("upperleg_l_074", source), "mixamorig:LeftUpLeg_26");
  assert.equal(mixamoBoneForRigBone("foot_r_083", source), "mixamorig:RightFoot_29");
  assert.equal(mixamoBoneForRigBone("eyelid_l_017", source), undefined);
});
