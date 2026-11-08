import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-hud.js');

function element(tag='div'){
  return {tag,children:[],style:{},textContent:'',title:'',disabled:false,
    classList:{add(name){this.className+=(this.className?' ':'')+name;},className:''},
    attributes:{},appendChild(item){this.children.push(item);},
    append(...items){this.children.push(...items);},
    setAttribute(key,value){this.attributes[key]=value;}};
}
const nodes=new Map();
const getElement=id=>{
  if(!nodes.has(id))nodes.set(id,element());
  return nodes.get(id);
};
const document={createElement:tag=>element(tag),createTextNode:text=>({textContent:text})};
const hud=create({document,getElement});
const values={faction:'witch',gold:120,wood:60,food:17.2,magic:33.4,maxMagic:100,
  witchCount:8,orcCount:5,orcHousingCap:18,aiEnabled:true,aiMode:'attack'};
hud.overview(values);
assert.equal(getElement('hud-gold').textContent,'120');
assert.equal(getElement('hud-food').textContent,'18');
assert.equal(getElement('hud-food-label').textContent,'🌾 VIVRES');
assert.equal(getElement('hud-magic').textContent,'33.4/100');
assert.equal(getElement('hud-magic-fill').style.width,'33.4%');
assert.equal(getElement('unit-count').textContent,'8 : 5');
assert.equal(getElement('ai-status').textContent,'ORCS · Assaut');
hud.overview({...values,faction:'orc',food:2.1,magic:5,aiEnabled:false});
assert.equal(getElement('hud-food-label').textContent,'🍖 VIANDE');
assert.equal(getElement('ai-status').textContent,'IA · En attente');
assert.equal(getElement('hud-units-label').textContent,'👹 POP.');
assert.equal(getElement('unit-count').textContent,'5 / 18');
hud.overview({...values,faction:'orc',orcCount:9,orcPopulationCommitted:10,
  orcHousingCap:10});
assert.equal(getElement('unit-count').textContent,'10 / 10',
  'The Orc population must display trained plus queued units against housing');
assert.match(getElement('hud-units-chip').title,/Population pleine/);
hud.overview(values);
assert.equal(getElement('hud-units-label').textContent,'⚔️ UNITÉS');
assert.equal(getElement('unit-count').textContent,'8 : 5');
assert.equal(getElement('ai-status').textContent,'ORCS · Assaut');

let clicked=0,stopped=0;
const parent=element();
const button=hud.commandButton(parent,'🔨','Réparer',{gold:20,wood:5},()=>clicked++,true);
assert.equal(parent.children.length,1);
assert.equal(button.tag,'button');
assert.equal(button.disabled,true);
assert.equal(button.title,'Réparer · 20💰 5🪵');
assert.equal(button.attributes['aria-label'],button.title);
assert.equal(button.children.length,3);
assert.equal(button.children[2].textContent,'20💰 5🪵');
button.onclick({stopPropagation:()=>stopped++});
assert.equal(clicked,1);assert.equal(stopped,1);
const magicButton=hud.commandButton(parent,'🔮','Sort',{magic:100},()=>{},false);
assert.equal(magicButton.children[2].textContent,'100🔮');

const health=element();
hud.healthTrack(health,'PV 50 / 100',50);
assert.equal(health.children[0].textContent,'PV 50 / 100');
assert.equal(health.children[1].className,'hp-track');
assert.equal(health.children[1].children[0].className,'hp-fill');
assert.equal(health.children[1].children[0].style.width,'50%');
const hostile=element();
hud.healthTrack(hostile,'PV 12 / 70',17.14,'enemy');
assert.equal(hostile.children[1].children[0].classList.className,'hp-enemy');
const deposit=element();
hud.healthTrack(deposit,'Or restant',65,'gold');
assert.equal(deposit.children[1].children[0].classList.className,'hp-gold');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersHud.create('));
assert(game.includes('hudRenderer.commandButton(buttons,...args)'));
assert(html.includes('src="./rts-hud.js"'));
assert(html.includes('id="hud-units-label"'));
assert(game.includes('orc-population-status'),
  'Selected Orc housing and barracks must explicitly show their population');
console.log('PASS independent HUD resources, buttons, click handling and HP bars');
