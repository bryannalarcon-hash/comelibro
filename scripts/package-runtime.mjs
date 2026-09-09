import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] && resolve(process.argv[2]);
if (!output || output === root || relative(root, output) === '') throw new Error('Usage: node scripts/package-runtime.mjs NEW_OUTPUT_DIRECTORY');
await mkdir(output);

const files = [
  'THIRD_PARTY_NOTICES.md',
  'server/ai.mjs',
  'server/pdf.mjs',
  'server/pdf-worker.mjs',
  'content/tessdata/LICENSE',
  'content/tessdata/PROVENANCE.md',
  'content/tessdata/spa.traineddata',
  'node_modules/pdfjs-dist/LICENSE',
  'node_modules/pdfjs-dist/package.json',
  'node_modules/pdfjs-dist/legacy/build/pdf.mjs',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  'node_modules/@napi-rs/canvas/LICENSE',
  'node_modules/@napi-rs/canvas/README.md',
  'node_modules/@napi-rs/canvas/package.json',
  'node_modules/@napi-rs/canvas/geometry.js',
  'node_modules/@napi-rs/canvas/index.d.ts',
  'node_modules/@napi-rs/canvas/index.js',
  'node_modules/@napi-rs/canvas/js-binding.js',
  'node_modules/@napi-rs/canvas/load-image.js',
  'node_modules/@napi-rs/canvas/node-canvas.d.ts',
  'node_modules/@napi-rs/canvas/node-canvas.js',
  'node_modules/@napi-rs/canvas-linux-x64-gnu/README.md',
  'node_modules/@napi-rs/canvas-linux-x64-gnu/package.json',
  'node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node'
];

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
    'pdfjs-dist/standard_fonts/** (including GPL-2-with-exceptions Liberation assets)',
    'pdfjs-dist/{build,cmaps,iccs,image_decoders,types,wasm,web}/** (unused by the server worker)',
    '@napi-rs/canvas platform binaries other than linux-x64-gnu',
    'all development and unrelated application dependencies'
  ],
  hostPrerequisites: ['Node.js 22+', 'Bubblewrap', 'systemd user manager', 'Tesseract OCR with its shared libraries', 'Codex CLI 0.154.0 plus an authorized account']
}, null, 2)}\n`);
