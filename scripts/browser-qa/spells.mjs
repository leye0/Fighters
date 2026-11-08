import {addOrcBuilding} from './orc-fixtures.mjs';

// The real autonomous cast path: upgrade a genuine building, expose a clearly
// superior visible enemy army, then let the game's 60 Hz spell phase choose.
export async function runSpellQa({evaluate,check}){
  const qa='window.__fightersQA';
  const snapshot=()=>evaluate(`${qa}.snapshot()`);

  // Witch director protects the level-three mother house with its own dome.
  await evaluate(`${qa}.reset()`);
  check(await evaluate(`${qa}.upgradeHouse()&&${qa}.upgradeHouse()`),
    'Cannot prepare level-three witch HQ for autonomous dome defense');
  await evaluate(`${qa}.advance(23)`);
  let s=await snapshot();
  check(s.house.level===3,'Autonomous witch dome fixture did not complete upgrades');
  check(await evaluate(`${qa}.spawnOrcSiege()`)>=4,
    'Autonomous witch dome fixture needs actual enemy siege units');
  // The siege helpers use real units and 3D paths. Place all orcs at a
  // navigable HQ perimeter so the superior force is in current fog sight.
  const orcCount=(await snapshot()).orcs.length;
  for(let i=0;i<orcCount;i++)check(await evaluate(`${qa}.placeUnitBesideBuilding('orc',${i},'witch-house-01')`),
    'Could not place an orc attacker in sight of the mother house');
  await evaluate(`${qa}.setMagic(100);${qa}.enableWitchAI(true);${qa}.advance(1.51)`);
  s=await snapshot();
  check(s.dome.active&&s.souls.magic<1,
    'The real witch director must cast its dome against a superior nearby army: '+
    JSON.stringify({dome:s.dome,magic:s.souls.magic,orcs:s.orcs.length}));
  await evaluate(`${qa}.advance(3.3)`);
  check(!(await snapshot()).dome.active,'Autonomous dome must release its 3D effect');

  // Orc director responds independently with fire rain from a level-three hut.
  await evaluate(`${qa}.reset()`);
  s=await snapshot();
  const hut=await addOrcBuilding(evaluate,'hut');
  check(hut,'No real hut available for autonomous fire-rain QA');
  check(await evaluate(`${qa}.upgradeBuilding(${JSON.stringify(hut.id)})&&`+
    `${qa}.upgradeBuilding(${JSON.stringify(hut.id)})`),
    'Cannot prepare level-three orc hut for autonomous fire defense');
  await evaluate(`${qa}.advance(23)`);
  s=await snapshot();
  check(s.buildings.find(b=>b.id===hut.id)?.level===3,
    'Autonomous orc fire-rain fixture did not complete upgrades');
  check(await evaluate(`${qa}.spawnWitches(10)`)===10,
    'Cannot assemble ten actual witch fighters for the orc fire-rain threat');
  for(let i=0;i<10;i++)check(await evaluate(
    `${qa}.placeUnitBesideBuilding('witch',${i},${JSON.stringify(hut.id)})`),
    'Could not place a visible attacking witch at the hut perimeter');
  await evaluate(`${qa}.setOrcMagic(100);${qa}.enableOrcAI(true);${qa}.advance(1.51)`);
  s=await snapshot();
  check(s.fireRain.active&&s.souls.orcMagic<1,
    'The real orc director must launch fire rain against a superior nearby army: '+
    JSON.stringify({fireRain:s.fireRain,magic:s.souls.orcMagic,witches:s.witches.length}));
  await evaluate(`${qa}.advance(4.6)`);
  check(!(await snapshot()).fireRain.active,'Autonomous fire rain must dispose of its instanced meshes');
  await evaluate(`${qa}.reset()`);
  console.log('PASS AUTONOMOUS SPELLS: witch dome and orc fire rain, real upgrades, threat, magic and GPU cleanup');
}
