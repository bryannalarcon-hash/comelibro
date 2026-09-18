import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp } from '../app.mjs';
import { createAiWorker, listenAiWorker, socketAdapter, SOCKET_LIMITS } from '../ai-socket.mjs';
const now = () => new Date().toISOString();
const input = { book: { id: 'don-quixote', title: 'Don Quijote' }, sentence: { id: 's1', text: 'La casa.' }, kind: 'explain' };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

// Focused synthetic checks: no provider calls and no production database.
test('isolated temporary demos reuse reviewed lessons without invented placement or elevated access; demo and owner AI gates', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'comelibro-demo-'));
  let calls = 0, mail = 0;
  const env = { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3711', AI_PUBLIC_ENABLED: 'true', AI_SOCKET_PATH: '/unused/test.sock', AI_ALLOWED_USER_ID: 'owner' };
  const runtime = createApp({ dataDir: dir, worker: false, env, mailSender: async () => { mail++; }, aiAdapter: { runTask: async task => { assert.ok(task.accountId === 'owner' || task.accountRole === 'demo'); calls++; return { text: 'Synthetic help.' }; } } });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await close(server); await runtime.close(); rmSync(dir, { recursive: true, force: true }); });
  const { db } = runtime, base = `http://127.0.0.1:${server.address().port}`;
  const request = async (client, path, body, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(base + '/api' + path, { method, headers: { Origin: env.APP_ORIGIN, Cookie: client.cookie || '', 'Content-Type': body instanceof Buffer ? 'application/pdf' : 'application/json', ...(client.id ? { 'X-Expected-Account-Id': client.id } : {}) }, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
    const value = await res.json(); if (res.headers.get('set-cookie')) client.cookie = res.headers.get('set-cookie').split(';')[0]; if (value.user) client.id = value.user.id;
    return { ...value, status: res.status };
  };
  const a = {}, b = {};
  assert.equal((await request(a, '/auth/demo', { role: 'admin', verified: true, placement: { status: 'complete' }, accountId: 'owner' })).status, 201);
  assert.equal((await request(b, '/auth/demo', {})).status, 201); assert.notEqual(a.id, b.id); assert.notEqual(a.cookie, b.cookie);
  const original = a.id; assert.equal((await request(a, '/auth/demo', {})).status, 200); assert.equal(a.id, original);
  const boot = await request(a, '/bootstrap'); assert.equal(boot.user.role, 'demo'); assert.equal(boot.user.verified, false); assert.equal(boot.user.email, null); assert.equal(boot.onboarding.status, 'not_started'); assert.ok(boot.onboarding.objectives.every(o => o.status === 'unknown')); assert.equal(boot.capabilities.ai, true); assert.equal(boot.capabilities.pdf, false); assert.equal(boot.capabilities.email, false);
  for (const table of ['attempts', 'bkt_history', 'objectives', 'tokens']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  const plan = await request(a, '/books/don-quixote/curriculum'); assert.equal(plan.status, 200); assert.ok(plan.curriculum.lessons.length);
  const lesson = (await request(a, '/lessons/' + plan.curriculum.lessons[0].id)).lesson;
  const answer = await request(a, '/lessons/' + lesson.id + '/answer', { questionId: lesson.questions[0].id, choiceIndex: 0, attemptId: randomUUID() }); assert.equal(answer.status, 200); assert.equal(db.prepare('SELECT count(*) AS n FROM attempts WHERE userId=?').get(a.id).n, 1);
  assert.equal((await request(b, '/lessons/' + lesson.id)).progress.answered, 0);
  const book = (await request(a, '/books/don-quixote')).book, sentenceId = book.chapters[0].sentences[0].id;
  assert.equal((await request(a, '/reviews')).total, 1); assert.equal((await request(b, '/reviews')).total, 0);
  for (const path of ['/admin/overview', '/admin/accounts/owner', '/jobs/missing', '/books/private-owner-book']) assert.ok([403, 404].includes((await request(a, path)).status));
  for (const [path, body] of [['/books/upload', Buffer.from('%PDF-1.7')], ['/auth/resend-verification', {}], ['/placement/start', { level: 'advanced' }], ['/placement/answer', {}]]) assert.ok([403, 503].includes((await request(a, path, body)).status), path);
  assert.equal(db.prepare('SELECT count(*) AS n FROM jobs').get().n, 0); assert.equal(mail, 0); assert.equal(calls, 0);
  const demoHelp = await request(a, '/books/don-quixote/help', { sentenceId, kind: 'explain', accountRole: 'admin', accountId: 'owner' }); assert.equal(demoHelp.status, 202); await runtime.processQueue(); assert.equal((await request(a, '/jobs/' + demoHelp.job.id)).job.status, 'completed'); assert.equal(calls, 1);
  const demoPlan = await request(a, '/books/don-quixote/curriculum', {}); assert.equal(demoPlan.status, 202); assert.equal((await request(a, '/jobs/' + demoPlan.job.id + '/cancel', {})).job.status, 'cancelled');
  assert.equal(db.prepare('SELECT count(*) AS n FROM attempts WHERE userId=? AND context=?').get(a.id, 'placement').n, 0);

  const account = (id, placement = '{}') => {
    db.prepare('INSERT INTO users(id,email,name,password,verified,role,placement,createdAt) VALUES(?,?,?,?,?,?,?,?)').run(id, `${id}@example.test`, id, 'unused', 1, 'learner', placement, now());
    const token = randomUUID(); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, new Date(Date.now() + 3600000).toISOString()); return { id, cookie: `comelibro_session=${token}` };
  };
  const owner = account('owner', '{"status":"complete"}'), other = account('other'), otherPlaced = account('other-placed', '{"status":"complete"}');
  const before = owner.cookie; assert.equal((await request(owner, '/auth/demo', {})).status, 409); assert.equal(owner.cookie, before);
  assert.equal((await request(other, '/books/don-quixote/curriculum')).code, 'PLACEMENT_REQUIRED');
  assert.equal((await request(other, '/placement/start', { level: 'beginner' })).status, 200);
  assert.equal((await request(owner, '/bootstrap')).capabilities.ai, true); assert.equal((await request(other, '/bootstrap')).capabilities.ai, false);
  const help = { sentenceId, kind: 'explain', accountId: 'owner', userId: 'owner' };
  assert.equal((await request(otherPlaced, '/books/don-quixote/help', help)).status, 503); assert.equal((await request(otherPlaced, '/books/don-quixote/curriculum', {})).status, 503);
  env.AI_PUBLIC_ENABLED = 'false'; assert.equal((await request(owner, '/books/don-quixote/help', help)).status, 503); env.AI_PUBLIC_ENABLED = 'true';
  const accepted = await request(owner, '/books/don-quixote/help', help); assert.equal(accepted.status, 202); await runtime.processQueue(); assert.equal((await request(owner, '/jobs/' + accepted.job.id)).job.status, 'completed'); assert.equal(calls, 2);
  const queued = await request(owner, '/books/don-quixote/help', help); env.AI_ALLOWED_USER_ID = 'different'; await runtime.processQueue(); assert.equal((await request(owner, '/jobs/' + queued.job.id)).job.status, 'failed'); assert.equal(calls, 2);
  for (const client of [otherPlaced]) {
    const id = randomUUID(); db.prepare('INSERT INTO jobs(id,userId,bookId,kind,status,input,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)').run(id, client.id, book.id, 'help', 'queued', JSON.stringify(help), now(), now());
    await runtime.processQueue(); assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(id).status, 'failed'); assert.equal(calls, 2);
  }
  delete env.AI_ALLOWED_USER_ID; assert.equal((await request(owner, '/bootstrap')).capabilities.ai, false); assert.equal((await request(owner, '/books/don-quixote/help', help)).status, 503);
  delete env.AI_SOCKET_PATH; assert.equal((await request(other, '/bootstrap')).capabilities.ai, true); // Existing private direct mode is unchanged.
  const expires = new Date(Date.now() - 86400001).toISOString(); db.prepare('UPDATE users SET createdAt=? WHERE id=?').run(expires, a.id);
  assert.equal((await request(a, '/bootstrap')).user, null); assert.equal((await request(a, '/auth/demo', {})).status, 201); assert.notEqual(a.id, original); assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get(original), undefined);
  assert.equal(db.prepare('SELECT count(*) AS n FROM attempts WHERE userId=?').get(original).n, 0);
  // Throttling cannot create an unbounded stream of accounts.
  await request({}, '/auth/demo', {}); await request({}, '/auth/demo', {}); assert.equal((await request({}, '/auth/demo', {})).status, 429);
});

test('private Unix transport validates identity, task, sizes, one slot, disconnect, cancellation and deadline', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'comelibro-socket-')), path = join(dir, 'worker.sock');
  let mode = 'normal', calls = 0, aborted = 0, release, started;
  const worker = await listenAiWorker(path, { allowedUserId: 'owner', runTask: async task => {
    calls++; assert.ok(task.accountId === 'owner' && task.accountRole === 'learner' || task.accountRole === 'demo');
    if (mode === 'hold') { started?.(); await new Promise(resolve => { release = resolve; task.signal.addEventListener('abort', () => { aborted++; resolve(); }, { once: true }); }); task.signal.throwIfAborted(); }
    if (mode === 'oversize') return { text: 'x'.repeat(SOCKET_LIMITS.responseBytes) };
    task.onProgress(.5, 'Synthetic progress'); task.onEvent({ phase: 'synthetic' }); return { text: 'Synthetic result' };
  } });
  t.after(async () => { release?.(); await close(worker); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(statSync(path).mode & 0o777, 0o660); assert.throws(() => createAiWorker({ allowedUserId: '' }));
  const adapter = socketAdapter(path), task = { accountId: 'owner', accountRole: 'learner', kind: 'help', input };
  const demoTask = { ...task, accountId: randomUUID(), accountRole: 'demo' };
  assert.deepEqual(await adapter.runTask(demoTask), { text: 'Synthetic result' });
  let progress = 0, events = 0;
  assert.deepEqual(await adapter.runTask({ ...task, onProgress: () => progress++, onEvent: () => events++ }), { text: 'Synthetic result' }); assert.equal(progress, 1); assert.equal(events, 1);
  for (const invalid of [{ ...task, accountId: 'visitor' }, { ...task, accountRole: 'unknown' }, { ...demoTask, accountRole: 'learner' }, { ...demoTask, accountId: '' }, { ...demoTask, accountId: 'malformed' }, { ...task, accountId: null }, { ...task, kind: 'shell' }, { ...task, input: { kind: 'explain' } }]) await assert.rejects(async () => adapter.runTask(invalid));
  assert.equal(calls, 2);
  await assert.rejects(async () => adapter.runTask({ ...task, input: { text: 'x'.repeat(SOCKET_LIMITS.requestBytes) } }));
  const raw = body => new Promise((resolve, reject) => { const req = http.request({ socketPath: path, path: '/task', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end(body); });
  assert.equal(await raw('{broken'), 400); assert.equal(await raw(JSON.stringify({ ...task, command: 'anything' })), 403); assert.equal(await raw('x'.repeat(SOCKET_LIMITS.requestBytes + 1)), 413);
  mode = 'hold'; let running = new Promise(r => { started = r; }); const controller = new AbortController(); const first = adapter.runTask({ ...task, signal: controller.signal }); await running;
  await assert.rejects(async () => adapter.runTask(task)); controller.abort(); await assert.rejects(first); await new Promise(r => setTimeout(r, 30)); assert.equal(aborted, 1);
  // Closing a web-side connection aborts the native task too.
  running = new Promise(r => { started = r; }); const req = http.request({ socketPath: path, path: '/task', method: 'POST', headers: { 'Content-Type': 'application/json' } }); req.on('error', () => {}); req.end(JSON.stringify(task)); await running; req.destroy(); await new Promise(r => setTimeout(r, 30)); assert.equal(aborted, 2);
  mode = 'oversize'; await assert.rejects(async () => adapter.runTask(task));
  mode = 'normal'; await assert.rejects(async () => socketAdapter(path, { ...SOCKET_LIMITS, responseBytes: 10 }).runTask(task));
  mode = 'hold'; await assert.rejects(async () => socketAdapter(path, { ...SOCKET_LIMITS, timeoutMs: 50 }).runTask(task)); await new Promise(r => setTimeout(r, 30)); assert.equal(aborted, 3);
  mode = 'normal'; assert.deepEqual(await adapter.runTask(task), { text: 'Synthetic result' });
});
