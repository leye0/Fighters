import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-picking.js');

const viewport={clientWidth:1000,getBoundingClientRect:()=>({left:0,top:0,width:200,height:200})};
const friendly={id:1,kind:'witch',dead:false,root:{position:{x:0,z:0}}};
const enemy={id:2,kind:'orc',dead:false,root:{position:{x:3,z:0}}};
const units=[friendly,enemy];
const bird={id:'crow',x:2,y:1,z:0};
const trees=[{x:-5,z:0,height:3,felled:false},{x:7,z:0,height:2,felled:true}];
const woodDeposits=new Map([[0,{amount:4}]]);
const house={id:'house',root:{visible:true},hitbox:{minX:4,maxX:5,minZ:4,maxZ:5}};
let faction='witch',canSee=true,hasRavens=true;
const picking=create({
  viewport,project:(x,y,z)=>({x:x/10,y:y/10,z:0}),
  units:()=>units,ravens:()=>[bird],ravensReady:()=>hasRavens,
  trees:()=>trees,woodDeposits:()=>woodDeposits,buildings:()=>[house],
  activeFaction:()=>faction,visible:()=>canSee,
  inside:(p,b)=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value))
});

assert.equal(picking.unit(100,90),friendly,'own unit selectable on projected body');
assert.equal(picking.unit(130,90),null,'enemy not selectable with friendly-only picking');
assert.equal(picking.unit(130,90,true),enemy,'enemy selectable as an attack target');
canSee=false;
assert.equal(picking.unit(100,90,true),friendly,'own unit selectable through fog refresh');
assert.equal(picking.unit(130,90,true),null,'unseen enemies cannot be targeted');
canSee=true;
assert.equal(picking.unit(139,90),null,'desktop silhouette touch radius remains narrow');
viewport.clientWidth=390;
assert.equal(picking.unit(139,90),friendly,'mobile radius remains accessible');
viewport.clientWidth=1000;
assert.equal(picking.raven(120,87),bird);
hasRavens=false;
assert.equal(picking.raven(120,87),null,'unloaded ravens are not interactive');
hasRavens=true;
faction='orc';
assert.equal(picking.raven(120,87),null,'only witches can command ravens');
faction='witch';
assert.equal(picking.tree(50,80),0,'standing trees use projected trunks');
assert.equal(picking.tree(170,80),null,'felled trees are not directly selectable');
assert.equal(picking.logBundle(50,98),0,'wood deposits use their projected positions');
assert.equal(picking.building({x:4.5,z:4.5}),house,'exact ground footprint only');
assert.equal(picking.building({x:5.5,z:4.5}),null,'roofs outside footprint not selectable');
canSee=false;
assert.equal(picking.building({x:4.5,z:4.5}),null,'fog also hides building selection');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersPicking.create('));
assert(game.includes('return screenPicking.unit(x,y,includeEnemies)'));
assert(html.includes('src="./rts-picking.js"'));
console.log('PASS standalone screen-space unit, raven, tree, log and footprint picking');
