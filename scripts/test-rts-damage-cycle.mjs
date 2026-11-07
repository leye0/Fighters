#!/usr/bin/env node
/** Damage transitions and exact callback ordering, without Three.js or DOM. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-damage-cycle.js');

const unit=(kind,id='unit-1',health=50)=>({kind,id,dead:false,health,
  maxHealth:health,stun:0,root:{position:{x:2,z:3}},
  destination:{x:5,z:5},attackOrder:{id:'target'},
  soulClaimed:true,soulReservedBy:'mage',selectionRing:{visible:true},
  ravenDistraction:{active:true}});
const building=(id,type='hut',clanId='orcs',health=100)=>({id,type,clanId,
  health,maxHealth:health,destroyed:false,initial:false,queue:['upgrade'],
  progress:.8,hitbox:{shape:'aabb'},healthBar:{visible:true},
  root:{parent:{remove(){}}}});

function fixture({otherBuildings=[],selectedBuilding=null}={}){
  const events=[],units=[];
  const witchBuilding=building('witch-hq','witch-house','witch',1500);
  witchBuilding.initial=true;
  const instances=new Map(otherBuildings.map(b=>[b.id,b]));
  const originalDelete=instances.delete.bind(instances);
  instances.delete=id=>{events.push('deleteBuilding:'+id);return originalDelete(id);};
  const selected={delete:a=>{events.push('deselect:'+a.id);return true;}};
  let chosen=selectedBuilding;
  const callback=(name)=> (...args)=>{events.push(name);};
  const api=create({isBuilding:target=>!!target?.hitbox,
    units,buildingInstances:instances,witchBuilding,selected,
    clearDomeFor:callback('clearDome'),
    removeBuildingModel:callback('removeModel'),
    hideBuildingHealthBar:b=>{if(b.healthBar)events.push('hideHealthBar');},
    removeRallyMarker:callback('removeRally'),
    forgetBuilding:b=>{events.push('forgetBuilding');return true;},
    drawBuildingSelection:callback('drawSelection'),
    cancelMineJob:a=>events.push('cancelMine:'+a.id),
    cancelFarmJob:a=>events.push('cancelFarm:'+a.id),
    cancelRepair:a=>events.push('cancelRepair:'+a.id),
    removeGarden:id=>events.push('removeGarden:'+id),
    releaseConstructedBuilding:callback('releaseModel'),
    syncWallJoints:callback('syncWalls'),
    updateNavObstacles:()=>{events.push('updateNavigation');},
    invalidateHud:callback('invalidateHud'),refreshHUD:callback('refreshHud'),
    endBattle:victory=>events.push('endBattle:'+victory),
    alertVillageUnderAttack:(b,attacker)=>
      events.push('alertVillage:'+b.health+':'+b.destroyed),
    showBuildingDamage:b=>events.push('showBuildingDamage:'+b.health),
    showBanner:value=>events.push('banner:'+value),
    selectedBuilding:()=>chosen,
    alertNearbyDefenders:(u,a)=>events.push('alertUnit:'+u.health),
    cancelSoulJob:a=>events.push('cancelSoul:'+a.id),
    cancelConstruction:a=>events.push('cancelConstruction:'+a.id),
    cancelWoodJob:a=>events.push('cancelWood:'+a.id),
    playOrcVoice:(name,pos)=>events.push('orcVoice:'+name),
    playWitchVoice:(name,pos)=>events.push('witchVoice:'+name),
    hideUnitSelection:a=>{events.push('hideRing');a.selectionRing.visible=false;},
    animation:(a,name,force)=>events.push('animation:'+name+':'+!!force),
    corpseSeconds:14});
  return {api,events,units,witchBuilding,instances,setSelected:b=>{chosen=b;}};
}

// A non-lethal hit alerts defenders BEFORE mutating health, then records the
// 240 ms stun and plays only the existing hit animation.
{
  const f=fixture(),target=unit('witch');
  f.api.dealDamage(target,20,null);
  assert.equal(target.health,30);assert.equal(target.stun,.24);
  assert.equal(target.dead,false);
  assert.deepEqual(f.events,['alertUnit:50','animation:Hit_Chest:true']);
}

// Death is irreversible; all job reservations are cancelled before the death
// voice, the selected unit loses its ring before Death01, and the orc receives
// the corpse only after the HUD refresh.
{
  const f=fixture(),victim=unit('witch','fallen',35),killer=unit('orc','killer');
  killer.orcFoodJob=null;
  f.api.dealDamage(victim,999,killer);
  assert.deepEqual(f.events,[
    'alertUnit:35','cancelSoul:fallen','cancelConstruction:fallen',
    'cancelWood:fallen','cancelFarm:fallen','witchVoice:destruction',
    'deselect:fallen','hideRing','animation:Death01:true','refreshHud']);
  assert.equal(victim.health,0);assert.equal(victim.stun,.24);
  assert.equal(victim.dead,true);assert.equal(victim.deadTime,14);
  assert.equal(victim.soulClaimed,false);assert.equal(victim.soulReservedBy,null);
  assert.equal(victim.destination,null);assert.equal(victim.attackOrder,null);
  assert.equal(victim.selectionRing.visible,false);
  assert.deepEqual(killer.orcFoodJob,{kind:'corpse',id:'fallen',progress:0});
  assert.equal(killer.ravenDistraction,null);
  f.events.length=0;
  f.api.dealDamage(victim,10,killer);
  assert.deepEqual(f.events,[],'Repeated hits cannot retrigger death events');
}

// Orc death has a distinct vocalization and cannot create a corpse meal.
{
  const f=fixture(),victim=unit('orc','orc-1',10),killer=unit('witch');
  f.api.dealDamage(victim,10,killer);
  assert(f.events.includes('orcVoice:loud'));
  assert(!f.events.some(x=>x.startsWith('witchVoice:')));
  assert.equal(killer.orcFoodJob,undefined);
}
// A dead/busy or wrong-faction attacker never earns an orc corpse meal.
for(const killer of [{kind:'orc',dead:true},{kind:'orc',dead:false,
  orcFoodJob:{kind:'hare'}},{kind:'witch',dead:false}]){
  const f=fixture(),victim=unit('witch','fallen',1);
  f.api.dealDamage(victim,1,killer);
  if(killer.kind==='orc'&&!killer.dead)assert.deepEqual(killer.orcFoodJob,{kind:'hare'});
  else assert.equal(killer.orcFoodJob,undefined);
}

// Building hits trigger the village alarm AFTER modifying health and before
// updating the bar, with only a selected surviving building refreshing HUD.
{
  const target=building('hut-1'),f=fixture({otherBuildings:[target],selectedBuilding:target});
  f.api.dealDamage(target,25,unit('witch'));
  assert.equal(target.health,75);
  assert.deepEqual(f.events,['alertVillage:75:false','showBuildingDamage:75','refreshHud']);
  f.setSelected(null);f.events.length=0;
  f.api.damageBuilding(target,5,null);
  assert.deepEqual(f.events,['alertVillage:70:false','showBuildingDamage:70']);
}

// Mines and neutral deposits are indestructible, including direct calls to
// destroyBuilding; already removed buildings cannot be hit a second time.
{
  const mine=building('ore','mine','neutral'),neutral=building('field','garden','neutral');
  const f=fixture({otherBuildings:[mine,neutral]});
  for(const target of [mine,neutral]){
    f.api.dealDamage(target,1000,null);
    f.api.destroyBuilding(target);
    assert.equal(target.health,100);assert.equal(target.destroyed,false);
  }
  assert.deepEqual(f.events,[]);
}

// Destruction must wipe the target in TWO passes: attack orders first, then
// worker reservations. Mesh removal precedes navigation cache rebuilding;
// the HUD refresh precedes endBattle on the last clan structure.
{
  const hut=building('orc-hut'),f=fixture({otherBuildings:[hut]});
  const targeter=unit('witch','targeter');
  targeter.attackOrder=hut;targeter.attack={target:hut};
  targeter.mineJob={mineId:hut.id};targeter.farmJob={gardenId:hut.id};
  targeter.healJob={id:hut.id};targeter.repairJob={buildingId:hut.id};
  f.units.push(targeter);
  f.api.damageBuilding(hut,999,null);
  assert.deepEqual(f.events,[
    'alertVillage:0:false','showBuildingDamage:0',
    'banner:BÂTIMENT DÉTRUIT','clearDome','removeModel','hideHealthBar',
    'removeRally','forgetBuilding','drawSelection',
    'cancelMine:targeter','cancelFarm:targeter','cancelRepair:targeter',
    'releaseModel','deleteBuilding:orc-hut','updateNavigation',
    'invalidateHud','refreshHud','endBattle:true']);
  assert.equal(hut.destroyed,true);assert.equal(hut.health,0);
  assert.deepEqual(hut.queue,[]);assert.equal(hut.progress,0);
  assert.equal(targeter.attackOrder,null);assert.equal(targeter.attack,null);
  assert.equal(targeter.healJob,null);
  assert.equal(f.instances.has(hut.id),false);
  f.events.length=0;
  f.api.damageBuilding(hut,10,null);f.api.destroyBuilding(hut);
  assert.deepEqual(f.events,[],'An already destroyed building is inert');
}

// A destroyed garden removes its crops before releasing its model. A wall
// recomputes joints. Neither changes the victory condition while an Orc HQ
// still lives, and even the last Orc wall is ignored for victory.
{
  const hq=building('barrack','barrack','orcs');hq.initial=true;
  const garden=building('garden','garden','witch');
  const wall=building('wall','wall','orcs');
  const f=fixture({otherBuildings:[hq,garden,wall]});
  f.api.destroyBuilding(garden);
  assert(f.events.indexOf('removeGarden:garden')<f.events.indexOf('releaseModel'));
  assert(!f.events.some(x=>x.startsWith('endBattle:')));
  f.events.length=0;
  f.api.destroyBuilding(wall);
  assert(f.events.includes('syncWalls'));
  assert(!f.events.some(x=>x.startsWith('endBattle:')));
  f.events.length=0;
  f.api.destroyBuilding(hq);
  assert.equal(f.events.at(-1),'endBattle:true');
}

// The Witch HQ remains the stable initial object. Destroying it always ends
// the match in defeat, AFTER the last HUD/navigation callbacks.
{
  const f=fixture();
  f.api.destroyBuilding(f.witchBuilding);
  assert.equal(f.witchBuilding.destroyed,true);
  assert.equal(f.events.at(-3),'invalidateHud');
  assert.deepEqual(f.events.slice(-2),['refreshHud','endBattle:false']);
}

const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(html.includes('rts-damage-cycle.js'));
assert(game.includes('window.FightersDamageCycle.create({'));
for(const fn of ['destroyBuilding(building)','damageBuilding(building,amount,attacker)'])
  assert(game.includes('return damageCycle.'+fn),fn+' should delegate to the domain');
assert(game.includes('const result=damageCycle.dealDamage(target,amount,attacker)')&&
  game.includes('target.damageBarTimer=2.4'),
  'The damage adapter must delegate to the domain before showing temporary health');
assert(game.includes('building.healthBar.fill.material.color.setHex(0x72cb6a)'),
  'The visual healthbar adapter must remain in game.js');
console.log('PASS damage cycle: health, voices, death, corpse reward, target cleanup, protected mines, callback order, victory and defeat');
