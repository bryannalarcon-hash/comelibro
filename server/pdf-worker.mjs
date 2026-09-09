// Runs only inside pdf.mjs's networkless, credential-free Bubblewrap boundary.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
let doc, loading;
try {
  loading = getDocument({ data: new Uint8Array(await readFile('/work/input.pdf')), isEvalSupported: false, useSystemFonts: false, stopAtErrors: true, maxImageSize: 16000000, canvasMaxAreaInBytes: 16000000, verbosity: 0 });
  doc = await loading.promise;
  if (doc.numPages > 10) fail('PDF_PAGES', 'Choose a PDF with at most 10 pages.');
  if (!doc.numPages) fail('PDF_INVALID', 'This PDF has no readable pages.');
  const pages = [], warnings = [];
  let total = 0;
  for (let page = 1; page <= doc.numPages; page++) {
    send({ type: 'progress', progress: (page - 1) / doc.numPages, message: `Reading page ${page} of ${doc.numPages}…` });
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    if (![base.width, base.height].every(n => Number.isFinite(n) && n > 0 && n <= 3000)) fail('PDF_RESOURCE', 'A page is too large to process safely.');
    let text = '';
    const stream = pdfPage.streamTextContent(), reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of value.items) if (typeof item.str === 'string') text += item.str + (item.hasEOL ? '\n' : ' ');
      if (text.length + total > 200000) fail('PDF_TEXT', 'This PDF contains too much text. Try a shorter passage.');
    }
    text = text.trim();
    if (text.replace(/\s/g, '').length < 40) {
      send({ type: 'progress', progress: (page - 0.5) / doc.numPages, message: `Reading Spanish scan, page ${page} of ${doc.numPages}…` });
      const scale = Math.min(2, Math.sqrt(3900000 / (base.width * base.height)));
      const viewport = pdfPage.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      if (canvas.width * canvas.height > 4000000) fail('PDF_RESOURCE', 'A scan is too large to process safely.');
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#fff' }).promise;
      const image = `/tmp/page-${page}.png`;
      await writeFile(image, canvas.toBuffer('image/png'));
      let ocr;
      try {
        ({ stdout: ocr } = await promisify(execFile)('/usr/bin/tesseract', [image, 'stdout', '--tessdata-dir', '/tessdata', '-l', 'spa', '--psm', '3'], { timeout: 15000, maxBuffer: 800000, env: { PATH: '/usr/bin', HOME: '/tmp', OMP_THREAD_LIMIT: '1' } }));
      } catch { fail('PDF_OCR', `Page ${page} could not be read as a scan. Try a clearer PDF.`); }
      finally { await unlink(image).catch(() => {}); }
      if (ocr.trim()) {
        text = [text, ocr.trim()].filter(Boolean).join('\n');
        warnings.push(`Page ${page} used Spanish OCR. Check names, accents, and punctuation before confirming.`);
      } else if (text) warnings.push(`Page ${page} has little selectable text. Check it before confirming.`);
      canvas.width = canvas.height = 1;
    }
    total += text.length;
    if (total > 200000) fail('PDF_TEXT', 'This PDF contains too much text. Try a shorter passage.');
    if (!text) warnings.push(`Page ${page} has no readable text. You can leave it blank or add corrected text before confirming.`);
    pages.push({ page, text });
    pdfPage.cleanup();
  }
  if (!pages.some(page => page.text)) fail('PDF_UNREADABLE', 'No readable text was found. Try a clearer scan or a PDF with selectable text.');
  send({ type: 'progress', progress: 1, message: 'Text is ready for you to check.' });
  send({ type: 'result', result: { pages, warnings } });
} catch (err) {
  const password = err.name === 'PasswordException';
  send({ type: 'error', code: password ? 'PDF_PASSWORD' : err.code || 'PDF_INVALID', message: password ? 'This PDF is password protected. Upload an unlocked copy.' : err.code ? err.message : 'This PDF is damaged or unreadable. Try another copy.' });
  process.exitCode = 1;
} finally { await loading?.destroy(); }
