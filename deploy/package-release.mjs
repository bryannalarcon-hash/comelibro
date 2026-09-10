import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] && resolve(process.argv[2]);
if (!output || output === root || relative(root, output) === '') throw new Error('Usage: node deploy/package-release.mjs NEW_OUTPUT_DIRECTORY');
const runtimeChanges = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'package.json', 'package-lock.json', 'requirements-pdf.txt', 'THIRD_PARTY_NOTICES.md', 'server', 'content', 'web'], { cwd: root, encoding: 'utf8' }).trim();
if (runtimeChanges) throw new Error(`Runtime files are dirty:\n${runtimeChanges}`);
await mkdir(output);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const files = [
  'package.json', 'package-lock.json', 'requirements-pdf.txt', 'THIRD_PARTY_NOTICES.md',
  'server/ai.mjs', 'server/app.mjs', 'server/index.mjs', 'server/mail.mjs',
  'server/models.mjs', 'server/pdf.mjs', 'server/pdf-worker.py', 'server/store.mjs',
  'content/catalog.json', 'content/don-quixote.json',
  'content/fixtures/sample-scan.pdf', 'content/fixtures/sample-spanish.txt', 'content/fixtures/sample-text.pdf',
  'content/tessdata/LICENSE', 'content/tessdata/PROVENANCE.md', 'content/tessdata/spa.traineddata',
  'evidence/pdfium-review/supplemental-notices/builtin-font-copyright.txt',
  'evidence/pdfium-review/supplemental-notices/compiler-rt.txt',
  'evidence/pdfium-review/supplemental-notices/libcxx.txt',
  'evidence/pdfium-review/supplemental-notices/libcxxabi.txt'
];

async function copy(name) {
  const target = join(output, name);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(root, name), target, { recursive: true, preserveTimestamps: true });
}
for (const name of files) await copy(name);

const pdfium = join(root, 'runtime/pdfium');
async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await cp(from, to, { preserveTimestamps: true });
  }
}
async function treeFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await treeFiles(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Runtime dependency must not contain symlinks: ${path}`);
  }
  return result;
}
const reviewedManifestPath = join(root, 'evidence/pdfium-review/runtime-package-manifest.json');
const reviewedManifest = JSON.parse(await readFile(reviewedManifestPath));
const reviewedPdfium = reviewedManifest.files.filter(file => file.path.startsWith('runtime/pdfium/'));
const reviewedPdfiumPaths = reviewedPdfium.map(file => file.path).sort();
const actualPdfium = (await treeFiles(pdfium)).map(path => relative(root, path)).sort();
if (actualPdfium.length !== reviewedPdfiumPaths.length || actualPdfium.some((path, index) => path !== reviewedPdfiumPaths[index])) throw new Error('PDFium runtime files differ from the independently reviewed manifest.');
for (const expected of reviewedPdfium) {
  const data = await readFile(join(root, expected.path));
  if (data.length !== expected.bytes || createHash('sha256').update(data).digest('hex') !== expected.sha256) throw new Error(`PDFium reviewed hash mismatch: ${expected.path}`);
}
const pdfiumBinaryHash = createHash('sha256').update(await readFile(join(pdfium, 'pypdfium2_raw/libpdfium.so'))).digest('hex');
if (pdfiumBinaryHash !== '224f8ece41f7e35891f11c10073b7b7062d7a18e9ef870586162a85c46130f7d') throw new Error('PDFium binary differs from the reviewed build.');
await copyTree(pdfium, join(output, 'runtime/pdfium'));

const dependencyPaths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').slice(1).filter(Boolean).sort();
for (const source of dependencyPaths) {
  const name = relative(root, source);
  if (!name.startsWith('node_modules/')) throw new Error(`Unexpected dependency path: ${source}`);
  await copyTree(source, join(output, name));
}

execFileSync(join(root, 'node_modules/.bin/vite'), ['build', 'web', '--outDir', join(output, 'web/dist')], { cwd: root, stdio: 'inherit' });

const productionTree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
await writeFile(join(output, 'PRODUCTION_DEPENDENCIES.json'), `${JSON.stringify(productionTree, null, 2)}\n`);
await writeFile(join(output, 'RELEASE_EXCLUSIONS.json'), `${JSON.stringify({
  excluded: [
    'research archives and raw source PDFs', 'user notes and private QA/runtime data',
    'tests, screenshots, reports, and development dependencies', 'mailbox credentials, tokens, owner credentials, and Codex account state',
    'Python bytecode caches and host libraries/executables'
  ],
  hostPrerequisites: ['Node.js 22+', 'Python 3.9+', 'Bubblewrap 0.11.1+', 'Tesseract OCR 5+', 'systemd', 'glibc and shared libgcc_s'],
  publicAi: false
}, null, 2)}\n`);

async function inventory(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'RELEASE_MANIFEST.json') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(path));
    else if (entry.isFile()) {
      const data = await readFile(path);
      result.push({ path: relative(output, path), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    } else if ((await lstat(path)).isSymbolicLink()) throw new Error(`Release must not contain symlinks: ${path}`);
  }
  return result;
}
const manifest = { version: 1, commit, platform: `${process.platform}-${process.arch}`, reviewedPdfiumManifestSha256: createHash('sha256').update(await readFile(reviewedManifestPath)).digest('hex'), pdfiumBinarySha256: pdfiumBinaryHash, fileCount: 0, files: [] };
manifest.files = (await inventory(output)).sort((a, b) => a.path.localeCompare(b.path));
manifest.fileCount = manifest.files.length;
await writeFile(join(output, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, commit, files: manifest.fileCount, dependencies: dependencyPaths.length }));
