#!/usr/bin/env node
/** Browser acceptance tests for the RTS prototype, in real Chrome WebGL. */
import {createChromeDriver} from './browser-qa/chrome-driver.mjs';
import {runVisualQa} from './browser-qa/visual.mjs';
import {runEconomyQa} from './browser-qa/economy.mjs';
import {runCombatQa} from './browser-qa/combat.mjs';
import {runDomeQa} from './browser-qa/dome.mjs';

const root=process.env.FIGHTERS_URL||'http://127.0.0.1:8000/';
const driver=createChromeDriver();
const {connect,call,evaluate,until,screenshot,sleep,check,onMessage,close}=driver;
async function findWitchSite(type){
  // Search an actual ring around the mother house. The 8-unit proximity rule
  // deliberately invalidated the old far-east fixtures; these options cover
  // all directions while staying close enough for a worker to reach.
  return evaluate("(()=>{const q=window.__fightersQA;"+
    "for(const r of [7,8.5,10,11.5,13,14.5])for(let i=0;i<32;i++){"+
    "const a=i*Math.PI/16,x=Math.round((-23.5+r*Math.cos(a))*2)/2,"+
    "z=Math.round((-17.5+r*Math.sin(a))*2)/2;"+
    "if(q.canBuild(x,z,"+JSON.stringify(type)+"))return {x,z};}"+
    "return null})()");
}
async function run(){
 await connect();await call('Page.enable');await call('Runtime.enable');
 const group=process.env.FIGHTERS_QA_GROUP||'all';
 check(['all','visual','economy','combat','dome'].includes(group),
   'Unknown Chrome QA group: '+group);
 const errors=[];
 onMessage(event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Runtime.exceptionThrown')
    errors.push(msg.params.exceptionDetails?.text||'Unknown JavaScript exception');
 });
 const context={call,evaluate,until,screenshot,sleep,check,findWitchSite,errors};
 await call('Page.navigate',{url:root+'?qa=1'});
 await until('window.__fightersQA?.snapshot().running===true','RTS startup');
 if(group==='dome'){await runDomeQa(context);return;}
 // Count full world resets independently from lightweight fixture cleanup.
 // This is deliberately a report, not a brittle cap on future test coverage.
 await evaluate("(()=>{let resets=0;const qa=window.__fightersQA;"+
   "const original=qa.reset;qa.reset=(...args)=>{resets++;return original(...args)};"+
   "window.__fightersQaResetCount=()=>resets;})()");
 await until('window.__fightersQA.snapshot().witchHouseLoaded','real witch house hitbox');
 await until('window.__fightersQA.snapshot().forest.loadedSpecies===2',
   'two real CC0 red/dead tree GLBs with WebP textures',30000);
 await until('window.__fightersQA.snapshot().ravens.loaded===true',
   'real locally compressed animated crow GLB',30000);
 if(group==='all'||group==='visual')await runVisualQa(context);

 if(group==='all'||group==='economy')await runEconomyQa(context);

 if(group==='all'||group==='combat')await runCombatQa(context);
 check(!errors.length,'Browser JavaScript exceptions: '+errors.join(' | '));
 console.log('CHROME_QA_FULL_MATCH_RESETS',
   await evaluate('window.__fightersQaResetCount()'),
   '(excludes explicit start-button matches; group='+group+')');
 console.log('PASS RTS CHROME QA GROUP:',group);

}
try{await run();}finally{close();}
