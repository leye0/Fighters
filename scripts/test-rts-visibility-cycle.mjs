#!/usr/bin/env node
/** Fog source policy, clan memory and display decisions without Three.js. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-visibility-cycle.js');
const {FogGrid}=require('../app/rts-fog.js');

const unit=(kind,id,x,z,dead=false)=>({kind,id,dead,
  root:{position:{x,z},visible:false}});
const building=(id,clanId,type,x,z,health=100)=>({
  id,clanId,type,health,maxHealth:100,destroyed:false,
  hitbox:{minX:x-1,maxX:x+1,minZ:z-1,maxZ:z+1},
  root:{visible:false},healthBar:{root:{visible:false}}
});

// A centre-only discovery would lose irregular and wide buildings. Preserve
// all nine probes and their EXACT order, stopping after the first hit.
{
  const house=building('wide','orcs','barrack',1,2);
  const h=house.hitbox,midX=1,midZ=2;
  const probes=[[midX,midZ],[h.minX,midZ],[h.maxX,midZ],
    [midX,h.minZ],[midX,h.maxZ],[h.minX,h.minZ],[h.minX,h.maxZ],
    [h.maxX,h.minZ],[h.maxX,h.maxZ]];
  for(let n=0;n<=9;n++){
    const seen=[];
    const cycle=create({fogOfWar:{exploredAt:(x,z,clan)=>{
      seen.push([x,z,clan]);return n>0&&seen.length===n;
    }}});
    assert.equal(cycle.buildingInDiscoveredZone(house,'witch'),n>0);
    assert.deepEqual(seen,probes.slice(0,n||9).map(p=>[...p,'witch']));
  }
  const calls=[];
  const cycle=create({fogOfWar:{exploredAt:()=>{
    calls.push('called');return true;
  }}});
  assert.equal(cycle.buildingInDiscoveredZone({hitbox:null},'witch'),false);
  assert.deepEqual(calls,[],'Buildings without footprints must remain unseen');
}

function fixture(){
  const fogOfWar=new FogGrid({halfSize:28,cellSize:.5,radius:7.5,fade:1.25});
  const events=[],units=[],buildings=[];
  const knownEnemyBuildings={witch:new Set(),orc:new Set()};
  const discovered=(clan,id)=>{events.push(`learn:${clan}:${id}`);};
  for(const clan of ['witch','orc']){
    const set=knownEnemyBuildings[clan],add=set.add.bind(set);
    set.add=id=>{discovered(clan,id);return add(id);};
  }
  const update=fogOfWar.update.bind(fogOfWar);
  fogOfWar.update=(clan,sources)=>{
    events.push('fog:'+clan);
    events.push('sources:'+clan+':'+sources.map(s=>s.x+','+s.z).join('|'));
    return update(clan,sources);
  };
  let faction='witch',selected=null,ravenLoaded=false;
  let pendingBuilds=[],uploads=[];
  const visibility=create({fogOfWar,knownEnemyBuildings,units,
    liveBuildings:()=>buildings.filter(b=>!b.destroyed),
    getFaction:()=>faction,getSelectedBuilding:()=>selected,
    getPendingBuilds:()=>pendingBuilds,
    buildFaction:type=>type==='garden'?'witch':'orcs',
    ravenReady:()=>ravenLoaded,
    ravenSightSources:()=>{
      events.push('ravenSources');return [{x:9,z:9,radius:3.1}];
    },
    setActorVisible:(actor,visible)=>{
      events.push('actor:'+actor.id+':'+visible);actor.root.visible=visible;
    },
    setBuildingVisible:(b,visible)=>{
      events.push('building:'+b.id+':'+visible);
      if(b.root)b.root.visible=visible;
    },
    setBuildingHealthBarVisible:(b,visible)=>{
      events.push('bar:'+b.id+':'+visible);b.healthBar.root.visible=visible;
    },
    setPreviewVisible:(job,visible)=>{
      events.push('preview:'+job.id+':'+visible);job.preview.root.visible=visible;
    },
    uploadFogTexture:clan=>{
      events.push('upload:'+clan);
      uploads.push({clan,data:fogOfWar.textureData(clan)});
    }});
  return {fogOfWar,units,buildings,events,uploads,knownEnemyBuildings,visibility,
    setFaction:value=>{faction=value;},setSelected:value=>{selected=value;},
    setRavens:value=>{ravenLoaded=value;},setJobs:value=>{pendingBuilds=value;}};
}

// Source ordering and clan ownership: soldiers first, then completed allied
// buildings. Dead actors, neutral mines, walls and enemy structures are excluded.
{
  const f=fixture(),witch=unit('witch',1,-18,-14);
  const dead=unit('witch',2,0,0,true),orc=unit('orc',3,22,21);
  const home=building('home','witch','witch-house',-18,-14);
  const garden=building('garden','witch','garden',-16,-14);
  const wall=building('wall','witch','wall',-16,-17);
  const mine=building('mine','witch','mine',-14,-13);
  const neutral=building('neutral','neutral','mine',-17,-11);
  const barrack=building('barrack','orcs','barrack',22,21);
  const noHitbox={id:'missing',clanId:'witch',type:'hut',hitbox:null};
  f.units.push(witch,dead,orc);
  f.buildings.push(home,garden,wall,mine,neutral,barrack,noHitbox);
  assert.deepEqual(f.visibility.groundSightSources('witch'),[
    {x:-18,z:-14},{x:-18,z:-14},{x:-16,z:-14}]);
  assert.deepEqual(f.visibility.groundSightSources('orc'),[
    {x:22,z:21},{x:22,z:21}]);
  assert.deepEqual(f.visibility.groundSightSources('witch',[barrack,home]),[
    {x:-18,z:-14},{x:-18,z:-14}],
    'Explicit building snapshots must not reload the living registry');
  home.destroyed=true;
  assert.deepEqual(f.visibility.groundSightSources('witch'),[
    {x:-18,z:-14},{x:-16,z:-14}],
    'Default sources must read current buildings after destruction');
}

// The witch scout reveals an Orc HQ. Orc exploration remains isolated; a
// second tick keeps the HQ remembered even after the scout walks away.
{
  const f=fixture();
  const home=building('witch-house','witch','witch-house',-18,-14);
  const orcBase=building('orc-hq','orcs','barrack',22,21);
  const mine=building('mine','neutral','mine',21,20);
  const distant=building('outside','orcs','hut',0,-23);
  const witch=unit('witch',1,-18,-14),scout=unit('witch',2,22,21);
  const orc=unit('orc',3,22,21),hiddenOrc=unit('orc',4,0,-23);
  f.units.push(witch,scout,orc,hiddenOrc);
  f.buildings.push(home,orcBase,mine,distant);
  orcBase.health=72;
  f.setJobs([{id:'witch-preview',type:'garden',x:-17,z:-14,
    preview:{root:{visible:false}}},
    {id:'orc-preview',type:'hut',x:0,z:-23,preview:{root:{visible:false}}},
    {id:'no-preview',type:'garden',x:1,z:1}]);
  f.visibility.updateVision();
  assert(f.knownEnemyBuildings.witch.has('orc-hq'));
  assert(!f.knownEnemyBuildings.witch.has('mine'));
  assert(!f.knownEnemyBuildings.witch.has('outside'));
  assert(!f.knownEnemyBuildings.orc.has('witch-house'),
    'Orc memory must not inherit Witch scouting');
  assert(orc.root.visible,'Orc located in Witch-explored terrain is visible');
  assert(!hiddenOrc.root.visible,'Unknown enemies remain hidden');
  assert(home.root.visible&&orcBase.root.visible);
  assert(home.healthBar.root.visible===false);
  assert(orcBase.healthBar.root.visible,
    'A wounded, discovered enemy building keeps its health bar');
  assert(!distant.root.visible&&!distant.healthBar.root.visible);
  assert(f.visibility.visibleToPlayer(22,21));
  assert.equal(f.uploads.length,1);
  assert.equal(f.uploads[0].clan,'witch');
  assert.strictEqual(f.uploads[0].data,f.fogOfWar.textureData('witch'));
  assert.equal(f.events[0],'fog:witch');
  assert(f.events.indexOf('fog:orc')>f.events.indexOf('fog:witch'));
  assert(f.events.indexOf('actor:1:true')>f.events.indexOf('fog:orc'));
  assert(f.events.indexOf('building:orc-hq:true')>f.events.indexOf('actor:4:false'));
  assert.equal(f.events.at(-1),'upload:witch',
    'GPU upload must follow BOTH clan updates and all visibility decisions');
  assert(f.events.includes('preview:witch-preview:true'));
  assert(f.events.includes('preview:orc-preview:false'));

  scout.root.position.x=-18;scout.root.position.z=-14;
  orcBase.health=100;
  f.setSelected(orcBase);
  f.events.length=0;
  f.visibility.updateVision();
  assert(orc.root.visible,'The discovered location remains visible after a scout leaves');
  assert(f.knownEnemyBuildings.witch.has('orc-hq'));
  assert(orcBase.healthBar.root.visible,'Selected discovered building shows full health');
  assert.equal(f.fogOfWar.visibleAt(22,21,'witch'),false,
    'Live sight and permanent exploration must remain distinct');
  f.setFaction('orc');f.setSelected(null);
  f.visibility.updateVision();
  assert.equal(f.uploads.at(-1).clan,'orc');
  assert.equal(f.visibility.visibleToPlayer(-18,-14),false);
  assert.equal(home.root.visible,false,'An unexplored enemy HQ must stay hidden');
  assert.equal(orcBase.root.visible,true,'The local Orc HQ remains visible');
  assert.equal(orcBase.healthBar.root.visible,false,
    'Undamaged unselected allied buildings hide their health bars');

  // The reset owns both buffers and enemy sets; visibility must never retain
  // references to old snapshots when starting a fresh match.
  f.fogOfWar.reset();f.knownEnemyBuildings.witch.clear();
  f.knownEnemyBuildings.orc.clear();
  f.setFaction('witch');scout.dead=true;
  f.visibility.updateVision();
  assert(!f.knownEnemyBuildings.witch.has('orc-hq'));
  assert.equal(orcBase.root.visible,false);
  assert.equal(orc.root.visible,false);
}

// Ravens reveal only their owner's actual fog grid, never ground-sight
// sources (which the minimap uses to hide exact bird positions).
{
  const f=fixture();
  const witch=unit('witch',1,-18,-14),orc=unit('orc',2,22,21);
  f.units.push(witch,orc);
  f.visibility.updateVision();
  assert.equal(f.fogOfWar.exploredAt(9,9,'witch'),false);
  f.setRavens(true);f.events.length=0;
  f.visibility.updateVision();
  assert.equal(f.events.filter(e=>e==='ravenSources').length,1,
    'Raven sources must be queried once for Witches and never for Orcs');
  assert(f.fogOfWar.exploredAt(9,9,'witch'));
  assert(!f.fogOfWar.exploredAt(9,9,'orc'));
  assert(!f.visibility.groundSightSources('witch').some(s=>s.x===9&&s.z===9));
  assert(f.fogOfWar.sample(9,9,'witch').visible>.2);
}

// Previews must use the current, replaceable job collection on each update;
// missing previews are skipped. Their visibility follows exploration or owner.
{
  const f=fixture();
  const first={id:'first',type:'hut',x:0,z:0,preview:{root:{visible:false}}};
  f.setJobs([first,{id:'missing',type:'garden',x:0,z:0}]);
  f.visibility.updateVision();
  assert.equal(first.preview.root.visible,false);
  const second={id:'second',type:'garden',x:20,z:20,
    preview:{root:{visible:false}}};
  f.setJobs([second]);f.events.length=0;
  f.visibility.updateVision();
  assert.deepEqual(f.events.filter(x=>x.startsWith('preview:')),
    ['preview:second:true']);
}

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(html.includes('src="./rts-visibility-cycle.js"'));
assert(game.includes('window.FightersVisibilityCycle.create({'));
for(const method of ['buildingInDiscoveredZone(building,clan)',
  'groundSightSources(clan,structures)','updateVision()',
  'visibleToPlayer(x,z)'])
  assert(game.includes('return visibilityCycle.'+method),method+' must delegate');
assert(game.includes('fogTexture.image.data=fogOfWar.textureData(clan)'));
assert(game.includes('fogTexture.needsUpdate=true'));
assert(game.includes('const minimapRenderer=window.FightersMinimap.create('),
  'Minimap canvas rendering must remain independently wired');
console.log('PASS visibility cycle: nine perimeter probes, both clan grids, ground/raven sight, persistent memory, bars, previews, GPU ordering and reset');
