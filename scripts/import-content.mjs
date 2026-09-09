import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = '/home/ubuntu/Downloads/Don-Quijote/sentence-segments.tsv';

export function parseSegments(tsv) {
  const lines = tsv.replace(/\r?\n$/, '').split(/\r?\n/);
  assert.equal(lines.shift(), 'section\tsegment\ttext', 'Unexpected TSV header');
  const chapters = new Map();

  for (const line of lines) {
    const firstTab = line.indexOf('\t');
    const secondTab = line.indexOf('\t', firstTab + 1);
    assert(firstTab > 0 && secondTab > firstTab, 'Malformed TSV row');
    const section = line.slice(0, firstTab);
    if (!/^\d+\.\d+$/.test(section)) continue;
    const segment = Number(line.slice(firstTab + 1, secondTab));
    const text = line.slice(secondTab + 1);
    assert(Number.isInteger(segment) && segment > 0 && text, `Invalid segment in ${section}`);
    if (!chapters.has(section)) {
      const [part, chapter] = section.split('.').map(Number);
      chapters.set(section, { id: section, title: `Parte ${part}, capítulo ${chapter}`, sentences: [] });
    }
    chapters.get(section).sentences.push({
      id: `dq-${section}-${segment}`,
      text,
      page: null,
      tags: openingTags[`dq-${section}-${segment}`] ?? [],
    });
  }

  return [...chapters.values()];
}

const openingTags = {
  'dq-1.1-1': ['present-meaning', 'imperfect-background', 'negation-scope', 'article-adjective-agreement', 'acordarse-de', 'possessive-cuyo', 'historical-vocabulary'],
  'dq-1.1-2': ['imperfect-background', 'nominal-quantity', 'weekday-habit', 'historical-vocabulary'],
  'dq-1.1-3': ['imperfect-background', 'article-adjective-agreement', 'pronominal-se', 'historical-vocabulary'],
};

export async function importBook(source = defaultSource, output = path.join(root, 'content/don-quixote.json')) {
  const tsv = await readFile(source, 'utf8');
  const chapters = parseSegments(tsv);
  const countPath = path.join(path.dirname(source), 'sentence-count.json');
  const counts = JSON.parse(await readFile(countPath, 'utf8'));
  const sentenceCount = chapters.reduce((total, chapter) => total + chapter.sentences.length, 0);
  assert.equal(chapters.length, counts.narrative_chapters);
  assert.equal(sentenceCount, counts.narrative_sentence_segments);

  const book = {
    id: 'don-quixote',
    title: 'Don Quijote de la Mancha',
    author: 'Miguel de Cervantes Saavedra',
    provenance: {
      work: 'The original novel, first published in two parts in 1605 and 1615, is in the public domain.',
      sourceEdition: 'Narrative text extracted from the local Don-Quijote-Completo.pdf. Its front matter identifies Elejandria as distributor, the Biblioteca Digital Hispánica copy as source, and Librería Bergua, Madrid, 1920 as the underlying edition.',
      sourcePdfSha256: counts.sha256,
      sourceScope: 'Narrative chapters only: PDF pages 34–550 and 562–1098. Covers, contents, publisher promotions, prologues, dedicatory material, and publication preliminaries are excluded.',
      segmentationMethod: counts.method,
      boundaryWarning: counts.caveat,
      importedSentenceCount: sentenceCount,
      importedChapterCount: chapters.length,
      tsvSha256: createHash('sha256').update(tsv).digest('hex'),
    },
    chapters,
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(book, null, 2)}\n`);
  return book;
}

async function generateFixtures() {
  const [{ PDFDocument, StandardFonts, rgb }, { createCanvas }] = await Promise.all([
    import('pdf-lib'),
    import('@napi-rs/canvas'),
  ]);
  const fixtureDir = path.join(root, 'content/fixtures');
  const text = await readFile(path.join(fixtureDir, 'sample-spanish.txt'), 'utf8');
  const lines = text.trimEnd().split('\n');
  const textPdf = await PDFDocument.create();
  const page = textPdf.addPage([595, 842]);
  const font = await textPdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => page.drawText(line, { x: 55, y: 780 - index * 24, size: 15, font, color: rgb(0.08, 0.08, 0.08) }));

  const canvas = createCanvas(1240, 1754);
  const context = canvas.getContext('2d');
  context.fillStyle = '#f8f5ed';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#202020';
  context.font = '30px sans-serif';
  lines.forEach((line, index) => context.fillText(line, 110, 180 + index * 52));
  const scanPdf = await PDFDocument.create();
  const scanPage = scanPdf.addPage([595, 842]);
  const image = await scanPdf.embedPng(canvas.toBuffer('image/png'));
  scanPage.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });

  await Promise.all([
    writeFile(path.join(fixtureDir, 'sample-text.pdf'), await textPdf.save()),
    writeFile(path.join(fixtureDir, 'sample-scan.pdf'), await scanPdf.save()),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceIndex = process.argv.indexOf('--source');
  await importBook(sourceIndex < 0 ? defaultSource : process.argv[sourceIndex + 1]);
  if (process.argv.includes('--fixtures')) await generateFixtures();
}
