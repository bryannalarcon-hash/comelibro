import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSegments } from '../scripts/import-content.mjs';

const sourcePath = '/home/ubuntu/Downloads/Don-Quijote/sentence-segments.tsv';
const [source, book, catalog] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(new URL('./don-quixote.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./catalog.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const parsed = parseSegments(source);
assert.equal(book.id, 'don-quixote');
assert.equal(book.chapters.length, 126);
assert.equal(book.provenance.importedSentenceCount, 8953);
assert.equal(book.provenance.sourcePdfSha256, '0cf50b7b3b8dfc7af9e475abf4f453ecfd1bc7fb8b76bdfcc1a2452894d62903');
assert.deepEqual(book.chapters, parsed, 'Generated book must preserve every narrative TSV row and its order');

const sentences = book.chapters.flatMap((chapter) => chapter.sentences);
assert.equal(sentences.length, 8953);
assert.equal(new Set(sentences.map(({ id }) => id)).size, 8953);
assert(sentences.every(({ id, text, page, tags }) => /^dq-\d+\.\d+-\d+$/.test(id) && text && page === null && Array.isArray(tags)));
assert(!book.chapters.some(({ id }) => id.startsWith('preliminaries')));

assert(catalog.objectives.length >= 8 && catalog.objectives.length <= 12);
assert(catalog.placement.length >= 12);
assert.equal(catalog.lessons.length, 3);
const objectiveIds = new Set(catalog.objectives.map(({ id }) => id));
assert.equal(objectiveIds.size, catalog.objectives.length);
assert(sentences.flatMap(({ tags }) => tags).every((id) => objectiveIds.has(id)));

const questions = [...catalog.placement, ...catalog.lessons.flatMap(({ questions }) => questions)];
assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
for (const question of questions) {
  assert(objectiveIds.has(question.objectiveId), `${question.id} has an unknown objective`);
  assert.equal(question.objectiveVersion, 1);
  assert(Array.isArray(question.choices) && question.choices.length >= 2);
  assert(Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex < question.choices.length);
  assert.equal(typeof question.explanation, 'string');
}
const bySentenceId = new Map(sentences.map((sentence) => [sentence.id, sentence]));
for (const question of catalog.lessons.flatMap(({ questions }) => questions)) {
  if (question.sourceSpan === null) continue;
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

const pendingReason = 'Awaiting independent semantic review';
let reviewCount = 0;
function checkReviews(value) {
  if (!value || typeof value !== 'object') return;
  if ('review' in value) {
    reviewCount += 1;
    assert.deepEqual(value.review, { status: 'pending', reviewer: null, reason: pendingReason });
  }
  for (const child of Object.values(value)) checkReviews(child);
}
checkReviews(catalog);
assert.equal(reviewCount, catalog.objectives.length + questions.length + catalog.lessons.length + catalog.glossary.length);

console.log(`content ok: ${book.chapters.length} chapters, ${sentences.length} sentences, ${catalog.objectives.length} objectives, ${catalog.placement.length} placement questions, ${catalog.lessons.length} lessons`);
