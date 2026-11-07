import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const placement=require('../app/rts-building-placement.js');
const footprint=require('../app/rts-footprint.js');
const walls=require('../app/rts-walls.js');

const rect=(x,z,w=2,h=w)=>footprint.shapeFromPolygons([[[
  [x-w/2,z-h/2],[x+w/2,z-h/2],
  [x+w/2,z+h/2],[x-w/2,z+h/2]
]]]);
const building=(id,clanId,x,z,type=clanId==='witch'?'witch-house':'barrack')=>({
  id,clanId,type,hitbox:rect(x,z),root:{position:{x,z}},destroyed:false
});
function fixture(){
  const units=[{kind:'witch',role:'worker',dead:false,root:{position:{x:-20,z:9}}},
    {kind:'orc',role:'worker',dead:false,root:{position:{x:19,z:18}}}];
  const buildings=[building('home','witch',-18,0),building('barrack','orcs',18,0)];
  const pendingBuilds=[],otherWalls=[];
  let forest=[],bushes=[],gold={witch:500,orc:500},wood={witch:200,orc:200};
  let circleAvailable=true,entranceClear=true,entranceExists=true;
  const arena={worldHalf:28,contains:(x,z,pad=0)=>
    Math.abs(x)<=28-pad&&Math.abs(z)<=28-pad};
  const navigatorRTS={
    obstacles:[],pointClear:()=>true,
    plan:()=>entranceExists?[{x:0,z:0}]:null,
    findSafeGoal:()=>({x:19,z:18})
  };
  class Navigator{
    constructor(config){this.config=config;}
    setObstacles(obstacles){this.obstacles=obstacles;}
    pointClear(){return entranceClear;}
    plan(){return entranceClear?[{x:0,z:0}]:null;}
  }
  const rules=placement.create({
    orcCosts:{hut:120,barrack:180,cauldron:200,factory:250,wall:32},
    getGold:()=>gold,getWood:()=>wood,units,isWorker:u=>u.role==='worker',
    arena,clearance:1,unitRadius:.38,navigatorRTS,Navigator,footprints:footprint,walls,
    getForestObstacles:()=>forest,getBushes:()=>bushes,
    liveBuildings:()=>buildings.filter(b=>!b.destroyed),pendingBuilds,
    wallNeighbours:()=>otherWalls,
    wallPlacement:(x,z,axis)=>({x,z,axis:axis||'x'}),
    buildShape:(type,x,z,axis)=>type==='wall'?walls.shape(x,z,axis):rect(x,z),
    circleUnlocked:()=>circleAvailable
  });
  return {rules,units,buildings,otherWalls,pendingBuilds,navigatorRTS,
    setForest:value=>{forest=value;},setBushes:value=>{bushes=value;},
    setTreasury:(g,w)=>{gold=g;wood=w;},
    setCircleAvailable:value=>{circleAvailable=value;},
    setEntranceClear:value=>{entranceClear=value;},
    setEntranceExists:value=>{entranceExists=value;}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.rules));
  assert.equal(placement.WITCH_BUILD_COST,230);
  assert.equal(placement.GARDEN_BUILD_COST,175);
  assert.equal(placement.STONE_BUILD_COST,260);
  assert.equal(f.rules.constructionCost('witch-house'),230);
  assert.equal(f.rules.constructionCost('garden'),175);
  assert.equal(f.rules.constructionCost('stone-circle'),260);
  assert.equal(f.rules.constructionCost('wall'),32);
  assert.equal(f.rules.constructionCost('unknown'),null);
  assert.equal(f.rules.constructionWood('wall'),10);
  assert.equal(f.rules.constructionWood('garden'),0);
  assert.equal(f.rules.constructionWood('factory'),130);
  assert.equal(f.rules.buildFaction('garden'),'witch');
  assert.equal(f.rules.buildFaction('stone-circle'),'witch');
  assert.equal(f.rules.buildFaction('hut'),'orc');
  assert.equal(f.rules.builderAvailable('witch'),true);
  assert.equal(f.rules.builderAvailable('orc'),true);
  f.units[0].dead=true;
  assert.equal(f.rules.builderAvailable('witch'),false);
  f.units[0].dead=false;f.units[0].role='melee';
  assert.equal(f.rules.builderAvailable('witch'),false);
  f.setTreasury({witch:174,orc:31},{witch:0,orc:9});
  assert.equal(f.rules.canAffordConstruction('witch','garden'),false);
  assert.equal(f.rules.canAffordConstruction('orc','wall'),false);
  f.setTreasury({witch:175,orc:32},{witch:0,orc:10});
  assert.equal(f.rules.canAffordConstruction('witch','garden'),true);
  assert.equal(f.rules.canAffordConstruction('orc','wall'),true);
  f.setTreasury({witch:900,orc:900},{witch:500,orc:500});
  assert.equal(f.rules.canAffordConstruction('witch','stone-circle'),true,
    'A new match uses current resources, not the old treasury');
}

{
  const f=fixture();
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),true);
  assert.equal(f.rules.validBuildPosition(-13,0,'garden'),true);
  assert.equal(f.rules.validBuildPosition(13,0,'unknown'),false);
  assert.equal(f.rules.validBuildPosition(-13,0,'stone-circle'),true);
  f.setCircleAvailable(false);
  assert.equal(f.rules.validBuildPosition(-13,0,'stone-circle'),false);
  assert.equal(f.rules.validBuildPosition(-13,0,'garden'),true,
    'The stone unlock does not affect gardens');
  assert.equal(f.rules.validBuildPosition(-13,0,'hut'),false,'Orcs stay on their X side');
  assert.equal(f.rules.validBuildPosition(13,0,'garden'),false,'Witches stay on theirs');
  assert.equal(f.rules.validBuildPosition(27.4,0,'hut'),false,'World edge clearance');
  assert.equal(f.rules.validBuildPosition(-27.4,0,'garden'),false);
  assert.equal(f.rules.validBuildPosition(3,24,'hut'),false,'New buildings need an ally');
}

{
  const f=fixture();
  f.setForest([rect(13,0)]);
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),false,'Trees block an actual footprint');
  f.setForest([]);
  f.setBushes([{x:13,z:0}]);
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),false,'Berries need an approach gap');
  f.setBushes([]);
  f.buildings.push(building('other','orcs',13,0));
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),false,'Existing buildings block placement');
  f.buildings.pop();
  f.pendingBuilds.push({type:'hut',site:{hitbox:rect(13,0)}});
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),false,'Pending work reserves ground');
  f.pendingBuilds.pop();
  f.units.push({kind:'orc',role:'melee',dead:false,root:{position:{x:13,z:0}}});
  assert.equal(f.rules.validBuildPosition(13,0,'hut'),false,'Living units block solid buildings');
  assert.equal(f.rules.validBuildPosition(-13,0,'garden'),true);
  f.units.at(-1).root.position.x=-13;
  assert.equal(f.rules.validBuildPosition(-13,0,'garden'),true,
    'Gardens allow an actor already standing on the cultivated ground');
  assert.equal(f.rules.validBuildPosition(-13,0,'stone-circle'),true,
    'Stone circles likewise allow workers inside');
}

{
  const f=fixture();
  assert.equal(f.rules.validBuildPosition(13,0,'wall','x'),true,
    'First wall may anchor at a nearby living village building');
  f.setEntranceClear(false);
  assert.equal(f.rules.wallKeepsVillageExit(walls.shape(13,0,'x')),false,
    'No new wall may seal all existing exits');
  assert.equal(f.rules.validBuildPosition(13,0,'wall','x'),false);
  f.setEntranceExists(false);
  assert.equal(f.rules.wallKeepsVillageExit(walls.shape(13,0,'x')),true,
    'A village that already lacks an exit has no new exit to preserve');
  f.setEntranceClear(true);f.setEntranceExists(true);
  f.otherWalls.push({x:13,z:0,axis:'x',hitbox:walls.shape(13,0,'x')});
  assert.equal(f.rules.validBuildPosition(13,0,'wall','x'),false,
    'Duplicate stone segments must not overlap');
  f.otherWalls.pop();
  f.pendingBuilds.push({type:'wall',x:13,z:0,axis:'x',
    site:{hitbox:walls.shape(13,0,'x')}});
  assert.equal(f.rules.validBuildPosition(13,0,'wall','x'),false,
    'Pending walls also obey axis compatibility');
  f.pendingBuilds.pop();
  assert.equal(f.rules.validBuildPosition(4,20,'wall','x'),false,
    'Remote isolated sections cannot float beyond village anchors');
}

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(entry.indexOf('src="./rts-building-placement.js"')<entry.indexOf('src="./game.js"'));
assert(game.includes('window.FightersBuildingPlacement.create({'));
assert(game.includes('return buildingPlacement.validBuildPosition(x,z,type,axis)'));
assert(!game.includes('function wallKeepsVillageExit('),
  'Village-exit policy must stay in the placement module');
console.log('PASS building placement: cost, reset, role, territory, polygon obstacles, walls, village exits and construction wiring');
