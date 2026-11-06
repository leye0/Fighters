import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-ai-commands.js');

const events=[],home={id:'witch-home',destroyed:false};
const buildings=new Map([['barrack',{id:'barrack',destroyed:false}],
  ['hut',{id:'hut',destroyed:false}]]);
const actor=(id,kind='orc',role='melee',x=0,z=0)=>({id,kind,role,dead:false,
  root:{position:{x,z}},destination:null,attackOrder:null,raiding:false,
  defenseTime:0,workerRetryTime:0});
const orc=actor('orc'),witch=actor('witch','witch');
let all=[orc,witch];
const commands=create({
  scheduleBuild:(...args)=>events.push(['build',...args]),
  queueOrder:(...args)=>events.push(['queue',...args]),
  buildingById:id=>buildings.get(id),witchBuilding:home,units:()=>all,
  isFighter:u=>u.role!=='worker',isWorker:u=>u.role==='worker',
  visibleAt:()=>true,exploredAt:()=>true,
  targetDistance:(a,b)=>Math.hypot(a.root.position.x-b.root.position.x,
    a.root.position.z-b.root.position.z),
  localDefensePost:()=>({x:1,z:2}),
  acknowledgeOrcAiOrder:actors=>events.push(['ack',actors.map(u=>u.id)]),
  beginRaid:u=>{u.raiding=true;events.push(['raid',u.id]);},
  cancelFoodJob:u=>{u.orcFoodJob=null;events.push(['food',u.id]);},
  cancelSoulJob:u=>{u.soulJob=null;events.push(['soul',u.id]);},
  orderRepair:(actors,b,opts)=>events.push(['repair',actors.map(u=>u.id),b.id,opts])
});

commands.orc([
  {type:'build',building:'hut',x:2,z:3,axis:'x'},
  {type:'train',buildingId:'barrack',role:'ranged'},
  {type:'upgrade',buildingId:'hut'},
  {type:'scout',unitId:'orc',x:6,z:5}
],{aliveOrcs:[orc],enemyBaseKnown:false});
assert(events.some(e=>e[0]==='build'&&e[4].byAI===true));
assert(events.some(e=>e[0]==='queue'&&e[2]==='orc'&&e[3]==='ranged'));
assert(events.some(e=>e[0]==='queue'&&e[2]==='upgrade'));
assert.deepEqual(orc.destination,{x:6,z:5});
assert.equal(orc.scouting,true);
assert.deepEqual(events.at(-1),['ack',['orc']]);

commands.orc([{type:'raid',unitIds:['orc']}],{aliveOrcs:[orc],enemyBaseKnown:true});
assert.equal(orc.attackOrder,home);
assert.equal(orc.raiding,true);
assert.equal(orc.destination,null);
assert(events.some(e=>e[0]==='food'&&e[1]==='orc'));
orc.raiding=false;orc.attackOrder=null;
commands.orc([{type:'defend',x:0,z:0}],{aliveOrcs:[orc],enemyBaseKnown:true});
assert.equal(orc.attackOrder,witch);
assert.equal(orc.defenseTime,24);
assert.deepEqual(orc.defenseAnchor,{x:1,z:2});

const worker=actor('worker','witch','worker');
const scout=actor('scout','witch');
const defender=actor('defender','witch');
all=[worker,scout,defender,orc];
commands.witch([
  {type:'build',building:'garden',x:1,z:2},
  {type:'train',buildingId:'witch-home',role:'worker'},
  {type:'upgrade',buildingId:'witch-home'},
  {type:'repair',buildingId:'witch-home'},
  {type:'scout',unitId:'scout',x:7,z:7}
],{aliveWitches:[worker,scout,defender],buildings:[home],enemyTarget:null});
assert(events.some(e=>e[0]==='repair'&&e[1][0]==='worker'&&e[3].byAI));
assert.deepEqual(scout.destination,{x:7,z:7});
assert.equal(scout.scouting,true);

const enemyBuilding={id:'orc-base',destroyed:false};
commands.witch([{type:'raid',targetId:'orc-base',unitIds:['scout']}],
  {aliveWitches:[worker,scout,defender],buildings:[home],enemyTarget:enemyBuilding});
assert.equal(scout.attackOrder,enemyBuilding);
assert.equal(scout.raiding,true);
commands.witch([{type:'defend',x:0,z:0}],
  {aliveWitches:[worker,defender],buildings:[home],enemyTarget:null});
assert.equal(defender.attackOrder,orc);
assert.equal(defender.defenseTime,24);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersAiCommands.create('));
assert(game.includes('aiCommands.orc(actions,{aliveOrcs,enemyBaseKnown})'));
assert(game.includes('aiCommands.witch(actions,{aliveWitches,buildings,enemyTarget})'));
assert(html.includes('src="./rts-ai-commands.js"'));
console.log('PASS Orc and Witch AI action execution, scouting, raids, defense and worker repair');
