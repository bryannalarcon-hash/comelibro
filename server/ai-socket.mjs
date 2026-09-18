import http from 'node:http';
import { chmodSync, existsSync } from 'node:fs';
import { AI_LIMITS, cleanInput, runTask as nativeTask } from './ai.mjs';

export const SOCKET_LIMITS = Object.freeze({ requestBytes: AI_LIMITS.inputBytes + 1024, responseBytes: AI_LIMITS.protocolBytes, timeoutMs: 180000 });
const error = message => new Error(message);
const unavailable = () => error('The private AI worker is unavailable. Existing lessons and reading remain available.');

// The web process sends only server-derived account identity and task data, never credentials.
export function socketAdapter(socketPath, limits = SOCKET_LIMITS) {
  return { runTask({ accountId, accountRole, kind, input, signal, onProgress = () => {}, onEvent = () => {} }) {
    signal?.throwIfAborted();
    const body = JSON.stringify({ accountId, accountRole, kind, input });
    if (Buffer.byteLength(body) > limits.requestBytes) throw error('Choose a shorter passage for this AI task.');
    return new Promise((resolve, reject) => {
      let done = false, response, bytes = 0, pending = '', result, received = false;
      const finish = (err, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); request.destroy(); response?.destroy(); err ? reject(err) : resolve(value); };
      const abort = () => finish(error('AI request cancelled.'));
      const request = http.request({ socketPath, path: '/task', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
      const timer = setTimeout(() => finish(error('AI processing timed out. Please try again.')), limits.timeoutMs);
      request.on('error', () => finish(unavailable()));
      signal?.addEventListener('abort', abort, { once: true });
      request.on('response', res => {
        response = res;
        if (res.statusCode !== 200) return finish(unavailable());
        res.setEncoding('utf8');
        res.on('data', chunk => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > limits.responseBytes) return finish(error('AI output exceeded its limit.'));
          pending += chunk;
          try {
            let newline;
            while ((newline = pending.indexOf('\n')) !== -1) {
              const line = JSON.parse(pending.slice(0, newline)); pending = pending.slice(newline + 1);
              if (!line || typeof line !== 'object' || received) throw error('Invalid AI response.');
              if (line.type === 'progress' && Number.isFinite(line.progress) && typeof line.message === 'string') onProgress(line.progress, line.message);
              else if (line.type === 'event' && line.event && typeof line.event === 'object') onEvent(line.event);
              else if (line.type === 'result' && line.result && typeof line.result === 'object') { result = line.result; received = true; }
              else if (line.type === 'error') throw unavailable();
              else throw error('Invalid AI response.');
            }
          } catch (err) { finish(err); }
        });
        res.on('error', () => finish(unavailable()));
        res.on('end', () => received && !pending ? finish(null, result) : finish(unavailable()));
      });
      if (signal?.aborted) abort();
      else request.end(body);
    });
  } };
}

export function createAiWorker({ allowedUserId, runTask = nativeTask, limits = SOCKET_LIMITS } = {}) {
  if (typeof allowedUserId !== 'string' || !allowedUserId.trim() || allowedUserId.length > 200) throw error('Set the private worker allowed account ID.');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/task' || req.headers['content-type'] !== 'application/json') { res.writeHead(400).end(); return; }
    if (busy) { res.writeHead(503).end(); return; }
    busy = true;
    const controller = new AbortController();
    const stop = () => controller.abort();
    const timer = setTimeout(() => { stop(); res.destroy(); req.destroy(); }, limits.timeoutMs);
    res.on('close', stop); req.on('aborted', stop);
    let written = 0;
    const send = data => {
      controller.signal.throwIfAborted();
      const line = JSON.stringify(data) + '\n'; written += Buffer.byteLength(line);
      if (written > limits.responseBytes || res.writableLength > 512000) { stop(); throw error('AI output exceeded its limit.'); }
      res.write(line);
    };
    try {
      let bytes = 0, chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > limits.requestBytes) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const task = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const identity = typeof task?.accountId === 'string' && task.accountId.length <= 200 && (task.accountId === allowedUserId && ['learner', 'admin'].includes(task.accountRole) || task.accountRole === 'demo' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(task.accountId));
      if (!identity || !['help', 'curriculum'].includes(task.kind) || Object.keys(task).some(key => !['accountId', 'accountRole', 'kind', 'input'].includes(key))) { res.writeHead(403).end(); return; }
      const input = cleanInput(task.kind, task.input);
      controller.signal.throwIfAborted();
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
      res.flushHeaders();
      const result = await runTask({ accountId: task.accountId, accountRole: task.accountRole, kind: task.kind, input, signal: controller.signal, onProgress: (progress, message) => send({ type: 'progress', progress, message }), onEvent: event => send({ type: 'event', event }) });
      send({ type: 'result', result }); res.end();
    } catch {
      if (!res.destroyed) {
        if (!res.headersSent) res.writeHead(400).end();
        else { try { send({ type: 'error' }); res.end(); } catch { res.destroy(); } }
      }
    } finally {
      clearTimeout(timer); res.removeListener('close', stop); req.removeListener('aborted', stop); busy = false;
    }
  });
  server.headersTimeout = 10000; server.requestTimeout = limits.timeoutMs; server.maxConnections = 8;
  server.on('connection', socket => socket.setTimeout(limits.timeoutMs, () => socket.destroy()));
  return server;
}

export async function listenAiWorker(socketPath, options) {
  if (!socketPath?.startsWith('/') || existsSync(socketPath)) throw error('Use an unused absolute private socket path.');
  const server = createAiWorker(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  chmodSync(socketPath, 0o660);
  return server;
}
