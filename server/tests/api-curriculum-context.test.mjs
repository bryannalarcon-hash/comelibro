import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';
import { cleanInput } from '../ai.mjs';

const origin='http://localhost:3300',now=()=>new Date().toISOString();
const question=(id,type)=>({id,version:'1',objectiveId:'objective-1',objectiveVersion:'1',type,prompt:`What does casa mean (${id})?`,choices:['house','horse'],answerIndex:0,explanation:'Casa means house.',sourceSpan:{sentenceId:'sentence-1',text:'casa'},review:{status:'approved',reviewer:'test',version:'1',reason:'Synthetic review.'}});
const proposal=()=>({title:'Next plan',reason:'Use the supplied evidence.',lessons:[{title:'Next lesson',objectiveIds:['objective-1'],explanation:'Practice casa.',examples:[],estimatedMinutes:5,questions:[question('next-transfer','fresh-transfer'),question('next-comprehension','target-comprehension')]}]});

test('HTTP contracts and the real curriculum boundary carry only bounded same-account lesson summaries', async t => {
  const dir=mkdtempSync(join(tmpdir(),'comelibro-curriculum-context-')),contentDir=join(dir,'content');mkdirSync(contentDir);
  writeFileSync(join(contentDir,'catalog.json'),JSON.stringify({objectives:[{id:'objective-1',version:'1',label:'Casa',description:'Recognize casa.',cvc:[]}],placement:[question('placement','multiple-choice')],lessons:[{id:'catalog-lesson',bookId:'don-quixote',title:'Catalog',questions:[]}]}));
  writeFileSync(join(contentDir,'don-quixote.json'),JSON.stringify({id:'don-quixote',title:'Synthetic',author:'Test',passages:[{id:'declared-passage',title:'Declared',chapterId:'chapter-1',sentenceIds:['sentence-1']}],chapters:[{id:'chapter-1',title:'One',sentences:[{id:'sentence-1',text:'La casa es pequeña.',page:1,tags:[]}]},{id:'long-chapter',title:'Long',sentences:Array.from({length:41},(_,i)=>({id:`long-${i}`,text:`Casa ${i}.`,page:1,tags:[]}))}]}));
  const captured=[],runtime=createApp({dataDir:dir,contentDir,worker:false,env:{NODE_ENV:'test',APP_ORIGIN:origin},mailSender:async()=>({status:'sent'}),aiAdapter:{runTask:async({input})=>{captured.push(input);return proposal();}}});
  const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await runtime.close();rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`,request=(path,options={})=>fetch(base+path,options).then(async response=>({status:response.status,body:await response.json(),headers:response.headers}));
  const anonymous=await request('/api/bootstrap');assert.equal(anonymous.status,200);assert.equal(anonymous.body.quotas,null);assert.equal('level' in anonymous.body.onboarding,false);
  const passages=(await request('/api/books/don-quixote/passages')).body.passages;assert.deepEqual(passages.map(p=>p.kind),['declared','chapter','chapter-window','chapter-window']);
  const email='owner@example.test',registered=await request('/api/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password:'correct horse battery staple',name:'Owner'})});
  const cookie=registered.headers.get('set-cookie').split(';')[0],ownerId=registered.body.user.id,db=runtime.db;
  db.prepare('UPDATE users SET verified=1,placement=? WHERE id=?').run(JSON.stringify({status:'complete',level:'elementary',index:1,questionIds:['placement']}),ownerId);
  const existing=Array.from({length:14},(_,i)=>({id:i===0?'complete-owned':i===1?'progress-owned':`owned-${i}`,passageId:i<2?'declared-passage':'other-passage',title:`Owned ${i}`,objectiveIds:['objective-1','unknown-objective'],estimatedMinutes:6,questions:Array.from({length:i===1?2:1},(_,j)=>({id:`owned-question-${i}-${j}`,version:'1',answerIndex:99,secret:'SECRET_ANSWER'}),),answerKey:'SECRET_ANSWER'}));
  db.prepare('INSERT INTO curricula VALUES(?,?,?,?,?,?)').run('owned-plan',ownerId,'don-quixote',7,JSON.stringify({version:7,title:'Owned plan',lessons:existing}),now());
  for(const [id,questionId] of [['attempt-complete','owned-question-0-0'],['attempt-progress','owned-question-1-0']])db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,ownerId,questionId,'1','objective-1','1',`lesson:${questionId.startsWith('owned-question-0')?'complete-owned':'progress-owned'}`,0,1,0,1,null,now(),JSON.stringify({answerIndex:0,secret:'SECRET_ANSWER'}));
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run('other-account','other@example.test','Other','password',1,'learner','{}',JSON.stringify({status:'complete'}),now());
  db.prepare('INSERT INTO curricula VALUES(?,?,?,?,?,?)').run('other-plan','other-account','don-quixote',99,JSON.stringify({version:99,title:'Other plan',lessons:[{id:'other-lesson',passageId:'declared-passage',title:'Other account',objectiveIds:['objective-1'],status:'complete',questions:[{answerIndex:4,secret:'OTHER_SECRET'}]}]}),now());
  const queued=await request('/api/books/don-quixote/curriculum',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-expected-account-id':ownerId},body:JSON.stringify({passageId:'declared-passage'})});assert.equal(queued.status,202);await runtime.processQueue();
  assert.equal(captured.length,1);const current=captured[0].currentCurriculum;assert.equal(current.version,7);assert.equal(current.truncated,true);assert.equal(current.lessons.length,12);assert.deepEqual(current.lessons.slice(0,2).map(l=>[l.id,l.status]),[['complete-owned','complete'],['progress-owned','in_progress']]);assert.ok(current.lessons.every(l=>l.objectiveIds.length===1&&l.objectiveIds[0]==='objective-1'));assert.equal(JSON.stringify(current).includes('SECRET_ANSWER'),false);assert.equal(JSON.stringify(current).includes('other-account'),false);assert.equal(JSON.stringify(current).includes('answerIndex'),false);
  const sanitized=cleanInput('curriculum',{...captured[0],currentCurriculum:{version:'v'.repeat(101),title:'t'.repeat(201),truncated:false,lessons:Array.from({length:13},(_,i)=>({id:`${i}`.padStart(201,'i'),passageId:`passage-${i}`,title:`title-${i}`.repeat(30),objectiveIds:['objective-1','unknown-objective'],status:i===0?'complete':'available',questions:[{answerIndex:0}],secret:'SECRET_ANSWER'}))}}).currentCurriculum;
  assert.equal(sanitized.lessons.length,12);assert.equal(sanitized.truncated,true);assert.equal(sanitized.version.length,100);assert.equal(sanitized.title.length,200);assert.ok(sanitized.lessons.every(l=>l.id.length===200&&l.title.length===200&&l.objectiveIds.length===1&&l.objectiveIds[0]==='objective-1'));assert.equal(JSON.stringify(sanitized).includes('SECRET_ANSWER'),false);assert.equal(cleanInput('curriculum',{...captured[0],currentCurriculum:null}).currentCurriculum,null);
});
