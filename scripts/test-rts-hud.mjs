import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-hud.js');

function element(tag='div'){
  return {tag,children:[],style:{},textContent:'',title:'',disabled:false,
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

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersHud.create('));
assert(game.includes('hudRenderer.commandButton(buttons,...args)'));
assert(html.includes('src="./rts-hud.js"'));
console.log('PASS independent HUD resources, buttons, click handling and HP bars');
