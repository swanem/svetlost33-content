#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBibleCorpus, PSALM_TRANSLATION, PSALM_VERSIFICATION, GOSPEL_TRANSLATION, GOSPEL_VERSIFICATION } from './validate-bible-reference-v1.mjs';

const root = resolve(import.meta.dirname, '..');
const library = 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const FIXTURE_PATH = 'fixtures/bible-reference-v1/cases.json';
const range = (chapter, verse, endChapter = chapter, endVerse = verse) => ({ start: { chapter, verse }, end: { chapter: endChapter, verse: endVerse } });
const reference = (book, ranges) => ({ book_id: book, translation_id: book === 'PSA' ? PSALM_TRANSLATION : GOSPEL_TRANSLATION,
  versification_id: book === 'PSA' ? PSALM_VERSIFICATION : GOSPEL_VERSIFICATION, ranges });

export async function buildBibleReferenceFixture() {
  const source_bindings = [], books = [];
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    const documents = [];
    for (const kind of ['psalms', 'gospels']) {
      const path = `${library}/${kind}.${locale}.json`, bytes = await readFile(resolve(root, path));
      source_bindings.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
      documents.push(JSON.parse(bytes));
    }
    const selected = { PSA: [5, 16, 17, 23], MAT: [1, 2, 19], MRK: [2], LUK: [1], JHN: [5, 6] };
    for (const book of adaptBibleCorpus(...documents, locale)) books.push({ ...book, chapters: book.chapters.filter(chapter => selected[book.book_id].includes(chapter.number)) });
  }
  const context = { generation_id: 'shared-saints-2026-09-19-m0v2-s6', books };
  const cases = [];
  // Independent expected-value construction from the selected source records;
  // the evaluator itself is deliberately not used to generate expected results.
  const positive = (id, locale, ref, label) => {
    const book = books.find(book => book.book_id === ref.book_id && book.locale === locale);
    const verses = [], source_ids = [];
    for (const part of ref.ranges) for (const chapter of book.chapters) {
      if (chapter.number < part.start.chapter || chapter.number > part.end.chapter) continue;
      for (const verse of chapter.verses) if ((chapter.number > part.start.chapter || verse.number >= part.start.verse) && (chapter.number < part.end.chapter || verse.number <= part.end.verse)) verses.push({ key: `${ref.book_id}:${chapter.number}:${verse.number}`, text: verse.text });
      if (!source_ids.includes(chapter.source_id)) source_ids.push(chapter.source_id);
    }
    const text = verses.map(verse => verse.text).join(' ');
    const attribution = locale === 'sr-Cyrl' ? `Превод: ${ref.book_id === 'PSA' ? 'Ђура Даничић' : 'Вук Караџић'}` : `Prevod: ${ref.book_id === 'PSA' ? 'Đura Daničić' : 'Vuk Karadžić'}`;
    const input = { locale, reference: ref, quote: text, formatted_label: label, attribution, source_ids,
      route: { generation_id: context.generation_id, reference: structuredClone(ref), legacy_target_id: ref.book_id === 'PSA' ? `psalm-${ref.ranges[0].start.chapter}` : ref.book_id } };
    if (ref.book_id === 'PSA' && ref.ranges.some(range => range.end.chapter !== ref.ranges[0].start.chapter)) delete input.route.legacy_target_id;
    const entry = { id, input, expected: { valid: true, reason: null, label, attribution, text, verse_keys: verses.map(verse => verse.key), source_ids } };
    cases.push(entry); return entry;
  };
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    const cy = locale === 'sr-Cyrl', suffix = cy ? 'cyrl' : 'latn';
    positive(`psalm-single-${suffix}`, locale, reference('PSA', [range(16, 7)]), `${cy ? 'Псалам' : 'Psalam'} 16, 7`);
    positive(`psalm-range-${suffix}`, locale, reference('PSA', [range(16, 7, 16, 9)]), `${cy ? 'Псалам' : 'Psalam'} 16, 7–9`);
    positive(`psalm-cross-chapter-${suffix}`, locale, reference('PSA', [range(16, 11, 17, 2)]), `${cy ? 'Псалам' : 'Psalam'} 16, 11–17, 2`);
    positive(`gospel-range-${suffix}`, locale, reference('MAT', [range(19, 16, 19, 26)]), `${cy ? 'Мт' : 'Mt'} 19, 16–26`);
    positive(`gospel-cross-chapter-${suffix}`, locale, reference('JHN', [range(5, 30, 6, 2)]), `${cy ? 'Јн' : 'Jn'} 5, 30–6, 2`);
    positive(`gospel-multi-range-${suffix}`, locale, reference('MAT', [range(1, 25, 2, 2), range(2, 5, 2, 6)]), `${cy ? 'Мт' : 'Mt'} 1, 25–2, 2; 2, 5–6`);
    positive(`gospel-mark-${suffix}`, locale, reference('MRK', [range(2, 1)]), `${cy ? 'Мк' : 'Mk'} 2, 1`);
    positive(`gospel-luke-${suffix}`, locale, reference('LUK', [range(1, 1)]), `${cy ? 'Лк' : 'Lk'} 1, 1`);
    positive(`adjacent-ranges-preserved-${suffix}`, locale, reference('PSA', [range(16, 7), range(16, 8)]), `${cy ? 'Псалам' : 'Psalam'} 16, 7; 16, 8`);
  }
  const base = cases[0];
  const negative = (id, reason, mutate, source = base) => {
    const entry = { id, input: structuredClone(source.input), expected: { valid: false, reason } };
    mutate(entry); cases.push(entry);
  };
  negative('empty-ranges-all-empty-regression', 'empty_ranges', c => { c.input.reference.ranges = []; });
  negative('unknown-book', 'unknown_book', c => { c.input.reference.book_id = 'UNKNOWN'; });
  negative('legacy-resource-not-book-id', 'unknown_book', c => { c.input.reference.book_id = 'psalm-16'; });
  negative('unknown-translation', 'unknown_translation', c => { c.input.reference.translation_id = 'unknown'; });
  negative('wrong-known-translation', 'unknown_translation', c => { c.input.reference.translation_id = GOSPEL_TRANSLATION; });
  negative('unknown-versification', 'unknown_versification', c => { c.input.reference.versification_id = 'unknown'; });
  negative('lxx-is-not-a-verse-mapping', 'unknown_versification', c => { c.input.reference.versification_id = 'LXX'; });
  negative('missing-reference-identity', 'malformed_reference', c => { delete c.input.reference.translation_id; });
  negative('unexpected-reference-field', 'malformed_reference', c => { c.input.reference.label = 'Псалам 16, 7'; });
  negative('zero-verse', 'malformed_range', c => { c.input.reference.ranges[0].start.verse = 0; });
  negative('fractional-verse', 'malformed_range', c => { c.input.reference.ranges[0].start.verse = 1.5; });
  negative('string-chapter', 'malformed_range', c => { c.input.reference.ranges[0].start.chapter = '16'; });
  negative('reversed-range', 'reversed_range', c => { c.input.reference.ranges[0] = range(16, 8, 16, 7); });
  negative('reversed-cross-chapter', 'reversed_range', c => { c.input.reference.ranges[0] = range(17, 1, 16, 11); });
  negative('duplicate-range', 'unordered_or_overlapping_ranges', c => { c.input.reference.ranges.push(structuredClone(c.input.reference.ranges[0])); });
  negative('overlapping-ranges', 'unordered_or_overlapping_ranges', c => { c.input.reference.ranges = [range(16, 6, 16, 8), range(16, 8, 16, 9)]; });
  negative('unsorted-ranges-not-sorted-for-user', 'unordered_or_overlapping_ranges', c => { c.input.reference.ranges = [range(16, 8), range(16, 7)]; });
  negative('unknown-chapter', 'missing_chapter', c => { c.input.reference.ranges = [range(151, 1)]; });
  negative('out-of-bounds-verse', 'verse_out_of_bounds', c => { c.input.reference.ranges = [range(16, 12)]; });
  negative('valid-but-wrong-quote', 'quote_mismatch', c => { c.input.quote = books.find(b => b.book_id === 'PSA' && b.locale === 'sr-Cyrl').chapters.find(ch => ch.number === 23).verses[0].text; });
  negative('quote-whitespace-not-normalized', 'quote_mismatch', c => { c.input.quote += ' '; });
  negative('quote-nfd-is-not-source-nfc-bytes', 'quote_mismatch', c => { c.input.quote = c.input.quote.normalize('NFD'); assert.notEqual(c.input.quote, cases.find(c => c.id === 'psalm-single-latn').input.quote); }, cases.find(c => c.id === 'psalm-single-latn'));
  negative('wrong-valid-link', 'route_reference_mismatch', c => { c.input.route.reference.ranges = [range(16, 8)]; });
  negative('wrong-legacy-target', 'route_target_mismatch', c => { c.input.route.legacy_target_id = 'psalm-23'; });
  negative('cross-psalm-single-resource-route-is-unsupported', 'unsupported_legacy_route', c => { c.input.route.legacy_target_id = 'psalm-16'; }, cases.find(c => c.id === 'psalm-cross-chapter-cyrl'));
  negative('route-other-generation', 'route_generation_mismatch', c => { c.input.route.generation_id = 'older-generation'; });
  negative('bad-script-label', 'label_mismatch', c => { c.input.formatted_label = 'Psalam 16, 7'; });
  negative('internal-id-in-label', 'label_mismatch', c => { c.input.formatted_label += ' srp1868'; });
  negative('wrong-translator', 'attribution_mismatch', c => { c.input.attribution = 'Превод: Вук Караџић'; });
  negative('shared-bible-license-is-not-passage-translator', 'attribution_mismatch', c => { c.input.attribution = 'Превод: Даничић–Караџић'; });
  negative('wrong-source', 'source_mismatch', c => { c.input.source_ids = ['EBIBLE-PSA023']; });
  negative('unsupported-locale', 'unsupported_locale', c => { c.input.locale = 'en'; });
  negative('ranges-limit', 'too_many_ranges', c => { c.input.reference.ranges = Array.from({ length: 65 }, () => range(16, 7)); });
  const smallContext = () => ({ generation_id: context.generation_id, books: [{ ...structuredClone(books[0]), chapters: [structuredClone(books[0].chapters.find(ch => ch.number === 16))] }] });
  negative('missing-requested-verse', 'missing_verse', c => { c.context_override = smallContext(); c.context_override.books[0].chapters[0].verses = c.context_override.books[0].chapters[0].verses.filter(v => v.number !== 7); });
  negative('duplicate-requested-verse', 'missing_verse', c => { c.context_override = smallContext(); c.context_override.books[0].chapters[0].verses.push(structuredClone(c.context_override.books[0].chapters[0].verses.find(v => v.number === 7))); });
  negative('superscription-is-not-verse-zero', 'malformed_range', c => { c.input.reference.ranges = [range(16, 0)]; });
  negative('superscription-not-part-of-quote', 'quote_mismatch', c => { c.input.quote = `Запис Давидов. ${c.input.quote}`; });
  negative('missing-intermediate-verse', 'missing_verse', c => {
    c.input.reference.ranges = [range(16, 6, 16, 8)]; c.context_override = smallContext();
    c.context_override.books[0].chapters[0].verses = c.context_override.books[0].chapters[0].verses.filter(v => v.number !== 7);
  });
  negative('missing-intermediate-chapter', 'missing_chapter', c => { c.input.reference = reference('MAT', [range(1, 25, 19, 1)]); });
  negative('missing-text-source', 'missing_source', c => { c.context_override = smallContext(); delete c.context_override.books[0].chapters[0].source_id; });
  const navigation = structuredClone(base); navigation.id = 'navigation-without-quote'; delete navigation.input.quote; cases.push(navigation);
  const objectOrder = structuredClone(base); objectOrder.id = 'route-object-key-order-is-not-identity';
  objectOrder.input.route.reference = { ranges: objectOrder.input.route.reference.ranges, versification_id: PSALM_VERSIFICATION, translation_id: PSALM_TRANSLATION, book_id: 'PSA' }; cases.push(objectOrder);
  return { schema_version: 'svetlost33-bible-reference-test-fixtures-1', purpose: 'TEST_ONLY_ADAPTER_NOT_PRODUCTION_WIRE_FORMAT',
    source_bindings, context, cases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await buildBibleReferenceFixture(), bytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`);
  const path = resolve(root, FIXTURE_PATH);
  if (process.argv.includes('--write')) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
  else assert.deepEqual(await readFile(path), bytes, 'Deterministic fixture differs');
  console.log(JSON.stringify({ path: FIXTURE_PATH, cases: fixture.cases.length, bytes: bytes.length, sha256: sha256(bytes) }));
}
