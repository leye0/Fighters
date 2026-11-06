#!/usr/bin/env node
/** Soft RTS crowd steering: agents are not hard obstacles; buildings are. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {RADIUS,crowdPenalty,sweptCircleHit,freeForUnit,watchMovement,step,separate,formationGoals}=require('../docs/rts-unit-physics.js');
const {Navigator}=require('../docs/rts-navigation.js');
const unit=(id,x,z)=>({id,dead:false,root:{position:{x,z}}});
const nav=new Navigator({halfSize:28,radius:RADIUS});
nav.setObstacles([{minX:6,maxX:9,minZ:6,maxZ:9}]);

const mover=unit(1,0,0),blocker=unit(2,1,0);
assert(sweptCircleHit({x:0,z:0},{x:2,z:0},blocker.root.position),
 'Geometric overlap can be detected without being enforced as a hard wall');
assert(freeForUnit({x:0,z:0},{x:2,z:0},mover,[mover,blocker],nav),
 'Other units must NOT invalidate a traversable segment');
assert(!freeForUnit({x:5,z:7},{x:12,z:7},mover,[mover,blocker],nav),
 'Actual buildings remain solid obstacles');

// Open ground: soft steering prefers a lane around an idling neighbour.
const obstacle=unit(10,1,0),traveller=unit(11,0,0);
let p={x:0,z:0},sideDrift=0;
for(let i=0;i<150&&p.x<4.99;i++){
 const next=step(p,{x:5,z:0},.06,traveller,[traveller,obstacle],nav);
 assert(next,'Open-field movement must not be blocked by an idle unit');
 p=next;traveller.root.position.x=p.x;traveller.root.position.z=p.z;
 sideDrift=Math.max(sideDrift,Math.abs(p.z));
}
assert(p.x>4.7,'Crowd steering must eventually reach destination');
assert(sideDrift>.04,'Agent should favor a free lane rather than walking directly through a neighbor');

// A walk loop with negligible net displacement is not genuine progress. Give
// the engine time to retry forward movement, then surface a blocked command.
const stuck=unit(77,0,0),waypoint={x:5,z:0};
assert.equal(watchMovement(stuck,stuck.root.position,waypoint,1/60),0);
for(let stall=1;stall<=3;stall++){
  // Simulate tiny back-and-forth motions which look animated but go nowhere.
  for(let frame=0;frame<70;frame++){
    stuck.root.position.x=frame%2?.02:0;
    assert.equal(watchMovement(stuck,stuck.root.position,waypoint,1/60),0);
  }
  assert.equal(watchMovement(stuck,stuck.root.position,waypoint,.7),stall,
    'Stalled movement must be detected even while the character oscillates');
}
stuck.root.position.x=.8;
assert.equal(watchMovement(stuck,stuck.root.position,waypoint,1/60),0,
 'Meaningful physical progress must reset the stuck watchdog');
assert.equal(stuck.navWatch.stalls,0);
assert.equal(watchMovement(stuck,stuck.root.position,{x:-5,z:0},1/60),0,
 'A new waypoint must not inherit an older blocked command');

// Repeated replans and a moving enemy used to reset the timer every time;
// a character standing still could therefore walk in place indefinitely.
const chasing=unit(78,0,0);
for(let stall=1;stall<=3;stall++){
 let observed=0;
 for(let frame=0;frame<120;frame++){
  const movingTarget={x:5+frame*.025,z:Math.sin(frame*.08)*2};
  const result=watchMovement(chasing,chasing.root.position,movingTarget,1/60);
  observed=Math.max(observed,result);
 }
 assert.equal(observed,stall,
  'Moving waypoints must not hide repeated stalls on stationary units');
}
chasing.navWatch=null;
assert.equal(watchMovement(chasing,chasing.root.position,{x:10,z:0},1/60),0,
 'An explicit new command must restart the movement watchdog');
assert.equal(chasing.navWatch.stalls,0);

const pressed=unit(99,0,0),crowd=[pressed,...Array.from({length:4},(_,i)=>
 unit(100+i,.85,i*.28-.42))];
pressed.unstickSeconds=2;
const emergencyStep=step({x:0,z:0},{x:3,z:0},.08,pressed,crowd,nav);
assert(emergencyStep&&emergencyStep.x>.079&&Math.abs(emergencyStep.z)<1e-8,
 'A stuck unit must temporarily walk forward through soft crowd pressure');

// A narrow corridor has no free passing lane. Units must be able to overlap
// temporarily, instead of freezing at the mouth of the passage.
const corridor={
 segmentClear(a,b){return Math.abs(a.z)<.08&&Math.abs(b.z)<.08;},
 pointClear(p){return Math.abs(p.z)<.08;}
};
const standing=unit(20,1,0),passing=unit(21,0,0);
let q={x:0,z:0},overlapped=false;
for(let i=0;i<80&&q.x<2.99;i++){
 const next=step(q,{x:3,z:0},.05,passing,[passing,standing],corridor);
 assert(next,'Units should never deadlock in a narrow corridor');
 q=next;passing.root.position.x=q.x;passing.root.position.z=q.z;
 if(Math.abs(q.x-standing.root.position.x)<RADIUS*2)overlapped=true;
}
assert(q.x>2.9,'Temporarily overlapping a standing unit should allow passage');
assert(overlapped,'The test must actually exercise last-resort overlap');

// Idle units spread gradually in open ground without teleports or jitter.
const idle=Array.from({length:5},(_,i)=>unit(i+31,-5,-5));
for(let frame=0;frame<150;frame++){
 separate(idle,nav,RADIUS,1/60);
 for(const a of idle)assert(nav.pointClear(a.root.position),'Dispersion went through a solid wall');
}
let tightest=Infinity;
for(let i=0;i<idle.length;i++)for(let j=i+1;j<idle.length;j++)
 tightest=Math.min(tightest,Math.hypot(
  idle[i].root.position.x-idle[j].root.position.x,
  idle[i].root.position.z-idle[j].root.position.z));
assert(tightest>RADIUS*1.8,'Idle group did not spread to available free space');

// If terrain forbids separation, retain overlap instead of wall clipping.
const trapped=[unit(70,0,0),unit(71,0,0)];
const noLateralRoom={
 segmentClear(a,b){return a.x===b.x&&a.z===b.z;},
 pointClear(){return true;}
};
for(let i=0;i<30;i++)separate(trapped,noLateralRoom,RADIUS,1/60);
assert.equal(trapped[0].root.position.x,0,'Do not force apart through walls');
assert.equal(trapped[1].root.position.x,0,'Do not force apart through walls');
// The once-per-step conservative broadphase must yield bit-identical steering
// to the historical scan of EVERY unit for EACH candidate direction.
function referenceStep(from,destination,budget,agent,units,nav,radius=RADIUS){
 const dx=destination.x-from.x,dz=destination.z-from.z;
 const gap=Math.hypot(dx,dz);
 if(gap<1e-8||budget<=0)return null;
 const length=Math.min(budget,gap),ux=dx/gap,uz=dz/gap;
 const side=(agent?.id||0)%2===0?1:-1;
 const angles=[0,.22*side,-.22*side,.43*side,-.43*side,
  .68*side,-.68*side,1.02*side,-1.02*side];
 let best=null,bestScore=-Infinity;
 for(const angle of angles){
  const c=Math.cos(angle),v=Math.sin(angle);
  const end={x:from.x+length*(ux*c-uz*v),z:from.z+length*(ux*v+uz*c)};
  if(!nav.segmentClear(from,end))continue;
  const progress=(gap-Math.hypot(end.x-destination.x,end.z-destination.z))/length;
  const previewDistance=Math.min(gap,Math.max(length,radius*2.9));
  const preview={x:from.x+previewDistance*(ux*c-uz*v),
   z:from.z+previewDistance*(ux*v+uz*c)};
  const crowdNow=crowdPenalty(end,from,agent,units,radius);
  const crowdAhead=nav.segmentClear(from,preview)?
   crowdPenalty(preview,from,agent,units,radius):0;
  const landingWeight=Math.max(0,Math.min(1,(gap-.45)/1.25));
  const congestion=agent?.unstickSeconds>0?0:
   (crowdNow*.55+crowdAhead*1.25)*landingWeight;
  const score=progress*1.5-congestion-Math.abs(angle)*.10;
  if(score>bestScore){best=end;bestScore=score;}
 }
 return best;
}
const openNav={segmentClear:()=>true};
const indexedUnits=Array.from({length:60},(_,i)=>
 unit(200+i,(i%10)*.63-3,Math.floor(i/10)*.72-2));
for(let frame=0;frame<18;frame++){
 for(const actor of indexedUnits){
  const from=actor.root.position;
  const target={x:from.x+1.5+frame*.03,z:from.z+.6};
  const ordinary=referenceStep(from,target,.055,actor,indexedUnits,openNav,RADIUS);
  const accelerated=step(from,target,.055,actor,indexedUnits,openNav,RADIUS);
  assert.deepEqual(accelerated,ordinary,
   'Conservative crowd broadphase may not change movement direction');
  if(accelerated){from.x=accelerated.x;from.z=accelerated.z;}
 }
}
// Deaths and influence boundaries cannot accidentally suppress a nearby actor.
indexedUnits[3].dead=true;
for(const actor of indexedUnits.filter(a=>!a.dead)){
 const p=actor.root.position,to={x:p.x-2,z:p.z+1};
 assert.deepEqual(step(p,to,.05,actor,indexedUnits,openNav,RADIUS),
  referenceStep(p,to,.05,actor,indexedUnits,openNav,RADIUS));
}
// Twenty soldiers placed beside a blocked building/corner each need a
// DIFFERENT destination. Previously findSafeGoal snapped them to the same
// cell and the crowd-stirring algorithm orbited those duplicate goals forever.
const formation=Array.from({length:20},(_,i)=>unit(100+i,-20+i%5*.8,-20+Math.floor(i/5)*.8));
for(const destination of [{x:8,z:7},{x:26.8,z:26.8},{x:0,z:0},{x:-26,z:-26}]){
 const goals=formationGoals(formation,destination,nav);
 assert.equal(goals.length,formation.length);
 for(const goal of goals)assert(goal&&nav.pointClear(goal),
  'Formation has a blocked or missing destination at '+JSON.stringify(destination));
 for(let i=0;i<goals.length;i++)for(let j=i+1;j<goals.length;j++)
  assert(Math.hypot(goals[i].x-goals[j].x,goals[i].z-goals[j].z)>=1.20,
   'Multiple witches assigned the same point');
 const again=formationGoals(formation,destination,nav);
 assert.deepEqual(goals,again,'Group movement must assign stable deterministic slots');
}
console.log('PASS soft RTS crowds: reserved formations, escape from stalls, preferred lanes, dispersion and hard building walls.');
