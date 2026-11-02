#!/usr/bin/env node
/** Browser acceptance tests for the RTS prototype, in real Chrome WebGL. */
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=process.env.FIGHTERS_URL||'http://127.0.0.1:8000/';
const profile=mkdtempSync(join(tmpdir(),'fighters-rts-'));
mkdirSync('captures',{recursive:true});
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
 '--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl',
 '--window-size=1365,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let socket,nextId=0;const pending=new Map();
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function check(value,message){if(!value)throw Error(message);}
async function connect(){
 const path=join(profile,'DevToolsActivePort');
 for(let i=0;i<120&&!existsSync(path);i++)await sleep(250);
 check(existsSync(path),'Chrome debugger did not start');
 const port=readFileSync(path,'utf8').split('\n')[0];
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const page=tabs.find(t=>t.type==='page');check(page,'No Chrome tab');
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=ev=>{
  const msg=JSON.parse(ev.data),job=pending.get(msg.id);
  if(!job)return;pending.delete(msg.id);
  msg.error?job.reject(Error(JSON.stringify(msg.error))):job.resolve(msg.result);
 };
}
function call(method,params={}){
 const id=++nextId;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){
 const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error('Browser error: '+JSON.stringify(result.exceptionDetails));
 return result.result.value;
}
async function until(expression,label,timeout=90000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  if(await evaluate(expression))return;
  await sleep(500);
 }
 throw Error('Timeout waiting for '+label+': '+JSON.stringify(await evaluate("({title:document.querySelector('#overlay-title')?.textContent,desc:document.querySelector('#overlay-desc')?.textContent,qa:window.__fightersQA?.snapshot()})")));
}
async function run(){
 await connect();
 await call('Page.enable');await call('Runtime.enable');
 const errors=[];
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails?.text||'Unknown JS error');
 });
 await call('Page.navigate',{url:root+'?qa=1'});
 await until('window.__fightersQA?.snapshot().running===true','RTS session startup');
 let s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3,'Expected 3 initial witches');check(s.orcs.length===4,'Expected 4 initial orcs');
 check(s.gold.witch===2000&&s.gold.orc===900,'Faction starting gold');
 check(s.selectedBuilding==='witch-house','House selected on startup');
 check(s.projection==='orthographic','Isometric camera');
 check(await evaluate('window.__fightersQA.train()'),'Witch training rejected');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.witch===1880&&s.trainingCount===1,'Training queue must charge gold');
 await evaluate('window.__fightersQA.advance(3.6)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===4&&s.trainingCount===0,'Witch queue does not produce a unit');
 await evaluate('window.__fightersQA.selectWitches();window.__fightersQA.move(-3,-3)');
 s=await evaluate('window.__fightersQA.snapshot()');check(s.selectedIds.length===4,'Multi-selection failed');
 const first=s.witches[0];
 await evaluate('window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(s.witches[0].x-first.x,s.witches[0].z-first.z)>1,'Selected witch did not move');
 await until('window.__fightersQA.snapshot().blueprints.length===5','Five orc construction blueprints',100000);
 await evaluate("window.__fightersQA.setFaction('orc')");
 check(await evaluate("window.__fightersQA.beginBuild('hut')"),'Cannot begin orc hut construction');
 check(await evaluate("!!window.__fightersQA.build('hut',8,-10)"),'Orc hut placement failed');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===6&&s.gold.orc===780,'Orc building not registered or gold not deducted');
 check(s.buildings.filter(b=>b.type==='hut').length===2,'Constructed hut must be a second unique building');
 check(!await evaluate("!!window.__fightersQA.build('hut',8,-10)"),'Overlapping orc building accepted');
 await evaluate('window.__fightersQA.pause()');
 check((await evaluate('window.__fightersQA.snapshot()')).paused,'Pause failed');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Reset must restore starting troops');
 check(!errors.length,'Browser script exceptions: '+errors.join(' | '));
 const png=await call('Page.captureScreenshot',{format:'png'});
 writeFileSync('captures/rts.png',Buffer.from(png.data,'base64'));
 console.log('PASS RTS: native WebGL scene, two factions, 3+4 units, training queue, 4-unit group movement, 5 building blueprints, non-overlapping orc construction, resources, pause, reset.');
}
try{await run();}finally{try{socket?.close();}catch{}chrome.kill();try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}catch(error){console.warn('Chrome profile cleanup only:',error.message);}}
