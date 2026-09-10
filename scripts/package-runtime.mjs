import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] && resolve(process.argv[2]);
if (!output || output === root || relative(root, output) === '') throw new Error('Usage: node scripts/package-runtime.mjs NEW_OUTPUT_DIRECTORY');
await mkdir(output);

const files = [
  'THIRD_PARTY_NOTICES.md', 'requirements-pdf.txt',
  ...(await readdir(resolve(root, 'evidence/pdfium-review/supplemental-notices'))).sort().map(name => `evidence/pdfium-review/supplemental-notices/${name}`),
  'server/ai.mjs', 'server/pdf.mjs', 'server/pdf-worker.py',
  'content/tessdata/LICENSE', 'content/tessdata/PROVENANCE.md', 'content/tessdata/spa.traineddata',
  ...(await readdir(resolve(root, 'runtime/pdfium'), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && !entry.parentPath.includes('__pycache__') && !entry.name.endsWith('.pyc'))
    .map(entry => relative(root, resolve(entry.parentPath, entry.name))).sort()
];
const binary = await readFile(resolve(root, 'runtime/pdfium/pypdfium2_raw/libpdfium.so'));
if (createHash('sha256').update(binary).digest('hex') !== '224f8ece41f7e35891f11c10073b7b7062d7a18e9ef870586162a85c46130f7d') throw new Error('PDFium binary differs from the reviewed build. Reinstall requirements-pdf.txt.');

const manifest = [];
for (const name of files) {
  const source = resolve(root, name), target = resolve(output, name);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
  const data = await readFile(target);
  manifest.push({ path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile(resolve(output, 'RUNTIME_MANIFEST.json'), `${JSON.stringify({ platform: 'linux', architecture: 'x64-glibc', files: manifest }, null, 2)}\n`);
await writeFile(resolve(output, 'RUNTIME_EXCLUSIONS.json'), `${JSON.stringify({
  excluded: [
    'all PDF.js/canvas files and platform binaries (removed dependencies)',
    'Python bytecode caches and host Python/OCR/system libraries',
    'all development and unrelated application dependencies'
  ],
  hostPrerequisites: ['Node.js 22+', 'Python 3.9+', 'Bubblewrap', 'systemd user manager', 'Tesseract OCR with its shared libraries', 'glibc and shared libgcc_s (not bundled)', 'Codex CLI 0.154.0 plus an authorized account']
}, null, 2)}\n`);
