import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';

const origin = 'http://localhost:3300';
const now = () => new Date().toISOString();
const cookie = id => `comelibro_session=${id}`;
const account = (id, name) => [id, `${id}@example.test`, name, 'test-password', 1, 'learner', '{}', JSON.stringify({ status: 'complete' }), now()];

test('stale account context cannot mutate the shared-cookie account', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'comelibro-account-identity-'));
  const contentDir = join(dir, 'content'); mkdirSync(contentDir);
  const question = { id: 'question-1', version: '1', objectiveId: 'objective-1', objectiveVersion: '1', type: 'target-comprehension', prompt: 'What is casa?', choices: ['house', 'horse'], answerIndex: 0, explanation: 'Casa means house.' };
  writeFileSync(join(contentDir, 'catalog.json'), JSON.stringify({ objectives: [{ id: 'objective-1', version: '1', label: 'Casa', description: 'Synthetic', cvc: [] }], placement: [{ id: 'placement-1', version: '1', objectiveId: 'objective-1', objectiveVersion: '1', type: 'multiple-choice', prompt: '¿Casa?', choices: ['House', 'Horse'], answerIndex: 0 }], lessons: [{ id: 'fixture-lesson', bookId: 'don-quixote', title: 'Synthetic', objectiveIds: ['objective-1'], questions: [] }]}));
  writeFileSync(join(contentDir, 'don-quixote.json'), JSON.stringify({ id: 'don-quixote', title: 'Synthetic', author: 'Test', chapters: [{ id: 'chapter-1', title: 'One', sentences: [{ id: 'sentence-1', text: 'La casa es pequeña.', page: 1, tags: [] }] }] }));
  const runtime = createApp({ dataDir: dir, contentDir, worker: false, env: { NODE_ENV: 'test', APP_ORIGIN: origin }, aiAdapter: { runTask: async () => ({}) } });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await runtime.close(); rmSync(dir, { recursive: true, force: true }); });
  const { db } = runtime, expires = new Date(Date.now() + 86400000).toISOString();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(...account('account-a', 'A'));
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(...account('account-b', 'B'));
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('shared-b').digest('hex'), 'account-b', expires);
  db.prepare('INSERT INTO lessons VALUES(?,?,?,?,?)').run('lesson-b', 'account-b', 'don-quixote', JSON.stringify({ id: 'lesson-b', bookId: 'don-quixote', title: 'Synthetic', objectiveIds: ['objective-1'], questions: [question] }), now());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method, body, expected) => {
    const response = await fetch(base + path, { method, headers: { Origin: origin, Cookie: cookie('shared-b'), 'Content-Type': body instanceof Buffer ? 'application/pdf' : 'application/json', ...(expected === undefined ? {} : { 'X-Expected-Account-Id': expected }) }, body: body instanceof Buffer ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };

  const answer = { questionId: 'question-1', choiceIndex: 0, attemptId: 'shared-cookie-answer' };
  for (const expected of [undefined, 'account-a']) {
    const result = await request('/api/lessons/lesson-b/answer', 'POST', answer, expected);
    assert.deepEqual({ status: result.status, code: result.body.code }, { status: 409, code: 'ACCOUNT_CONTEXT_CHANGED' });
    assert.equal(db.prepare('SELECT count(*) AS count FROM attempts').get().count, 0);
    assert.equal(db.prepare('SELECT count(*) AS count FROM bkt_history').get().count, 0);
  }
  assert.equal((await request('/api/lessons/lesson-b/answer', 'POST', answer, 'account-b')).status, 200);
  assert.equal(db.prepare('SELECT userId FROM attempts').get().userId, 'account-b');

  const vocabulary = { bookId: 'don-quixote', sentenceId: 'sentence-1', front: 'casa', back: 'house' };
  assert.equal((await request('/api/vocabulary', 'POST', vocabulary, 'account-a')).status, 409);
  assert.equal(db.prepare('SELECT count(*) AS count FROM vocabulary').get().count, 0);
  assert.equal((await request('/api/vocabulary', 'POST', vocabulary, 'account-b')).status, 404);
  assert.equal(db.prepare('SELECT count(*) AS count FROM vocabulary').get().count, 0);

  const before = { books: db.prepare('SELECT count(*) AS count FROM books').get().count, quota: db.prepare('SELECT count(*) AS count FROM quotas').get().count };
  const upload = await request('/api/books/upload', 'POST', Buffer.from('%PDF-1.7 stale tab'), 'account-a');
  assert.deepEqual({ status: upload.status, code: upload.body.code }, { status: 409, code: 'ACCOUNT_CONTEXT_CHANGED' });
  assert.deepEqual({ books: db.prepare('SELECT count(*) AS count FROM books').get().count, quota: db.prepare('SELECT count(*) AS count FROM quotas').get().count }, before);
  assert.equal((await request('/api/books/upload', 'POST', Buffer.from('%PDF-1.7 current tab'), 'account-b')).status, 202);

  assert.equal((await request('/api/auth/resend-verification', 'POST', {}, 'account-a')).status, 409);
  assert.equal((await request('/api/auth/logout', 'POST', {}, 'account-a')).status, 409);
  assert.ok(db.prepare('SELECT hash FROM sessions WHERE userId=?').get('account-b').hash);
  assert.equal((await request('/api/auth/resend-verification', 'POST', {}, 'account-b')).status, 200);
  assert.equal((await request('/api/account', 'DELETE', {}, 'account-a')).status, 409);
  assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get('account-b').id, 'account-b');
  assert.equal((await request('/api/account', 'DELETE', {}, 'account-b')).status, 200);
  assert.equal((await request('/api/auth/logout', 'POST', {}, undefined)).status, 200);
});
