import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSegments } from '../scripts/import-content.mjs';

const sourcePath = '/home/ubuntu/Downloads/Don-Quijote/sentence-segments.tsv';
const [source, sourceText, book, catalog] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile('/home/ubuntu/Downloads/Don-Quijote/Don-Quijote-Completo.txt', 'utf8'),
  readFile(new URL('./don-quixote.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./catalog.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const parsed = parseSegments(source, sourceText);
assert.equal(book.id, 'don-quixote');
assert.equal(book.chapters.length, 126);
assert.equal(book.provenance.importedSentenceCount, 8953);
assert.equal(book.provenance.sourcePdfSha256, '0cf50b7b3b8dfc7af9e475abf4f453ecfd1bc7fb8b76bdfcc1a2452894d62903');
assert.equal(book.provenance.sourceTextSha256, 'aad7ca790a6c653db8d56c06010053b5ebd2fca5a0a34cba466571e72d9fe6dc');
assert.deepEqual(book.chapters, parsed, 'Generated book must preserve every narrative TSV row and its order');
assert.deepEqual(book.passages, [{
  id: 'dq-opening-1-3',
  title: 'Opening three sentences',
  chapterId: '1.1',
  sentenceIds: ['dq-1.1-1', 'dq-1.1-2', 'dq-1.1-3'],
}]);

const sentences = book.chapters.flatMap((chapter) => chapter.sentences);
assert.equal(sentences.length, 8953);
assert.equal(new Set(sentences.map(({ id }) => id)).size, 8953);
assert(sentences.every(({ id, text, page, tags, objectiveSpans }) => /^dq-\d+\.\d+-\d+$/.test(id) && text && Number.isInteger(page) && page >= 34 && page <= 1098 && Array.isArray(tags) && (objectiveSpans === undefined || Array.isArray(objectiveSpans))));
assert(!book.chapters.some(({ id }) => id.startsWith('preliminaries')));

assert.equal(catalog.objectives.length, 15);
assert(catalog.placement.length >= 12);
assert.equal(catalog.lessons.length, 3);
const objectiveIds = new Set(catalog.objectives.map(({ id }) => id));
assert.equal(objectiveIds.size, catalog.objectives.length);
assert(sentences.flatMap(({ tags }) => tags).every((id) => objectiveIds.has(id)));
for (const sentence of sentences) {
  assert.deepEqual(sentence.tags, (sentence.objectiveSpans ?? []).map(({ objectiveId }) => objectiveId));
  for (const { objectiveId, spans } of sentence.objectiveSpans ?? []) {
    assert(objectiveIds.has(objectiveId));
    assert(spans.length > 0 && spans.every((span) => sentence.text.includes(span)));
  }
}
for (const chapter of book.chapters) {
  const expected = new Map();
  for (const sentence of chapter.sentences) {
    for (const { objectiveId, spans } of sentence.objectiveSpans ?? []) {
      if (!expected.has(objectiveId)) expected.set(objectiveId, []);
      expected.get(objectiveId).push(...spans.map((text) => ({ sentenceId: sentence.id, text })));
    }
  }
  assert.deepEqual(chapter.objectiveOccurrences, [...expected].map(([objectiveId, locations]) => ({ objectiveId, count: locations.length, locations })));
  assert.deepEqual(chapter.tags, chapter.objectiveOccurrences.map(({ objectiveId }) => objectiveId));
}
assert.equal(book.chapters.slice(1).flatMap(({ objectiveOccurrences }) => objectiveOccurrences).length, 0, 'Only the reviewed opening is annotated');

const questions = [...catalog.placement, ...catalog.lessons.flatMap(({ questions }) => questions)];
assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
for (const question of questions) {
  assert(objectiveIds.has(question.objectiveId), `${question.id} has an unknown objective`);
  assert.equal(question.objectiveVersion, 1);
  assert(Array.isArray(question.choices) && question.choices.length >= 2);
  assert(Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex < question.choices.length);
  assert.equal(typeof question.explanation, 'string');
  if (catalog.placement.includes(question)) assert(Number.isInteger(question.difficulty) && question.difficulty >= 1 && question.difficulty <= 4);
}
const bySentenceId = new Map(sentences.map((sentence) => [sentence.id, sentence]));
for (const question of catalog.lessons.flatMap(({ questions }) => questions)) {
  assert.equal(typeof question.sourceSpan?.sentenceId, 'string');
  assert.equal(typeof question.sourceSpan?.text, 'string');
  assert(bySentenceId.get(question.sourceSpan.sentenceId)?.text.includes(question.sourceSpan.text), `${question.id} has an invalid source span`);
}
for (const lesson of catalog.lessons) {
  assert.equal(lesson.bookId, book.id);
  assert(lesson.estimatedMinutes >= 5 && lesson.estimatedMinutes <= 8);
  assert(lesson.questions.length >= 4 && lesson.questions.length <= 6);
  assert(lesson.questions.some(({ type }) => type === 'fresh-transfer'));
  assert(lesson.questions.some(({ type }) => type === 'target-comprehension'));
  assert(lesson.objectiveIds.every((id) => objectiveIds.has(id)));
}

let reviewCount = 0;
function checkReviews(value) {
  if (!value || typeof value !== 'object') return;
  if ('review' in value) {
    reviewCount += 1;
    assert.equal(value.review.status, 'approved');
    assert.equal(typeof value.review.reviewer, 'string');
    assert(value.review.reviewer.trim(), 'Approved reviews require a named independent reviewer');
    assert.equal(value.review.version, value.version);
    assert.equal(typeof value.review.reason, 'string');
    assert(value.review.reason.length >= 24);
  }
  for (const child of Object.values(value)) checkReviews(child);
}
checkReviews(catalog);
assert.equal(reviewCount, catalog.objectives.length + questions.length + catalog.lessons.length + catalog.glossary.length);

console.log(`content ok: ${book.chapters.length} chapters, ${sentences.length} sentences, ${catalog.objectives.length} objectives, ${catalog.placement.length} placement questions, ${catalog.lessons.length} lessons`);
