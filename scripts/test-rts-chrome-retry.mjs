import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectWithStartupRetry,createChromeDriver} from './browser-qa/chrome-driver.mjs';

const events=[];
let launches=0;
const result=await connectWithStartupRetry(async()=>{
  events.push('attach');
  if(++launches===1)throw Error('Chrome debugger did not start');
  return 'connected';
},async error=>{
  assert.equal(error.message,'Chrome debugger did not start');
  events.push('dispose/relaunch');
});
assert.equal(result,'connected');
assert.deepEqual(events,['attach','dispose/relaunch','attach'],
  'a failed startup is retried on a fresh browser once');

let attempts=0,restarts=0;
await assert.rejects(connectWithStartupRetry(async()=>{
  attempts++;throw Error('DevTools still missing');
},async()=>{restarts++;}),/DevTools still missing/);
assert.equal(attempts,2,'persistent failure is not silently bypassed');
assert.equal(restarts,1,'never launch Chrome endlessly');

attempts=0;
await assert.rejects(connectWithStartupRetry(async()=>{
  attempts++;throw Error('port missing');
},async()=>{throw Error('cleanup rejected');}),/cleanup rejected/);
assert.equal(attempts,1,'failed cleanup must surface before a second launch');

const driver=readFileSync(new URL('./browser-qa/chrome-driver.mjs',import.meta.url),'utf8');
assert(driver.includes('return connectWithStartupRetry(attach,error=>{'));
assert(driver.includes('chrome.kill()')&&driver.includes('rmSync(profile')&&
  driver.includes('launch()'),'the real restart must kill and replace the profile');
if(process.env.FIGHTERS_REAL_CHROME_RETRY==='1'){
  const launches=[];
  const chrome=createChromeDriver({launchExecutable:attempt=>{
    launches.push(attempt);
    return attempt===0?'/usr/bin/false':process.env.CHROME_BIN;
  }});
  try{
    await chrome.connect();
    await chrome.call('Runtime.enable');
    assert.equal(await chrome.evaluate('6*7'),42,
      'after a failed actual process, the replacement Chrome handles DevTools');
    assert.deepEqual(launches,[0,1],
      'the first failed process is replaced exactly once');
    console.log('PASS real Chrome relaunch after a dead first process');
  }finally{chrome.close();}
}
console.log('PASS one-shot Chrome DevTools retry, terminal failure and profile reset wiring');
