import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-player-actions.js');

const witch={id:'w',kind:'witch',dead:false,sx:60,sy:70};
const other={id:'w2',kind:'witch',dead:false,sx:82,sy:91};
const enemy={id:'orc',kind:'orc',dead:false,sx:120,sy:130};
const selected=new Set([witch]);
const state={running:true,paused:false,overlayHidden:true,
  ravenMoveMode:false,rallyMode:false,selectedBuilding:null,buildMode:null,
  attackMode:false,activeFaction:'witch',selected,selectedRaven:null};
const picks={raven:null,friend:null,unit:null,building:null,tree:null,log:null};
const ok={rally:true,build:true,sanctuary:true,repair:false,mine:false,
  harvest:false,attack:true,chop:false,collect:false};
const calls=[],pos={x:12,z:15};
let world=pos,viewportWidth=390,buildings=[];
const issue=(kind,result=true)=>(...args)=>{calls.push([kind,...args]);return result;};
const actions=create({
  getState:()=>state,worldPoint:()=>world,
  issueRavenMove:issue('ravenMove'),setRally:(...args)=>{calls.push(['rally',...args]);return ok.rally;},
  scheduleBuild:(...args)=>{calls.push(['build',...args]);return ok.build;},
  showBanner:issue('banner'),liveBuildings:()=>buildings,
  insideFootprint:()=>true,issueStoneCircleMove:(...args)=>{
    calls.push(['sanctuary',...args]);return ok.sanctuary;
  },
  pickRaven:()=>picks.raven,selectRaven:issue('selectRaven'),
  pickUnit:(_x,_y,hostile)=>hostile?picks.unit:picks.friend,
  pickBuilding:()=>picks.building,pickTree:()=>picks.tree,
  pickLogBundle:()=>picks.log,targetFaction:item=>item?.clanId||item?.faction,
  orderRepair:(...args)=>{calls.push(['repair',...args]);return ok.repair;},
  orderMine:(...args)=>{calls.push(['mine',...args]);return ok.mine;},
  orderHarvest:(...args)=>{calls.push(['harvest',...args]);return ok.harvest;},
  orderAttack:(...args)=>{calls.push(['attack',...args]);return ok.attack;},
  orderChop:(...args)=>{calls.push(['chop',...args]);return ok.chop;},
  orderCollectWood:(...args)=>{calls.push(['collect',...args]);return ok.collect;},
  selectUnits:issue('selectUnits'),selectBuilding:issue('selectBuilding'),
  selectEnemy:issue('selectEnemy'),
  issueMove:issue('move'),clearSelection:issue('clear'),
  getUnits:()=>[witch,other,enemy],screenPoint:unit=>({x:unit.sx,y:unit.sy}),
  getViewportWidth:()=>viewportWidth
});
const tap=(append=false)=>{calls.length=0;actions.tap(100,120,append);return calls;};
const kinds=()=>calls.map(call=>call[0]);

state.running=false;
assert.deepEqual(tap(),[],'inactive games ignore taps');
state.running=true;state.paused=true;
assert.deepEqual(tap(),[],'paused games ignore taps');
state.paused=false;state.overlayHidden=false;
assert.deepEqual(tap(),[],'overlay blocks taps');
state.overlayHidden=true;world=null;
assert.deepEqual(tap(),[],'out-of-world taps ignored');
world=pos;

state.ravenMoveMode=true;
assert.deepEqual(tap()[0],['ravenMove',pos]);
state.ravenMoveMode=false;state.rallyMode=true;ok.rally=false;
assert.deepEqual(kindsAfterTap(),['rally','banner']);
state.rallyMode=false;state.buildMode='garden';ok.build=false;
assert.deepEqual(kindsAfterTap(),['build','banner']);
state.buildMode=null;

// Sanctuary wins over a raven flying in front of the healing circle.
const sanctuary={type:'stone-circle',clanId:'witch',destroyed:false,hitbox:{}};
buildings=[sanctuary];picks.raven={id:'r1'};
assert.deepEqual(kindsAfterTap(),['sanctuary']);
buildings=[];
assert.deepEqual(kindsAfterTap(),['selectRaven']);
picks.raven=null;

// A selected fighter can attack an enemy house even when a friendly unit
// silhouette overlaps it. Repair/mining/harvesting are tried in order.
const enemyHouse={id:'enemy-house',clanId:'orcs',type:'barrack'};
picks.friend=witch;picks.building=enemyHouse;
assert.deepEqual(kindsAfterTap(),['repair','attack']);
assert.deepEqual(calls[1],['attack',[witch],enemyHouse]);
ok.repair=true;
assert.deepEqual(kindsAfterTap(),['repair']);
ok.repair=false;
picks.building={type:'mine',clanId:'neutral'};ok.mine=true;
assert.deepEqual(kindsAfterTap(),['repair','mine']);
ok.mine=false;picks.building={type:'garden',clanId:'witch'};ok.harvest=true;
assert.deepEqual(kindsAfterTap(),['repair','harvest']);
ok.harvest=false;picks.building=null;picks.unit={id:'foe',faction:'orcs'};
assert.deepEqual(kindsAfterTap(),['attack']);
assert.equal(calls[0][2],picks.unit);
picks.unit=null;picks.friend=null;picks.tree=4;ok.chop=true;
assert.deepEqual(kindsAfterTap(),['chop']);
ok.chop=false;picks.tree=null;picks.log=7;ok.collect=true;
assert.deepEqual(kindsAfterTap(),['collect']);
ok.collect=false;picks.log=null;

state.attackMode=true;
assert.deepEqual(kindsAfterTap(),['banner']);
assert.equal(calls[0][1],'CIBLE ENNEMIE REQUISE');
state.attackMode=false;
picks.friend=witch;
assert.deepEqual(tap(true),[['selectUnits',[witch],true]]);
picks.friend=null;selected.clear();
const friendlyHouse={id:'witch-house',clanId:'witch',type:'witch-house'};
picks.building=friendlyHouse;picks.unit={id:'overlapping-orc',faction:'orcs'};
assert.deepEqual(kindsAfterTap(),['selectBuilding'],
  'A hostile silhouette must not steal a click inside the allied house');
assert.equal(calls[0][1],friendlyHouse);
selected.add(witch);
assert.deepEqual(kindsAfterTap(),['repair','selectBuilding'],
  'With troops selected, an allied building must still beat an overlapping enemy');
state.attackMode=true;
assert.deepEqual(kindsAfterTap(),['repair','attack'],
  'Explicit attack mode must still target the hostile unit');
state.attackMode=false;
selected.clear();picks.unit=null;picks.building=enemyHouse;
assert.equal(kindsAfterTap().at(-1),'selectBuilding');
picks.building=null;picks.unit={id:'visible-foe',faction:'orcs'};
assert.deepEqual(kindsAfterTap(),['selectEnemy'],
  'An enemy tap without selected troops inspects the target, not the terrain');
picks.unit=null;
state.selectedRaven={id:'r1'};
assert.deepEqual(kindsAfterTap(),['ravenMove']);
state.selectedRaven=null;selected.add(witch);
assert.deepEqual(kindsAfterTap(),['move']);
selected.clear();
assert.deepEqual(kindsAfterTap(),['clear']);

// Mobile selection uses the silhouette radius and filters dead/enemies.
selected.add(witch);
calls.length=0;
actions.box({x:50,y:60},{x:75,y:80},false);
assert.deepEqual(calls,[['selectUnits',[witch,other],false]],
  'mobile 11px character bounds intersect the box');
viewportWidth=1000;calls.length=0;
actions.box({x:50,y:60},{x:75,y:80},true);
assert.deepEqual(calls,[['selectUnits',[witch],true]],
  'desktop 7px silhouette tolerance differs from mobile');
other.dead=true;viewportWidth=390;calls.length=0;
actions.box({x:50,y:60},{x:100,y:110},false);
assert.deepEqual(calls[0][1],[witch]);

function kindsAfterTap(){tap();return kinds();}
const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersPlayerActions.create('));
assert(game.includes('playerActions.tap(x,y,append)'));
assert(game.includes('playerActions.box(a,b,append)'));
assert(html.includes('src="./rts-player-actions.js"'));
console.log('PASS player target priority, building attack, mode precedence and box select');
