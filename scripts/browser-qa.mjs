#!/usr/bin/env node
/**
 * Browser QA with real Chrome WebGL via software SwiftShader.
 * Verifies both supplied characters and motion playback; captures real canvas frames.
 * No puppeteer/playwright dependency.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const target = process.env.FIGHTERS_URL || 'http://127.0.0.1:8000/';
const results = 'captures';
mkdirSync(results,{recursive:true});
const profile = mkdtempSync(join(tmpdir(),'fighters-chrome-'));
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl',
  '--hide-scrollbars','--window-size=1365,900','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let socket;
let nextId=0;
const pending = new Map();
function fail(message){throw Error(message);}
async function connect(){
  const portFile=join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(portFile);i++) await delay(200);
  if(!existsSync(portFile))fail('Chrome DevTools port not created');
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(p=>p.type==='page');
  if(!page)fail('Missing Chrome page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message=JSON.parse(event.data);
    if(!message.id)return;
    const task=pending.get(message.id);
    if(!task)return;
    pending.delete(message.id);
    message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);
  };
}
function call(method, params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)fail('Page evaluate exception: '+r.exceptionDetails.text);
  return r.result.value;
}
async function waitUntil(test,label,limitMs=75000){
  const end=Date.now()+limitMs;
  while(Date.now()<end){
    const state=await evaluate(test);
    if(state===true)return;
    if(typeof state==='string' && state.startsWith('ERROR:'))fail(label+' '+state);
    await delay(650);
  }
  fail('Timeout: '+label+' / '+String(await evaluate("document.getElementById('load-status')?.textContent")));
}
async function snap(name){
  const box=await evaluate("(()=>{const x=(document.getElementById('stage')||document.getElementById('viewport')).getBoundingClientRect();return {x:x.left,y:x.top,width:x.width,height:x.height};})()");
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{...box,scale:1}});
  const bytes=Buffer.from(r.data,'base64');
  writeFileSync(join(results,name+'.png'),bytes);
  return createHash('sha256').update(bytes).digest('hex');
}
async function selectClip(name){
  const result=await evaluate("(()=>{const a=[...document.querySelectorAll('.motion')].find(b=>b.textContent.includes("+JSON.stringify(name)+"));if(a){a.click();return true;}return false;})()");
  if(!result)fail('Motion button not found: '+name);
  const confirmed=await evaluate("document.getElementById('current-motion').textContent.includes("+JSON.stringify(name)+")");
  if(!confirmed)fail('Motion did not activate: '+name);
}
async function character(label, click=false){
  if(click)await evaluate("document.querySelector('[data-character=\"female\"]').click()");
  await waitUntil("(()=>{const s=document.getElementById('load-status').textContent;return s.startsWith('Erreur')?'ERROR:'+s:document.getElementById('clip-stat').textContent==='86' && document.getElementById('character-label').textContent==="+JSON.stringify(label)+" && document.getElementById('play-pause').disabled===false})()",label);
  await evaluate("document.querySelector('[data-filter=\"combat\"]').click()");
  await waitUntil("document.querySelectorAll('.motion').length>5",label+' combat filter');
  await selectClip('Punch Cross');
  await delay(350);
  const punch=await snap(label+'-punch');
  const playback=await evaluate("document.getElementById('scrub').value");
  if(Number(playback)<=0)fail(label+' animation timeline did not advance');
  await selectClip('Sword Regular Combo');
  await delay(600);
  await snap(label+'-sword');
  await evaluate("document.querySelector('[data-filter=\"move\"]').click()");
  await selectClip('Walk Loop');
  await delay(700);
  await snap(label+'-walk');
  console.log(label+' PASS: 86 clips, combat and locomotion controls, advancing animation; punch screenshot '+punch);
}
try{
  await connect();
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:target});
  await waitUntil("document.readyState==='complete'",'initial page');
  const webgl=await evaluate("!!document.querySelector('#stage canvas')");
  if(!webgl)fail('No WebGL canvas');
  await character('SUPERHERO_MALE');
  await character('SUPERHERO_FEMALE',true);
  console.log('Character Motion Lab PASS');
  await call('Page.navigate',{url:'http://127.0.0.1:8000/?qa=1'});
  await waitUntil("!!window.__fightersQA && window.__fightersQA.snapshot().ready===true",'game models',100000);
  const initial=await evaluate("window.__fightersQA.snapshot()");
  if(initial.enemies!==3||initial.health!==100)fail('Game initial state incorrect '+JSON.stringify(initial));
  const beforeX=initial.heroX;
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await delay(500);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const afterX=await evaluate("window.__fightersQA.snapshot().heroX");
  if(afterX<=beforeX+.35)fail('Hero did not move right under keyboard input');
  await snap('night-street-start');
  await delay(1800);
  for(let n=0;n<5;n++){
    await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
    await delay(70);
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
    await delay(750);
  }
  const afterCombat=await evaluate("window.__fightersQA.snapshot()");
  await snap('night-street-combat');
  if(afterCombat.score<=0)fail('No successful punch contact in game '+JSON.stringify(afterCombat));
  console.log('Beat em up PASS: movement, three enemies, attack contacts, score '+afterCombat.score);
  console.log('Fighters real WebGL QA PASS');
} finally {
  if(socket)socket.close();
  chrome.kill('SIGTERM');
  await delay(300);
  rmSync(profile,{recursive:true,force:true});
}