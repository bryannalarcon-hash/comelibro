import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {chromium} from '@playwright/test';
import {createApp} from '../server/app.mjs';

const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||join(homedir(),'.cache','ms-playwright');
const installed=existsSync(cache)?readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort().reverse().map(name=>join(cache,name,'chrome-linux64','chrome')):[];
const executablePath=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath(),...installed].find(path=>path&&existsSync(path));
if(!executablePath)throw new Error('Install Playwright Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');

async function freePort(){
 const socket=createServer().listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{socket.once('listening',resolve);socket.once('error',reject)});
 const port=socket.address().port;
 await new Promise(resolve=>socket.close(resolve));
 return port;
}

test('adaptive signed-in navigation keeps every destination reachable',{timeout:60000},async()=>{
 const port=await freePort(),base=`http://127.0.0.1:${port}`,dir=mkdtempSync(join(tmpdir(),'comelibro-responsive-'));
 const runtime=createApp({dataDir:dir,worker:false,env:{NODE_ENV:'test',APP_ORIGIN:base}});
 const server=runtime.app.listen(port,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  const page=await browser.newPage({viewport:{width:320,height:568}});
  await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).count(),0);
  await page.getByText('Choose Don Quijote or upload a short Spanish PDF.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Comelibro home'}).getAttribute('href'),'#/welcome');
  await page.getByRole('link',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth),true);
  await page.goto(`${base}/#/reader/don-quixote`,{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).count(),0);
  await page.getByRole('link',{name:'Sign in',exact:true}).waitFor();
  await page.goto(base,{waitUntil:'networkidle'});

  assert.equal(await page.evaluate(async()=>(await fetch('/api/auth/demo',{method:'POST'})).status),201);
  const user=await page.evaluate(async()=>(await (await fetch('/api/bootstrap')).json()).user);
  for(let i=0;i<12;i++)runtime.db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?,?)').run(`nav-${i}`,user.id,'don-quixote','dq-opening-1-s1',`front ${i}`,`back ${i}`,'{}','2000-01-01T00:00:00.000Z',new Date().toISOString());
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Library',exact:true}).waitFor();
  await page.getByRole('link',{name:'Comelibro home'}).click();
  await page.waitForURL(/#\/welcome$/);
  await page.getByText('Choose Don Quijote or upload a short Spanish PDF.',{exact:false}).waitFor();
  await page.goto(`${base}/#/`,{waitUntil:'networkidle'});

  const menu=page.getByRole('button',{name:'Menu',exact:true});
  await menu.waitFor({timeout:2000});
  assert.equal(await menu.getAttribute('aria-haspopup'),'dialog');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.deepEqual(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width>=44,r.height>=44]}),[true,true]);
  await menu.click();
  const sheet=page.getByRole('dialog',{name:'Menu'});
  await sheet.waitFor();
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await sheet.getByText('Demo reader',{exact:true}).waitFor();
  for(const name of ['Library','Review','Settings']){
   const link=sheet.getByRole('link',{name,exact:true});
   await link.waitFor();
   assert.deepEqual(await link.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width>=44,r.height>=44]}),[true,true]);
  }
  assert.equal(await sheet.getByRole('link',{name:'Library',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await sheet.getByRole('link',{name:'Admin',exact:true}).count(),0);
  assert.equal(await sheet.getByRole('link',{name:'Review',exact:true}).textContent(),'Review12');

  await page.keyboard.press('Escape');
  await sheet.waitFor({state:'detached'});
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Menu');

  await menu.click();
  await page.mouse.click(1,1);
  await sheet.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Menu');

  await menu.click();
  await sheet.getByRole('link',{name:'Review',exact:true}).click();
  await page.waitForURL(/#\/reviews$/);
  await sheet.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'main');

  await page.goto(`${base}/#/lesson/dq-opening-1-place-and-memory`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/Start questions/}).click();
  for(const [name,control] of [['choice',page.locator('.choices label').first()],['report',page.locator('.lesson-footer .text-button')],['reminder',page.locator('.lesson-reminder>summary')]])assert.deepEqual(await control.evaluate(el=>{const r=el.getBoundingClientRect();return [r.height>=44,getComputedStyle(el).fontSize==='16px']}),[true,true],name);
  await page.goto(`${base}/#/settings`,{waitUntil:'networkidle'});
  for(const [name,control] of [['theme',page.locator('.theme-options label').first()],['privacy',page.locator('.privacy-note summary')]])assert.deepEqual(await control.evaluate(el=>{const r=el.getBoundingClientRect();return [r.height>=44,getComputedStyle(el).fontSize==='16px']}),[true,true],name);

  runtime.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('dialog',{name:'Menu'}).getByRole('link',{name:'Admin',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.goto(`${base}/#/admin`,{waitUntil:'networkidle'});
  assert.deepEqual(await page.locator('.admin-tabs a').first().evaluate(el=>{const r=el.getBoundingClientRect();return [r.height>=44,getComputedStyle(el).fontSize==='16px']}),[true,true]);

  await page.setViewportSize({width:844,height:390});
  await page.goto(`${base}/#/reader/don-quixote`,{waitUntil:'networkidle'});
  const readerMenu=page.locator('.reader-toolbar').getByRole('button',{name:'Menu',exact:true});
  await readerMenu.waitFor();
  await readerMenu.click();
  await page.getByRole('dialog',{name:'Menu'}).getByRole('link',{name:'Settings',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth),true);

  await page.goto(`${base}/#/`,{waitUntil:'networkidle'});
  await page.setViewportSize({width:768,height:1024});
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).count(),0);
  for(const name of ['Library','Review','Settings','Admin'])await page.locator('.topbar').getByRole('link',{name,exact:true}).waitFor();

  runtime.db.prepare("UPDATE users SET role='learner',verified=1,placement=? WHERE id=?").run(JSON.stringify({status:'complete'}),user.id);
  const uploaded={id:'uploaded-without-plan',title:'Uploaded story',author:'Your upload',chapters:[{id:'uploaded-section-1',title:'Document',sentences:[{id:'uploaded-sentence-1',text:'La casa es pequeña.',page:1,tags:[]}]}]};
  runtime.db.prepare('INSERT INTO books VALUES(?,?,?,?,?,?)').run(uploaded.id,user.id,JSON.stringify(uploaded),'ready',null,new Date().toISOString());
  await page.goto(`${base}/#/`);await page.reload({waitUntil:'networkidle'});
  const addPdf=page.getByRole('link',{name:'Add a PDF',exact:true});await addPdf.waitFor();await addPdf.click();await page.waitForURL(/#\/upload$/);
  assert.match(await page.locator('body').innerText(),/PDF processing is unavailable\./);
  await page.goto(`${base}/#/book/${uploaded.id}`,{waitUntil:'networkidle'});
  await page.getByText('No lesson plan yet',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Generate lesson plan',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove document',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Remove this document?'}),remove=dialog.getByRole('button',{name:'Remove document',exact:true});
  assert.equal(await remove.isDisabled(),true);
  await dialog.getByLabel('Type REMOVE to confirm').fill('REMOVE');
  assert.equal(await remove.isEnabled(),true);
  await dialog.getByRole('button',{name:'Keep document',exact:true}).click();

  const crispContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
  const crisp=await crispContext.newPage();
  await crisp.goto(base,{waitUntil:'networkidle'});
  const mark=await crisp.locator('.hero-mark').evaluate(img=>({source:img.naturalWidth,rendered:img.getBoundingClientRect().width,dpr:devicePixelRatio}));
  assert.ok(mark.source>=mark.rendered*mark.dpr);
  await crispContext.close();
 }finally{
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await runtime.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
