import test from "node:test";
import assert from "node:assert/strict";
import { isRuntimeFighter, runtimeRoster, type AssetRecord } from "../src/assets/eligibility.ts";

const valid: AssetRecord = {
  id:"f1",kind:"character",title:"Cleared original fighter",licenseClaim:"CC0",
  licenseStatus:"verified",redistributionStatus:"approved_for_game",
  integrationStatus:"integrated",likenessRightsStatus:"not_applicable",
  runtimeUrl:"/models/f1.glb",
};
test("unverified catalogue entries cannot appear as playable characters", () => {
  assert.equal(isRuntimeFighter({...valid,licenseStatus:"candidate_unverified"}),false);
  assert.equal(isRuntimeFighter({...valid,integrationStatus:"not_downloaded"}),false);
  assert.equal(isRuntimeFighter({...valid,redistributionStatus:"not_assessed"}),false);
});
test("public distribution and likeness rights are explicit gates", () => {
  assert.equal(isRuntimeFighter({...valid,likenessRightsStatus:undefined}),false);
  assert.equal(isRuntimeFighter({...valid,runtimeUrl:"https://external.example/f1.glb"}),false);
  assert.equal(isRuntimeFighter(valid),true);
});
test("CC BY assets require an in-game credit before integration", () => {
  assert.equal(isRuntimeFighter({...valid,licenseClaim:"CC BY 4.0"}),false);
  assert.equal(isRuntimeFighter({...valid,licenseClaim:"CC BY 4.0",attribution:"Artist — Source — CC BY 4.0"}),true);
});
test("roster preserves catalog order and ignores duplicate IDs", () => {
  assert.deepEqual(runtimeRoster([valid,{...valid,id:"f2"},{...valid,title:"duplicate"}]).map(x=>x.id),["f1","f2"]);
});
test("invalid model scale is rejected", () => {
  assert.equal(isRuntimeFighter({...valid,visual:{metersPerUnit:0}}),false);
  assert.equal(isRuntimeFighter({...valid,visual:{metersPerUnit:0.01}}),true);
});
