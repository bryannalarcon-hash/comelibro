// Run: node web/self-check.mjs. Retry identity must survive lost responses.
import assert from 'node:assert/strict';
import {attempt,clearAttempt,chapterSentences,textOf,api} from './lib.js';
const memory=new Map();
globalThis.sessionStorage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const first=attempt('account:question:v1',{choiceIndex:1,elapsedMs:14});
assert.deepEqual(attempt('account:question:v1',{choiceIndex:2,elapsedMs:99}),first);
assert.notEqual(attempt('other-account:question:v1',{}).attemptId,first.attemptId);
clearAttempt('account:question:v1');
assert.notEqual(attempt('account:question:v1',{}).attemptId,first.attemptId);
assert.deepEqual(chapterSentences({chapters:[{id:'1',sentences:[{text:'Hola.'}]}]},'missing'),[]);
assert.equal(textOf('<script>alert(1)</script>'),'<script>alert(1)</script>');
let expired=0;
globalThis.window={dispatchEvent:()=>expired++};
globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Sign in',code:'AUTH_REQUIRED'})});
await assert.rejects(api('/auth/login'),/Sign in/);assert.equal(expired,0);
await assert.rejects(api('/reviews'),/Sign in/);assert.equal(expired,1);
console.log('PASS: stable retries, account isolation, literal text and auth recovery. Browser behavior is covered by tests/qa-browser.mjs and evidence/state-coverage.json.');
