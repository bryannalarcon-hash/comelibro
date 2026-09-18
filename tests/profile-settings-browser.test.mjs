import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {chromium} from '@playwright/test';
import {createApp} from '../server/app.mjs';

const executablePath='/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

async function freePort(){
 const socket=createServer().listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{socket.once('listening',resolve);socket.once('error',reject)});
 const port=socket.address().port;
 await new Promise(resolve=>socket.close(resolve));
 return port;
}

test('signed-in profile picture opens account settings and allows sign out',{timeout:20000},async()=>{
 const port=await freePort(),base=`http://127.0.0.1:${port}`,dir=mkdtempSync(join(tmpdir(),'comelibro-profile-browser-'));
 const runtime=createApp({dataDir:dir,worker:false,env:{NODE_ENV:'test',APP_ORIGIN:base}});
 const server=runtime.app.listen(port,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(await page.evaluate(async()=>(await fetch('/api/auth/demo',{method:'POST'})).status),201);
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('link',{name:'Account settings for Demo reader'}).click({timeout:2000});
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByRole('link',{name:'Sign in'}).waitFor();
  assert.equal((await page.evaluate(async()=>await (await fetch('/api/bootstrap')).json())).user,null);
 }finally{
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await runtime.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
