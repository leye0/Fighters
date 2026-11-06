/** Shared, dependency-free Chrome DevTools driver for real WebGL acceptance tests. */
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// The retry policy is separately testable without starting a real browser.
// Restart must dispose the failed Chrome profile and create a new one.
export async function connectWithStartupRetry(attach,restart){
 for(let attempt=0;attempt<2;attempt++){
  try{return await attach();}
  catch(error){
   if(attempt===1)throw error;
   await restart(error);
  }
 }
}

export function createChromeDriver({launchExecutable}={}){
 mkdirSync('captures',{recursive:true});
 let profile,chrome,launchCount=0;
 function launch(){
  profile=mkdtempSync(join(tmpdir(),'fighters-rts-'));
  const executable=launchExecutable?.(launchCount++)||process.env.CHROME_BIN||'google-chrome';
  chrome=spawn(executable,[
   '--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
   '--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl',
   '--window-size=1365,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
 }
 launch();
 let socket,nextId=0;const pending=new Map();
 const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
 function check(value,message){if(!value)throw Error(message);}
 async function attach(){
  const path=join(profile,'DevToolsActivePort');
  for(let i=0;i<120&&!existsSync(path);i++){
   if(chrome.exitCode!==null)
    throw Error('Chrome exited before debugger started (code '+chrome.exitCode+')');
   await sleep(250);
  }
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
 async function connect(){
  return connectWithStartupRetry(attach,error=>{
   // A busy shared runner can fail to start Chrome's DevTools port. One
   // fresh profile/relaunch recovers without skipping any WebGL assertion.
   console.warn('Chrome debugging startup failed; retrying once:',error.message);
   try{socket?.close();}catch{}
   chrome.kill();
   try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}
   catch(cleanupError){console.warn('Failed Chrome profile cleanup:',cleanupError.message);}
   launch();
  });
 }
 function call(method,params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject});
   socket.send(JSON.stringify({id,method,params}));
  });
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
 async function screenshot(name){
  await sleep(300);
  const png=await call('Page.captureScreenshot',{format:'png'});
  writeFileSync('captures/'+name+'.png',Buffer.from(png.data,'base64'));
 }
 function onMessage(listener){socket.addEventListener('message',listener);}
 function close(){
  try{socket?.close();}catch{}
  chrome.kill();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}
  catch(error){console.warn('Chrome profile cleanup only:',error.message);}
 }
 return {connect,call,evaluate,until,screenshot,sleep,check,onMessage,close};
}
