// Real end-of-battle/restart regression, separate from a QA-only reset():
// exercise the actual defeat/victory overlay and the Start button twice.
export async function runResetQa({evaluate,check,findWitchSite}){
  const qa='window.__fightersQA';
  const snapshot=()=>evaluate(`${qa}.snapshot()`);
  await evaluate(`${qa}.reset()`);
  let s=await snapshot();
  check(s.running&&s.chosenFaction==='witch'&&s.house.health===1500,
    'First match must start with the original Witch headquarters');

  const gardenSite=await findWitchSite('garden');
  check(gardenSite,'No garden site for the pending-job restart test');
  check(await evaluate(`${qa}.orderBuild('garden',${gardenSite.x},${gardenSite.z})`),
    'Could not create an unfinished construction before defeat');
  s=await snapshot();
  check(s.construction.length===1&&s.constructionPreviewCount===1,
    'The first match must have an actual visible unfinished preview');

  // Defeat the player with the genuine building-destruction code. This is
  // intentionally not qa.reset() or a manual running=false assignment.
  await evaluate(`${qa}.damageBuilding('witch-house-01',999999)`);
  s=await snapshot();
  check(!s.running&&s.house.destroyed&&
    await evaluate("document.querySelector('#overlay-title').textContent")==='DÉFAITE'&&
    await evaluate("document.querySelector('#overlay').hidden")===false,
    'Real defeat must stop the simulation and reveal the rematch overlay');

  // The player switches sides at the end screen, then starts from the same
  // button used by a real user (also resets audio and visual effects).
  await evaluate("document.querySelector('#choose-orc').click();document.querySelector('#start').click()");
  s=await snapshot();
  const expectedSecond={running:true,activeFaction:'orc',chosenFaction:'orc',
    houseHealth:1500,houseDestroyed:false,witches:3,orcs:4,buildings:8,
    construction:0,constructionPreviews:0,enemyBaseKnownToOrcs:false,
    witchGold:2000,orcGold:900,witchWood:250,orcWood:350,
    witchMagic:0,orcMagic:0};
  const actualSecond={running:s.running,activeFaction:s.activeFaction,
    chosenFaction:s.chosenFaction,houseHealth:s.house.health,
    houseDestroyed:s.house.destroyed,witches:s.witches.length,orcs:s.orcs.length,
    buildings:s.buildings.length,construction:s.construction.length,
    constructionPreviews:s.constructionPreviewCount,
    enemyBaseKnownToOrcs:s.fog.enemyBaseKnownToOrcs,
    witchGold:s.gold.witch,orcGold:s.gold.orc,witchWood:s.wood.witch,
    orcWood:s.wood.orc,witchMagic:s.souls.magic,orcMagic:s.souls.orcMagic};
  const mismatches=Object.entries(expectedSecond).filter(([field,value])=>actualSecond[field]!==value)
    .map(([field,value])=>`${field}: expected ${value}, got ${actualSecond[field]}`);
  check(!mismatches.length,'The second match must fully restore units, 3D buildings, fog, jobs and resources: '+mismatches.join('; '));
  check(await evaluate("document.querySelector('#overlay').hidden")===true&&
    s.selectedBuildingId!==null,'Restart must restore HUD selection and hide the overlay');

  // The same destroyed headquarters is a victory when controlling Orcs.
  await evaluate(`${qa}.damageBuilding('witch-house-01',999999)`);
  check(!(await snapshot()).running&&
    await evaluate("document.querySelector('#overlay-title').textContent")==='VICTOIRE',
    'Real Orc victory must end the second match');
  await evaluate("document.querySelector('#choose-witch').click();document.querySelector('#start').click()");
  s=await snapshot();
  check(s.running&&s.activeFaction==='witch'&&s.chosenFaction==='witch'&&
    s.house.health===1500&&!s.house.destroyed&&s.witches.length===3&&s.orcs.length===4&&
    s.buildings.length===8&&s.construction.length===0&&s.constructionPreviewCount===0&&
    s.gold.witch===2000&&s.wood.witch===250&&s.souls.magic===0&&
    !s.paused&&s.mining.completedMiningCycles===0,
    'The third match must start cleanly again without stale world or economy state');
  console.log('PASS MATCH LIFECYCLE: real defeat → Orc victory → Witch restart, previews and state clean');
}
