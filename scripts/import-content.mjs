import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = '/home/ubuntu/Downloads/Don-Quijote/sentence-segments.tsv';

function sourcePageLocator(sourceText) {
  if (sourceText === null) return () => null;
  const normalize = (text) => text.replace(/\s+/gu, ' ').trim();
  const pageStarts = [];
  let text = '';
  for (const page of sourceText.split('\f')) {
    if (text) text += ' ';
    pageStarts.push(text.length);
    text += normalize(page);
  }
  let cursor = 0;
  return (segmentId, segmentText) => {
    const needle = normalize(segmentText);
    const position = text.indexOf(needle, cursor);
    assert(position >= 0, `Cannot locate ${segmentId} in source pages`);
    cursor = position + needle.length;
    let low = 0;
    let high = pageStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (pageStarts[middle] <= position) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

export function parseSegments(tsv, sourceText = null) {
  const lines = tsv.replace(/\r?\n$/, '').split(/\r?\n/);
  assert.equal(lines.shift(), 'section\tsegment\ttext', 'Unexpected TSV header');
  const chapters = new Map();
  const locatePage = sourcePageLocator(sourceText);

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
    const id = `dq-${section}-${segment}`;
    const objectiveSpans = openingAssociations[id] ?? [];
    for (const { spans } of objectiveSpans) {
      assert(spans.every((span) => text.includes(span)), `Invalid objective span in ${id}`);
    }
    chapters.get(section).sentences.push({
      id,
      text,
      page: locatePage(id, text),
      tags: objectiveSpans.map(({ objectiveId }) => objectiveId),
      ...(objectiveSpans.length ? { objectiveSpans } : {}),
    });
  }

  for (const chapter of chapters.values()) {
    const occurrences = new Map();
    for (const sentence of chapter.sentences) {
      for (const { objectiveId, spans } of sentence.objectiveSpans ?? []) {
        if (!occurrences.has(objectiveId)) occurrences.set(objectiveId, []);
        occurrences.get(objectiveId).push(...spans.map((text) => ({ sentenceId: sentence.id, text })));
      }
    }
    chapter.objectiveOccurrences = [...occurrences].map(([objectiveId, locations]) => ({
      objectiveId,
      count: locations.length,
      locations,
    }));
    chapter.tags = chapter.objectiveOccurrences.map(({ objectiveId }) => objectiveId);
  }
  return [...chapters.values()];
}

const openingAssociations = {
  'dq-1.1-1': [
    { objectiveId: 'present-current-facts', spans: ['quiero'] },
    { objectiveId: 'archaic-temporal-haber', spans: ['no ha mucho tiempo'] },
    { objectiveId: 'imperfect-background', spans: ['vivía'] },
    { objectiveId: 'negation-scope', spans: ['no quiero'] },
    { objectiveId: 'article-adjective-agreement', spans: ['adarga antigua', 'rocín flaco', 'galgo corredor'] },
    { objectiveId: 'acordarse-de', spans: ['de cuyo nombre no quiero acordarme'] },
    { objectiveId: 'possessive-cuyo', spans: ['de cuyo nombre'] },
    { objectiveId: 'hidalgo-contextual-meaning', spans: ['hidalgo'] },
  ],
  'dq-1.1-2': [
    { objectiveId: 'imperfect-background', spans: ['consumían'] },
    { objectiveId: 'noun-quantity-comparison', spans: ['algo más vaca que carnero'] },
    { objectiveId: 'fractional-three-parts', spans: ['las tres partes de su hacienda'] },
    { objectiveId: 'weekday-habit', spans: ['los sábados', 'los viernes', 'los domingos'] },
  ],
  'dq-1.1-3': [
    { objectiveId: 'imperfect-background', spans: ['concluían', 'se honraba'] },
    { objectiveId: 'pronominal-se', spans: ['se honraba'] },
    { objectiveId: 'postverbal-subject-order', spans: ['El resto della concluían sayo de velarte, calzas de velludo'] },
    { objectiveId: 'archaic-della-reference', spans: ['El resto della'] },
    { objectiveId: 'velarte-contextual-meaning', spans: ['sayo de velarte'] },
  ],
};

export async function importBook(source = defaultSource, output = path.join(root, 'content/don-quixote.json')) {
  const [tsv, sourceText] = await Promise.all([
    readFile(source, 'utf8'),
    readFile(path.join(path.dirname(source), 'Don-Quijote-Completo.txt'), 'utf8'),
  ]);
  const chapters = parseSegments(tsv, sourceText);
  const countPath = path.join(path.dirname(source), 'sentence-count.json');
  const counts = JSON.parse(await readFile(countPath, 'utf8'));
  const sentenceCount = chapters.reduce((total, chapter) => total + chapter.sentences.length, 0);
  assert.equal(chapters.length, counts.narrative_chapters);
  assert.equal(sentenceCount, counts.narrative_sentence_segments);
  assert.equal(sourceText.split('\f').length, counts.pages + 1);

  const book = {
    id: 'don-quixote',
    title: 'Don Quijote de la Mancha',
    author: 'Miguel de Cervantes Saavedra',
    provenance: {
      work: 'The original novel, first published in two parts in 1605 and 1615, is in the public domain.',
      sourceEdition: 'Narrative text extracted from the local Don-Quijote-Completo.pdf. Its front matter identifies Elejandria as distributor, the Biblioteca Digital Hispánica copy as source, and Librería Bergua, Madrid, 1920 as the underlying edition.',
      sourcePdfSha256: counts.sha256,
      sourceTextSha256: createHash('sha256').update(sourceText).digest('hex'),
      sourceScope: 'Narrative chapters only: PDF pages 34–550 and 562–1098. Covers, contents, publisher promotions, prologues, dedicatory material, and publication preliminaries are excluded.',
      segmentationMethod: counts.method,
      boundaryWarning: counts.caveat,
      pageMappingMethod: 'Each segment is matched in order against whitespace-normalized text split at the source extraction form feeds; page is the one-based source PDF page containing the segment start.',
      pageMappingWarning: 'A segment may continue onto a later page; page records its starting page only.',
      importedSentenceCount: sentenceCount,
      importedChapterCount: chapters.length,
      tsvSha256: createHash('sha256').update(tsv).digest('hex'),
    },
    chapters,
    passages: [{
      id: 'dq-opening-1-3',
      title: 'Opening three sentences',
      chapterId: '1.1',
      sentenceIds: ['dq-1.1-1', 'dq-1.1-2', 'dq-1.1-3'],
    }],
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(book, null, 2)}\n`);
  return book;
}

export async function generateFixtures(fixtureDir = path.join(root, 'content/fixtures')) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const { execFileSync } = await import('node:child_process');
  const text = await readFile(path.join(fixtureDir, 'sample-spanish.txt'), 'utf8');
  const lines = text.trimEnd().split('\n');
  const textPdf = await PDFDocument.create();
  const page = textPdf.addPage([595, 842]);
  const font = await textPdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => page.drawText(line, { x: 55, y: 780 - index * 24, size: 15, font, color: rgb(0.08, 0.08, 0.08) }));

  // Rasterize synthetic text with the same reviewed PDFium build; PNG uses Python stdlib only.
  const textBytes = await textPdf.save();
  const png = execFileSync('/usr/bin/python3', ['-I', '-B', '-c', `
import sys, struct, zlib
from contextlib import closing
sys.path.insert(0, sys.argv[1])
import pypdfium2 as pdfium
import pypdfium2.raw as raw
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
with pdfium.PdfDocument(sys.stdin.buffer.read()) as doc, closing(doc[0]) as page, closing(page.render(scale=2, rev_byteorder=True, force_bitmap_format=raw.FPDFBitmap_BGR)) as bitmap:
    view = memoryview(bitmap.buffer).cast('B')
    rows = b''.join(b'\\0' + view[y*bitmap.stride:y*bitmap.stride+bitmap.width*3].tobytes() for y in range(bitmap.height))
    sys.stdout.buffer.write(b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', bitmap.width, bitmap.height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
`, path.join(root, 'runtime/pdfium')], { input: textBytes, maxBuffer: 16000000 });
  const scanPdf = await PDFDocument.create();
  const scanPage = scanPdf.addPage([595, 842]);
  const image = await scanPdf.embedPng(png);
  scanPage.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });

  await Promise.all([
    writeFile(path.join(fixtureDir, 'sample-text.pdf'), textBytes),
    writeFile(path.join(fixtureDir, 'sample-scan.pdf'), await scanPdf.save()),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceIndex = process.argv.indexOf('--source');
  await importBook(sourceIndex < 0 ? defaultSource : process.argv[sourceIndex + 1]);
  if (process.argv.includes('--fixtures')) await generateFixtures();
}
