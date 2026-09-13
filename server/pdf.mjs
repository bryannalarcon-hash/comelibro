import { open, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const PDF_LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, pages: 10, text: 200000, pixels: 4000000, decodedImagePixels: 16000000, objects: 10000, formDepth: 15, addressSpaceBytes: 1073741824, cpuSeconds: 45, timeoutMs: 90000 });
const root = fileURLToPath(new URL('../', import.meta.url));
const error = (code, message) => Object.assign(new Error(message), { code });

export function validatePdfResult(result) {
  if (!result || !Array.isArray(result.pages) || !result.pages.length || result.pages.length > PDF_LIMITS.pages || result.pages.some((page, index) => page?.page !== index + 1 || typeof page.text !== 'string') || result.pages.reduce((sum, page) => sum + page.text.length, 0) > PDF_LIMITS.text || !result.pages.some(page => page.text.trim()) || !Array.isArray(result.warnings) || result.warnings.length > PDF_LIMITS.pages * 2 || result.warnings.some(warning => typeof warning !== 'string' || warning.length > 1000)) throw error('PDF_RESOURCE', 'This PDF returned invalid processing data. Try another file.');
  return { pages: result.pages.map(page => ({ page: page.page, text: page.text })), warnings: [...result.warnings] };
}

export async function extractPdf({ path, signal, onProgress = () => {} }) {
  signal?.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > PDF_LIMITS.bytes) throw error('PDF_SIZE', 'Choose a PDF no larger than 5 MB.');
    const buffer = Buffer.alloc(PDF_LIMITS.bytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    bytes = buffer.subarray(0, bytesRead);
    if (bytes.length > PDF_LIMITS.bytes) throw error('PDF_SIZE', 'Choose a PDF no larger than 5 MB.');
    if (bytes.length < 8 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw error('PDF_INVALID', 'This file is not a readable PDF.');
  } finally { await file.close(); }
  const directory = await mkdtemp(join(tmpdir(), 'comelibro-pdf-'));
  try {
    await writeFile(join(directory, 'input.pdf'), bytes, { mode: 0o600 });
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const args = ['--cpu=45', '--core=0', '--as=1073741824', '--fsize=33554432', '--nofile=128', '--', '/usr/bin/bwrap',
        '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
        '--tmpfs', '/usr/share/fonts', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/work',
        '--ro-bind', join(directory, 'input.pdf'), '/work/input.pdf',
        '--ro-bind', join(root, 'server/pdf-worker.py'), '/worker.py',
        '--ro-bind', join(root, 'runtime/pdfium'), '/pdfium',
        '--ro-bind', join(root, 'content/tessdata'), '/tessdata',
        '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
        '--setenv', 'HOME', '/tmp', '--setenv', 'PATH', '/usr/bin', '--setenv', 'OMP_THREAD_LIMIT', '1',
        '--chdir', '/work', '/usr/bin/python3', '-I', '-B', '/worker.py'];
      const child = spawn('/usr/bin/prlimit', args, { detached: true, stdio: ['ignore', 'pipe', 'ignore'], env: { PATH: '/usr/bin' } }); // Never relay subprocess paths or parser diagnostics to the browser.
      let settled = false, pending = '', count = 0, result;
      const finish = (err, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        err ? reject(err) : resolve(value);
      };
      const abort = () => finish(error('ABORT_ERR', 'PDF processing was cancelled.'));
      const timer = setTimeout(() => finish(error('PDF_TIMEOUT', 'This PDF took too long to read. Try fewer pages or a clearer scan.')), PDF_LIMITS.timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.on('error', () => finish(error('PDF_UNAVAILABLE', 'PDF processing is unavailable. Please try again later.')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        count += Buffer.byteLength(chunk);
        if (count > 1500000) return finish(error('PDF_RESOURCE', 'This PDF contains too much text or processing output.'));
        pending += chunk.toString();
        let index;
        while ((index = pending.indexOf('\n')) !== -1 && !settled) {
          const line = pending.slice(0, index); pending = pending.slice(index + 1);
          if (!line.startsWith('{')) continue; // Ignore bounded native-library diagnostics.
          try {
            const event = JSON.parse(line);
            if (event.type === 'progress') onProgress(event.progress, event.message);
            if (event.type === 'error') finish(error(event.code, event.message));
            if (event.type === 'result') result = event.result;
          } catch { finish(error('PDF_INVALID', 'The PDF could not be read safely.')); }
        }
      });
      child.on('close', code => {
        if (code !== 0 || !result?.pages?.length) return finish(error('PDF_RESOURCE', 'This PDF could not be read within safe processing limits. Try a smaller or clearer file.'));
        try { finish(null, validatePdfResult(result)); }
        catch (err) { finish(err); }
      });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
