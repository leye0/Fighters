import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectWithStartupRetry} from './browser-qa/chrome-driver.mjs';

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
console.log('PASS one-shot Chrome DevTools retry, terminal failure and profile reset wiring');
