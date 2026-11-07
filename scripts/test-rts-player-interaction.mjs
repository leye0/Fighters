import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../app/rts-player-interaction.js');
const {create:createActions}=require('../app/rts-player-actions.js');

const blank=()=>({buildMode:null,attackMode:false,rallyMode:false,
  ravenMoveMode:false,constructionTab:false,selectedBuilding:null,selectedRaven:null,selectedEnemy:null});
const snapshot=state=>({buildMode:state.buildMode,attackMode:state.attackMode,
  rallyMode:state.rallyMode,ravenMoveMode:state.ravenMoveMode,
  constructionTab:state.constructionTab,selectedBuilding:state.selectedBuilding,
  selectedRaven:state.selectedRaven,selectedEnemy:state.selectedEnemy});
const state=create(),another=create();
const house={id:'house',clanId:'witch'},raven={id:'r1'};
const enemyActor={id:'orc-2',kind:'orc'};
assert.deepEqual(snapshot(state),blank());
assert(Object.isFrozen(state),'only named transitions may mutate interaction state');
assert.notEqual(state,another,'each match/player gets independent state');

assert.equal(state.beginRally(),false,'rally requires a building selection');
state.openConstruction('basic');
assert.equal(state.constructionTab,'basic');
state.beginBuild('garden');
assert.equal(state.buildMode,'garden');
assert.equal(state.constructionTab,false);
state.beginAttack();
assert.equal(state.attackMode,true);
state.clearSelection();
assert.equal(state.buildMode,'garden','empty-space click does not cancel a build');
assert.equal(state.attackMode,true,'empty-space click does not cancel attack intent');
state.completeBuild();
assert.equal(state.buildMode,null);
state.completeAttack();

state.selectBuilding(house);
assert.equal(state.selectedBuilding,house);
assert.equal(state.beginRally(),true);
assert.equal(state.rallyMode,true);
state.beginBuild('stone-circle');
assert.equal(state.rallyMode,false,'building placement replaces rally placement');
state.beginRally();
assert.equal(state.buildMode,null,'rally replaces building placement');
state.completeRally();
assert.equal(state.rallyMode,false);
state.openConstruction('advanced');
state.closeConstruction();
assert.equal(state.constructionTab,false);
assert.throws(()=>state.openConstruction('invalid'),/Invalid construction tab/);

state.beginAttack();
state.selectRaven(raven);
assert.equal(state.selectedBuilding,null);
assert.equal(state.selectedRaven,raven);
assert.equal(state.attackMode,true,'raven selection does not cancel attack mode');
state.beginRavenMove();
state.completeRavenMove();
assert.equal(state.selectedRaven,raven,'raven remains selected after its order');
state.beginRavenMove();
state.clearSelection();
assert.equal(state.ravenMoveMode,false);
assert.equal(state.selectedRaven,null);
assert.equal(state.attackMode,true);

state.selectBuilding(house);
state.beginAttack();
state.beginRavenMove();
state.openConstruction('basic');
state.selectBuilding(house);
assert.equal(state.attackMode,false,'building selection cancels attack');
assert.equal(state.ravenMoveMode,false,'building selection cancels raven movement');
assert.equal(state.constructionTab,false);
assert.equal(state.forgetBuilding({id:house.id}),false,'selection uses object identity');
assert.equal(state.selectedBuilding,house);
assert.equal(state.forgetBuilding(house),true);
assert.equal(state.selectedBuilding,null,'destroyed building is forgotten');

state.selectEnemy(enemyActor);
assert.equal(state.selectedEnemy,enemyActor);
assert.equal(state.selectedBuilding,null);
assert.equal(state.forgetEnemy({id:enemyActor.id}),false);
assert.equal(state.forgetEnemy(enemyActor),true,'dead enemy must be forgotten');
state.selectEnemy(enemyActor);state.clearSelection();
assert.equal(state.selectedEnemy,null,'clear must discard inspection');

state.selectBuilding(house);
state.beginRally();
state.beginAttack();
state.beginRavenMove();
state.cancelTransient();
assert.deepEqual(snapshot(state),{...blank(),selectedBuilding:house},
  'Cancel/Escape leaves the selection intact');
state.reset();
assert.deepEqual(snapshot(state),blank());
assert.deepEqual(snapshot(another),blank(),'reset of one player cannot affect another');

// Integration with the actual tap priority controller: the read adapter sees
// each live mode change, not a snapshot captured when the app starts.
const selected=new Set(),friend={id:'witch-1',kind:'witch',dead:false};
const building={id:'house2',clanId:'witch'},enemy={id:'enemy',clanId:'orcs'};
const ordered=[];
let pickedBuilding=null,pickedFriend=null,repairResult=false;
const actions=createActions({
  getState:()=>({running:true,paused:false,overlayHidden:true,
    ravenMoveMode:state.ravenMoveMode,rallyMode:state.rallyMode,
    selectedBuilding:state.selectedBuilding,buildMode:state.buildMode,
    attackMode:state.attackMode,activeFaction:'witch',selected,
    selectedRaven:state.selectedRaven}),
  worldPoint:()=>({x:2,z:3}),
  issueRavenMove:pos=>{ordered.push(['raven',pos]);state.completeRavenMove();return true;},
  setRally:(target,pos)=>{ordered.push(['rally',target,pos]);state.completeRally();return true;},
  scheduleBuild:(type,x,z)=>{ordered.push(['build',type,x,z]);state.completeBuild();return true;},
  showBanner:message=>ordered.push(['banner',message]),
  liveBuildings:()=>[],insideFootprint:()=>false,issueStoneCircleMove:()=>false,
  pickRaven:()=>null,selectRaven:r=>state.selectRaven(r),
  selectEnemy:a=>state.selectEnemy(a),
  pickUnit:(_x,_y,hostile)=>hostile?null:pickedFriend,
  pickBuilding:()=>pickedBuilding,pickTree:()=>null,pickLogBundle:()=>null,
  targetFaction:b=>b.clanId,
  orderRepair:()=>{ordered.push(['repair']);return repairResult;},
  orderMine:()=>false,orderHarvest:()=>false,
  orderAttack:(_actors,target)=>{ordered.push(['attack',target]);state.completeAttack();return true;},
  orderChop:()=>false,orderCollectWood:()=>false,
  selectUnits:actors=>{state.clearSelection();selected.clear();actors.forEach(a=>selected.add(a));},
  selectBuilding:b=>{selected.clear();state.selectBuilding(b);},
  issueMove:pos=>ordered.push(['move',pos]),
  clearSelection:()=>{selected.clear();state.clearSelection();},
  getUnits:()=>[friend],screenPoint:()=>({x:20,y:20}),getViewportWidth:()=>390
});
const tap=()=>{ordered.length=0;actions.tap(20,20);return ordered;};

state.selectBuilding(building);
state.beginRally();
assert.deepEqual(tap(),[['rally',building,{x:2,z:3}]]);
assert.equal(state.rallyMode,false);
state.beginBuild('garden');
assert.deepEqual(tap(),[['build','garden',2,3]]);
assert.equal(state.buildMode,null);

selected.add(friend);
pickedBuilding=building;
repairResult=true;
assert.deepEqual(tap(),[['repair']],'repair is an immediate order, not a persistent mode');
repairResult=false;
pickedBuilding=enemy;
state.beginAttack();
assert.deepEqual(tap(),[['repair'],['attack',enemy]]);
assert.equal(state.attackMode,false);
pickedBuilding=null;
state.beginAttack();
assert.deepEqual(tap(),[['banner','CIBLE ENNEMIE REQUISE']]);
assert.equal(state.attackMode,true,'invalid attack retains intent');
state.cancelTransient();

state.selectRaven(raven);
state.beginRavenMove();
assert.deepEqual(tap(),[['raven',{x:2,z:3}]]);
assert.equal(state.ravenMoveMode,false);
assert.equal(state.selectedRaven,raven);
pickedFriend=friend;
assert.deepEqual(tap(),[],'friendly-unit selection changes state, no order');
assert.equal(state.selectedRaven,null);
assert.equal(selected.has(friend),true);

// The runtime adapter must preserve the state property names consumed by
// player actions, gesture mode checks, and QA snapshots.
const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersPlayerInteraction.create()'));
for(const name of ['buildMode','attackMode','rallyMode','ravenMoveMode',
  'constructionTab','selectedBuilding','selectedRaven']){
  assert(!new RegExp(`\\blet\\s+${name}\\b`).test(game),`${name} may not be a loose game.js flag`);
  assert(game.includes(`interaction.${name}`),`missing ${name} adapter`);
}
assert(game.includes('getInputModes:()=>({buildMode:interaction.buildMode'));
assert(game.includes('selectedBuilding:interaction.selectedBuilding'));
assert(html.includes('src="./rts-player-interaction.js"'));
console.log('PASS player interaction transitions, repairs, click priorities and live gesture adapters');
