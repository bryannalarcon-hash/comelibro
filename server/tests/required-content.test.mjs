import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';

const origin='http://localhost:3300',now=()=>new Date().toISOString();
const catalog=()=>({objectives:[{id:'objective-1',version:'1',label:'Casa',description:'Synthetic',cvc:[]}],placement:[{id:'placement-1',version:'1',objectiveId:'objective-1',objectiveVersion:'1',type:'multiple-choice',prompt:'¿Casa?',choices:['House','Horse'],answerIndex:0}],lessons:[{id:'fixture-lesson',bookId:'don-quixote',title:'Synthetic',objectiveIds:['objective-1'],questions:[]}]});
const novel=()=>({id:'don-quixote',title:'Synthetic',author:'Test',chapters:[{id:'chapter-1',title:'One',sentences:[{id:'sentence-1',text:'La casa es pequeña.',page:1,tags:[],objectiveSpans:[]}]}]});
const account=(id)=>[id,`${id}@example.test`,id,'test-password',1,'learner','{}',JSON.stringify({status:'complete'}),now()];

test('required content fails before runtime storage for missing, malformed, and empty files',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'comelibro-required-content-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const [name,files,message] of [
    ['missing catalog',{novel:JSON.stringify(novel())},'catalog.json could not be loaded'],
    ['malformed catalog',{catalog:'{',novel:JSON.stringify(novel())},'catalog.json could not be loaded'],
    ['empty catalog',{catalog:JSON.stringify({objectives:[],placement:[],lessons:[]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['null objective',{catalog:JSON.stringify({...catalog(),objectives:[null]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['objective without id',{catalog:JSON.stringify({...catalog(),objectives:[{}]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['null placement question',{catalog:JSON.stringify({...catalog(),placement:[null]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['placement question without choices',{catalog:JSON.stringify({...catalog(),placement:[{...catalog().placement[0],choices:[]}]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['null lesson',{catalog:JSON.stringify({...catalog(),lessons:[null]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['lesson without questions',{catalog:JSON.stringify({...catalog(),lessons:[{id:'lesson',bookId:'don-quixote'}]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['malformed lesson question',{catalog:JSON.stringify({...catalog(),lessons:[{...catalog().lessons[0],questions:[null]}]}),novel:JSON.stringify(novel())},'catalog.json is structurally empty or invalid'],
    ['missing novel',{catalog:JSON.stringify(catalog())},'don-quixote.json could not be loaded'],
    ['malformed novel',{catalog:JSON.stringify(catalog()),novel:'{'},'don-quixote.json could not be loaded'],
    ['empty novel',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),chapters:[]})},'don-quixote.json is structurally empty or invalid'],
    ['null chapter',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),chapters:[...novel().chapters,null]})},'don-quixote.json is structurally empty or invalid'],
    ['non-array chapter sentences',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),chapters:[{id:'chapter-1',sentences:{}}]})},'don-quixote.json is structurally empty or invalid'],
    ['null sentence',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),chapters:[{id:'chapter-1',sentences:[null]}]})},'don-quixote.json is structurally empty or invalid'],
    ['sentence without text',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),chapters:[{id:'chapter-1',sentences:[{id:'sentence-1'}]}]})},'don-quixote.json is structurally empty or invalid'],
    ['wrong novel id',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),id:'wrong-id'})},'don-quixote.json is structurally empty or invalid'],
    ['empty novel id',{catalog:JSON.stringify(catalog()),novel:JSON.stringify({...novel(),id:''})},'don-quixote.json is structurally empty or invalid']
  ]) await t.test(name,()=>{const caseDir=join(dir,name.replaceAll(' ','-')),contentDir=join(caseDir,'content'),dataDir=join(caseDir,'runtime');mkdirSync(contentDir,{recursive:true});if(files.catalog)writeFileSync(join(contentDir,'catalog.json'),files.catalog);if(files.novel)writeFileSync(join(contentDir,'don-quixote.json'),files.novel);assert.throws(()=>createApp({dataDir,contentDir,worker:false,env:{APP_ORIGIN:origin}}),new RegExp(message));assert.equal(existsSync(dataDir),false);});
});

test('cached source validates repeated positions without projection and preserves account-specific annotations',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'comelibro-required-content-')),contentDir=join(dir,'content'),source=novel();mkdirSync(contentDir);writeFileSync(join(contentDir,'catalog.json'),JSON.stringify(catalog()));writeFileSync(join(contentDir,'don-quixote.json'),JSON.stringify(source));
  const runtime=createApp({dataDir:dir,contentDir,worker:false,env:{APP_ORIGIN:origin}}),server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await runtime.close();rmSync(dir,{recursive:true,force:true});});
  const request=async(id,path,method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{...(method==='GET'?{}:{origin,'x-expected-account-id':id}),...(id?{cookie:`comelibro_session=${id}-session`}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const {db}=runtime,expires=new Date(Date.now()+86400000).toISOString();for(const id of ['reader-a','reader-b']){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(...account(id));db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(`${id}-session`).digest('hex'),id,expires);}
  const lesson={id:'reader-a-lesson',bookId:'don-quixote',generated:true,objectiveIds:['objective-1'],questions:[{id:'generated-question',version:'1',objectiveId:'objective-1',objectiveVersion:'1',sourceSpan:{sentenceId:'sentence-1',text:'casa'},review:{status:'approved',reviewer:'reviewer',version:'1'}}]};
  db.prepare('INSERT INTO curricula VALUES(?,?,?,?,?,?)').run('reader-a-curriculum','reader-a','don-quixote',1,JSON.stringify({lessons:[{id:lesson.id}]}),now());db.prepare('INSERT INTO lessons VALUES(?,?,?,?,?)').run(lesson.id,'reader-a','don-quixote',JSON.stringify(lesson),now());
  assert.equal((await request(null,'/api/bootstrap')).status,200);
  assert.deepEqual((await request('reader-a','/api/books/don-quixote')).body.book.chapters[0].sentences[0].tags,['objective-1']);
  assert.deepEqual((await request('reader-b','/api/books/don-quixote')).body.book.chapters[0].sentences[0].tags,[]);
  writeFileSync(join(contentDir,'catalog.json'),'{');writeFileSync(join(contentDir,'don-quixote.json'),'{');
  assert.equal((await request(null,'/api/bootstrap')).status,200);const anonymousBook=(await request(null,'/api/books/don-quixote')).body.book;assert.equal(anonymousBook.chapters[0].sentences[0].text,'La casa es pequeña.');assert.deepEqual(anonymousBook.chapters[0].sentences[0].tags,[]);
  db.prepare('UPDATE curricula SET data=? WHERE userId=?').run('{','reader-a');
  for(let index=0;index<2;index++)assert.equal((await request('reader-a','/api/books/don-quixote/position','POST',{chapterId:'chapter-1',sentenceId:'sentence-1'})).status,200);
  assert.equal((await request('reader-a','/api/books/don-quixote/position','POST',{chapterId:'other',sentenceId:'sentence-1'})).body.code,'INVALID_POSITION');
  assert.equal((await request('reader-a','/api/books/don-quixote/position','POST',{chapterId:'chapter-1',sentenceId:'missing'})).body.code,'SENTENCE_NOT_FOUND');
  db.prepare('INSERT INTO books VALUES(?,?,?,?,?,?)').run('private-book','reader-a',JSON.stringify({id:'private-book',title:'Private',chapters:[{id:'private-chapter',sentences:[{id:'private-sentence',text:'Privado.',tags:[]}]}]}),'ready',null,now());
  assert.equal((await request('reader-b','/api/books/private-book/position','POST',{chapterId:'private-chapter',sentenceId:'private-sentence'})).body.code,'BOOK_NOT_FOUND');
});
