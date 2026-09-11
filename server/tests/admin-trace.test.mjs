import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../app.mjs';
import {createEmptyCard} from 'ts-fsrs';

// Synthetic records only; exported for the isolated author browser check.
export function seedAdminTrace(db){
 const put=(sql,...args)=>db.prepare(sql).run(...args),j=JSON.stringify,now=new Date().toISOString(),old=new Date(Date.now()-86400000).toISOString();
 for(const [id,role] of [['trace-admin','admin'],['trace-owner','learner'],['trace-other','learner']]){
  put('INSERT INTO users(id,email,name,password,verified,role,createdAt) VALUES(?,?,?,?,1,?,?)',id,`${id}@example.test`,`Synthetic ${id}`, 'unusable',role,old);
  put('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(id).digest('hex'),id,new Date(Date.now()+86400000).toISOString());
 }
 put('INSERT INTO books VALUES(?,?,?,?,NULL,?)','trace-book','trace-owner',j({title:'Synthetic source',chapters:[]}),'ready',old);
 put('INSERT INTO lessons VALUES(?,?,?,?,?)','trace-lesson','trace-owner','trace-book',j({title:'Synthetic lesson',explanation:'Lesson selected from retained evidence.',questions:[]}),old);
 put('INSERT INTO curricula VALUES(?,?,?,?,?,?)','trace-revision','trace-owner','trace-book',3,j({title:'Synthetic revision',reason:'Past evidence selected this lesson.',lessons:[{id:'trace-lesson',title:'Synthetic lesson'}]}),old);
 for(let i=0;i<505;i++){
  const id=String(i).padStart(3,'0'),at=i?now:old,owner=i?'trace-other':'trace-owner';
  put('INSERT INTO jobs(id,userId,bookId,kind,status,message,input,result,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)',`job-${id}`,owner,'trace-book','curriculum','completed','Synthetic completed job',j({apiKey:'synthetic-secret'}),j({reviewId:`review-${id}`,curriculum:{version:3,reason:'Past evidence selected this lesson.',lessons:[{id:'trace-lesson',title:'Synthetic lesson'}]}}),at,at);
  put('INSERT INTO review_queue VALUES(?,?,?,?,?,?,?,?)',`review-${id}`,owner,'trace-book','curriculum','approved',j({jobId:`job-${id}`,reason:'Synthetic independent review'}),j({decision:'approve',reviewer:'trace-admin',reason:'Checked source and evidence.',result:{curriculum:{version:3,lessons:[{id:'trace-lesson'}]}}}),at);
  put('INSERT INTO events VALUES(?,?,?,?,?,?)',`event-${id}`,owner,`job-${id}`,'ai',j(i===1?{phase:'start',state:'starting',model:'synthetic-model',effort:'medium',promptVersion:'synthetic-v1',usage:null}:i===2?{phase:'tool',tool:'get_evidence',arguments:{},result:{synthetic:true}}:i===3?{phase:'complete',state:'completed',elapsedMs:120,calls:1,usage:null,output:{text:'Synthetic completion'}}:{phase:'validation',task:'curriculum',model:'synthetic-model',promptVersion:'synthetic-v1',status:'approved',usage:null,reason:'<img src=x onerror="window.traceHostile=1">',apiKey:'synthetic-secret'}),at);
  put('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',`attempt-${id}`,'trace-owner','question-1','1','objective-1','1','lesson:trace-lesson',0,1,0,1,12,at,j({prompt:'Synthetic answer',correct:true}));
  put('INSERT INTO bkt_history VALUES(?,?,?,?,?,?)',`bkt-${id}`,'trace-owner',`attempt-${id}`,'objective-1',j({prior:0.2,posterior:0.5,parameters:{version:'bkt-synthetic'},correct:true}),at);
  put('INSERT INTO reviews VALUES(?,?,?,?,?)',`recall-${id}`,'trace-owner','word-1',j({rating:3,item:{front:'casa',due:now,bookId:'trace-book'},card:{due:now},scheduler:'ts-fsrs',bktUpdated:false}),at);
 }
 put('INSERT INTO review_queue VALUES(?,?,?,?,?,?,?,?)','feedback-old','trace-owner','trace-book','feedback','rejected',j({message:'Synthetic null-job feedback'}),j({decision:'reject',reviewer:'trace-admin',reason:'No change.'}),old);
 put('INSERT INTO events VALUES(?,?,?,?,?,?)','cancel-old','trace-admin','job-000','transition',j({event:'cancel',to:'cancelled'}),old);
 put('INSERT INTO events VALUES(?,?,?,?,?,?)','resolve-old','trace-admin',null,'review_resolution',j({reviewId:'feedback-old',decision:'reject'}),old);
 return {now,old};
}

test('admin retained trace: bounded pages, owner relations, exact lookups, validation and immutable history',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'admin-trace-')),runtime=createApp({dataDir:dir,worker:false,env:{APP_ORIGIN:'http://localhost'}}),{db}=runtime;
 seedAdminTrace(db);const server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await runtime.close();rmSync(dir,{recursive:true,force:true});});
 const get=async(path,who='trace-admin')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/${path}`,{headers:who?{cookie:`comelibro_session=${who}`}:{}});return {status:r.status,body:await r.json()};};
 const card=createEmptyCard(new Date());db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?,?)').run('test-word','trace-owner','trace-book','sentence-1','casa','house',JSON.stringify(card),card.due.toISOString(),new Date().toISOString());
 const snapshot=()=>JSON.stringify(['attempts','bkt_history','reviews','vocabulary','objectives','jobs','review_queue','events'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
 const at=new Date(Date.now()-86400000).toISOString();
 db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run('orphan-event','trace-admin','deleted-job','transition','{}',at);
 assert.equal((await get('activity?id=orphan-event')).body.events[0].ownerId,null,'missing related data must not fabricate a learner owner');
 assert.equal((await get('activity?userId=trace-owner&id=orphan-event')).body.page.total,0);
 db.prepare('DELETE FROM events WHERE id=?').run('orphan-event');
 const before=snapshot(),old=await get('activity?id=event-000');
 assert.deepEqual([...old.body.aiRuns,...old.body.transitions].map(r=>r.id),['event-000'],'retained event beyond the newest 500 must be reachable by exact ID');
 for(const [path,key,id] of [['jobs','jobs','job-000'],['reviews','reviews','review-000']]){const r=await get(`${path}?id=${id}`);assert.equal(r.body[key][0].id,id);assert.equal(r.body.page.total,1);}
 const owner=await get('activity?userId=trace-owner');assert.deepEqual(new Set(owner.body.events.map(r=>r.id)),new Set(['event-000','cancel-old','resolve-old']));
 assert.equal(owner.body.events.find(r=>r.id==='resolve-old').ownerId,'trace-owner');assert.equal(owner.body.events.find(r=>r.id==='resolve-old').userId,'trace-admin');
 assert.equal((await get('activity?reviewId=feedback-old')).body.events[0].id,'resolve-old');
 assert.equal((await get('activity?actorId=trace-admin')).body.page.total,2);
 assert.equal((await get('activity?kind=ai&phase=validation&jobId=job-000')).body.page.total,1);
 const first=(await get('activity?kind=ai&limit=200')).body;assert.equal(first.page.total,505);assert.equal(first.events.length,200);
 const second=(await get(`activity?kind=ai&limit=200&cursor=${encodeURIComponent(first.page.nextCursor)}`)).body;
 const third=(await get(`activity?kind=ai&limit=200&cursor=${encodeURIComponent(second.page.nextCursor)}`)).body;
 assert.equal(new Set([...first.events,...second.events,...third.events].map(r=>r.id)).size,505);assert.equal(third.events.at(-1).id,'event-000');assert.equal(third.page.nextCursor,null);
 const account=(await get('accounts/trace-owner')).body;assert.equal(account.counts.attempts,505);assert.equal(account.counts.bktHistory,505);assert.equal(account.counts.reviewHistory,505);assert.ok(account.attempts.length<=50);assert.equal(account.counts.vocabulary,1);assert.equal(account.vocabulary[0].retrievability,null);
 for(const [type,id] of [['attempts','attempt-000'],['bktHistory','bkt-000'],['reviewHistory','recall-000'],['lessons','trace-lesson'],['curricula','trace-revision'],['books','trace-book']]){
  const r=await get(`accounts/trace-owner/history?type=${type}&id=${id}`);assert.equal(r.status,200);assert.equal(r.body.records[0].id,id);assert.equal(r.body.page.total,1);
  if(['attempts','bktHistory','reviewHistory'].includes(type)){const first=(await get(`accounts/trace-owner/history?type=${type}&limit=200`)).body,next=(await get(`accounts/trace-owner/history?type=${type}&limit=200&cursor=${encodeURIComponent(first.page.nextCursor)}`)).body;assert.equal(first.records.length,200);assert.equal(next.page.total,505);assert.equal(next.records.some(row=>first.records.some(other=>other.id===row.id)),false);}
  assert.equal((await get(`accounts/trace-other/history?type=${type}&id=${id}`)).body.records.length,0);
 }
 assert.equal((await get('accounts/trace-owner/history?type=attempts&questionId=question-1')).body.page.total,505);
 assert.equal((await get('accounts/trace-owner/history?type=bktHistory&attemptId=attempt-000')).body.page.total,1);
 assert.equal((await get('accounts/trace-owner/history?type=curricula&bookId=trace-book&version=3')).body.page.total,1);
 for(const path of ['activity?limit=0','activity?limit=201','activity?limit=1.5','activity?limit=2&limit=3','activity?cursor=oops','jobs?oops=1','activity?before=tomorrow','activity?before=2026-02-30T00:00:00.000Z','activity?id=','accounts/trace-owner/history?type=users','accounts/trace-owner/history?type=attempts&bookId=x'])assert.equal((await get(path)).status,400,path);
 for(const path of ['activity','jobs','reviews','accounts/trace-owner','accounts/trace-owner/history?type=lessons']){assert.equal((await get(path,null)).status,401);assert.equal((await get(path,'trace-owner')).status,403);}
 assert.equal((await get('activity?id=missing')).body.page.total,0);assert.equal((await get('accounts/missing')).status,404);
 assert.equal(JSON.stringify(old.body).includes('synthetic-secret'),false);assert.equal(JSON.stringify((await get('jobs?id=job-000')).body).includes('synthetic-secret'),false);
 assert.equal((await get('accounts/trace-owner/history?type=books&id=don-quixote')).body.page.source,'current catalog');
 assert.equal(snapshot(),before,'admin reads must never change historical learning data');
});
