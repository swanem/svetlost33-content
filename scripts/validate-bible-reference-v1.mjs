#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PSALM_TRANSLATION = 'danicic-ebible-srp1868';
export const PSALM_VERSIFICATION = 'DANICIC_EBIBLE_SRP1868';
export const GOSPEL_TRANSLATION = 'VUK_KARADZIC_EBIBLE_SRP1868';
export const GOSPEL_VERSIFICATION = 'EBIBLE_SRP1868_SOURCE_CHAPTER_AND_VERSE';
export const CALENDAR_BOOKS = Object.freeze({ Matthew: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN' });
const labels = { PSA: ['Псалам', 'Psalam'], MAT: ['Мт', 'Mt'], MRK: ['Мк', 'Mk'], LUK: ['Лк', 'Lk'], JHN: ['Јн', 'Jn'] };
const failed = reason => ({ valid: false, reason });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|');
const position = value => keys(value, ['chapter', 'verse']) && ['chapter', 'verse'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0);
const compare = (a, b) => a.chapter - b.chapter || a.verse - b.verse;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonicalReference = reference => ({ book_id: reference.book_id, translation_id: reference.translation_id,
  versification_id: reference.versification_id, ranges: reference.ranges.map(range => ({ start: { chapter: range.start.chapter, verse: range.start.verse }, end: { chapter: range.end.chapter, verse: range.end.verse } })) });

export function formatBibleReference(reference, locale) {
  const prefix = labels[reference.book_id]?.[locale === 'sr-Cyrl' ? 0 : 1];
  if (!prefix || !['sr-Cyrl', 'sr-Latn'].includes(locale) || !reference.ranges?.length) throw new Error('Validate reference before formatting');
  const ranges = reference.ranges.map(({ start, end }) => {
    const beginning = `${start.chapter}, ${start.verse}`;
    if (compare(start, end) === 0) return beginning;
    return `${beginning}–${start.chapter === end.chapter ? end.verse : `${end.chapter}, ${end.verse}`}`;
  });
  return `${prefix} ${ranges.join('; ')}`;
}

// This is semantic/editorial validation, NEVER a replacement for M0 signatures,
// file hashes, dependency checks, approvals, or the caller's authenticated generation.
export function evaluateBibleReference(input, context) {
  if (!object(input) || !object(context) || !Array.isArray(context.books) || typeof context.generation_id !== 'string' || !context.generation_id) return failed('invalid_context');
  if (!['sr-Cyrl', 'sr-Latn'].includes(input.locale)) return failed('unsupported_locale');
  const ref = input.reference;
  if (!keys(ref, ['book_id', 'translation_id', 'versification_id', 'ranges']) || ['book_id', 'translation_id', 'versification_id'].some(key => typeof ref[key] !== 'string' || !ref[key])) return failed('malformed_reference');
  const books = context.books.filter(book => book.book_id === ref.book_id && book.locale === input.locale);
  if (books.length !== 1 || !labels[ref.book_id]) return failed('unknown_book');
  const book = books[0];
  if (ref.translation_id !== book.translation_id) return failed('unknown_translation');
  if (ref.versification_id !== book.versification_id) return failed('unknown_versification');
  if (!Array.isArray(ref.ranges) || ref.ranges.length === 0) return failed('empty_ranges');
  if (ref.ranges.length > 64) return failed('too_many_ranges');
  const selected = [], sourceIds = [];
  let previousEnd;
  for (const range of ref.ranges) {
    if (!keys(range, ['start', 'end']) || !position(range.start) || !position(range.end)) return failed('malformed_range');
    if (compare(range.start, range.end) > 0) return failed('reversed_range');
    if (previousEnd && compare(range.start, previousEnd) <= 0) return failed('unordered_or_overlapping_ranges');
    previousEnd = range.end;
    // Iterate actual chapter/verse records, not endpoint-only checks. Holes or
    // duplicate records are invalid even when both endpoints exist.
    const startChapter = book.chapters.filter(chapter => chapter.number === range.start.chapter);
    const endChapter = book.chapters.filter(chapter => chapter.number === range.end.chapter);
    if (startChapter.length !== 1 || endChapter.length !== 1 || range.end.chapter - range.start.chapter > book.chapters.length) return failed('missing_chapter');
    for (let number = range.start.chapter; number <= range.end.chapter; number++) {
      const chapters = book.chapters.filter(chapter => chapter.number === number);
      if (chapters.length !== 1) return failed('missing_chapter');
      const chapter = chapters[0];
      const start = number === range.start.chapter ? range.start.verse : 1;
      const end = number === range.end.chapter ? range.end.verse : chapter.verse_count;
      if (!Number.isInteger(chapter.verse_count) || chapter.verse_count < 1 || start > chapter.verse_count || end > chapter.verse_count) return failed('verse_out_of_bounds');
      if (!Array.isArray(chapter.verses)) return failed('missing_verse');
      for (let verse = start; verse <= end; verse++) {
        const matches = chapter.verses.filter(value => value.number === verse);
        if (matches.length !== 1 || typeof matches[0].text !== 'string' || !matches[0].text) return failed('missing_verse');
        if (selected.length === 4096) return failed('too_many_verses');
        selected.push({ key: `${ref.book_id}:${number}:${verse}`, text: matches[0].text });
      }
      if (typeof chapter.source_id !== 'string' || !chapter.source_id) return failed('missing_source');
      if (!sourceIds.includes(chapter.source_id)) sourceIds.push(chapter.source_id);
    }
  }
  const text = selected.map(verse => verse.text).join(' ');
  const label = formatBibleReference(ref, input.locale);
  const attribution = `${input.locale === 'sr-Cyrl' ? 'Превод' : 'Prevod'}: ${ref.book_id === 'PSA'
    ? (input.locale === 'sr-Cyrl' ? 'Ђура Даничић' : 'Đura Daničić')
    : (input.locale === 'sr-Cyrl' ? 'Вук Караџић' : 'Vuk Karadžić')}`;
  if (input.quote !== undefined && input.quote !== text) return failed('quote_mismatch');
  if (input.formatted_label !== undefined && input.formatted_label !== label) return failed('label_mismatch');
  if (input.attribution !== undefined && input.attribution !== attribution) return failed('attribution_mismatch');
  if (input.source_ids !== undefined && !equal(input.source_ids, sourceIds)) return failed('source_mismatch');
  if (input.route !== undefined) {
    if (!object(input.route) || input.route.generation_id !== context.generation_id) return failed('route_generation_mismatch');
    const destination = evaluateBibleReference({ reference: input.route.reference, locale: input.locale }, context);
    if (!destination.valid || !equal(canonicalReference(input.route.reference), canonicalReference(ref))) return failed('route_reference_mismatch');
    if (input.route.legacy_target_id !== undefined) {
      if (ref.book_id === 'PSA' && ref.ranges.some(range => range.start.chapter !== ref.ranges[0].start.chapter || range.end.chapter !== ref.ranges[0].start.chapter)) return failed('unsupported_legacy_route');
      const target = ref.book_id === 'PSA' ? `psalm-${ref.ranges[0].start.chapter}` : ref.book_id;
      if (input.route.legacy_target_id !== target) return failed('route_target_mismatch');
    }
  }
  return { valid: true, reason: null, label, attribution, text, verse_keys: selected.map(verse => verse.key), source_ids: sourceIds };
}

export function adaptBibleCorpus(psalms, gospels, locale) {
  if (!['sr-Cyrl', 'sr-Latn'].includes(locale) || psalms.locale !== locale || gospels.locale !== locale) throw new Error('Corpus locale mismatch');
  const chapters = psalms.psalms.map(psalm => {
    if (psalm.id !== `psalm-${psalm.psalm_number}` || psalm.numbering !== PSALM_VERSIFICATION || psalm.text_base !== 'DANICIC_NOT_LXX_TRANSLATION') throw new Error('Unsupported Psalm identity');
    return { number: psalm.psalm_number, verse_count: psalm.verse_count, source_id: psalm.source_id, verses: psalm.verses,
      source_url: psalm.source_url, original_translation: psalm.translation,
      unnumbered_source_superscriptions: psalm.unnumbered_source_superscriptions ?? [] };
  });
  if (gospels.numbering !== GOSPEL_VERSIFICATION) throw new Error('Unsupported Gospel versification');
  return [{ book_id: 'PSA', translation_id: PSALM_TRANSLATION, versification_id: PSALM_VERSIFICATION, locale, chapters },
    ...gospels.books.map(book => {
      if (!['MAT', 'MRK', 'LUK', 'JHN'].includes(book.id) || book.text_base !== GOSPEL_TRANSLATION) throw new Error('Unsupported Gospel identity');
      return { book_id: book.id, translation_id: book.text_base, versification_id: gospels.numbering, locale,
        original_translation: book.translation, chapters: book.chapters.map(chapter => ({ number: chapter.number,
          verse_count: chapter.verse_count, verses: chapter.verses, source_id: chapter.source_id, source_url: chapter.source_url,
          source_non_verse_metadata: chapter.source_non_verse_metadata ?? [] })) };
    })];
}

export function adaptPsalmQuote(quote) {
  if (!/^psalm-[1-9][0-9]*$/.test(quote.psalm_id) || !Array.isArray(quote.verse_numbers) || quote.verse_numbers.length === 0 || quote.verse_numbers.some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('Invalid legacy Psalm quote');
  const chapter = Number(quote.psalm_id.slice(6)), ranges = [];
  for (const verse of quote.verse_numbers) {
    const last = ranges.at(-1);
    if (last && verse === last.end.verse + 1) last.end.verse = verse;
    else ranges.push({ start: { chapter, verse }, end: { chapter, verse } });
  }
  return { book_id: 'PSA', translation_id: quote.translation_id, versification_id: quote.numbering, ranges };
}

export function adaptCalendarReading(reading) {
  return { book_id: CALENDAR_BOOKS[reading.book] ?? reading.book, translation_id: GOSPEL_TRANSLATION,
    versification_id: GOSPEL_VERSIFICATION, ranges: structuredClone(reading.segments) };
}

export function legacyPsalmLabelMatches(quote, locale) {
  const numbers = quote.verse_numbers;
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.some((number, i) => !Number.isSafeInteger(number) || (i > 0 && number !== numbers[i - 1] + 1))) return false;
  const verses = numbers.length === 1 ? `${numbers[0]}` : `${numbers[0]}–${numbers.at(-1)}`;
  return quote.reference === `${locale === 'sr-Cyrl' ? 'Пс' : 'Ps'} ${quote.psalm_id.slice(6)},${verses} · ${locale === 'sr-Cyrl' ? 'Даничић' : 'Daničić'}`;
}

export function legacyCalendarLabelMatches(reading) {
  const names = { Matthew: 'Матеју', Mark: 'Марку', Luke: 'Луки', John: 'Јовану' };
  if (!names[reading.book] || typeof reading.source_reference !== 'string') return false;
  const match = /^Јеванђеље по (Матеју|Марку|Луки|Јовану), зачало ([1-9][0-9]*)\. (.+)$/u.exec(reading.source_reference);
  if (!match || match[1] !== names[reading.book] || Number(match[2]) !== reading.zachalo) return false;
  const ranges = [];
  for (const item of match[3].split(/;\s*/u)) {
    const part = /^([1-9][0-9]*),\s*([1-9][0-9]*)(?:[-–](?:([1-9][0-9]*),\s*)?([1-9][0-9]*))?$/u.exec(item);
    if (!part) return false;
    ranges.push({ start: { chapter: Number(part[1]), verse: Number(part[2]) }, end: { chapter: Number(part[3] ?? part[1]), verse: Number(part[4] ?? part[2]) } });
  }
  // Parse only to VERIFY recorded source labels, never as runtime identity.
  return equal(ranges, reading.segments);
}

// A candidate gate: callers pass the byte-verified candidate's own annual files.
// Bibliographic originals / historical approvals are not rewritten by adapters.
export function validateBibleCandidate({ psalms, gospels, cycle, calendar, locale, generationId }) {
  const context = { generation_id: generationId, books: adaptBibleCorpus(psalms, gospels, locale) };
  const errors = [], counts = { quotes: 0, calendar_readings: 0 };
  const originalPsalmAttribution = locale === 'sr-Cyrl' ? 'Ђура Даничић — текст дигиталног издања eBible srp1868' : 'Đura Daničić — tekst digitalnog izdanja eBible srp1868';
  const originalGospelAttribution = locale === 'sr-Cyrl' ? 'Вук Стефановић Караџић — текст дигиталног издања eBible srp1868' : 'Vuk Stefanović Karadžić — tekst digitalnog izdanja eBible srp1868';
  for (const psalm of psalms.psalms) if (psalm.translation !== originalPsalmAttribution) errors.push({ id: psalm.id, reason: 'legacy_attribution_mismatch' });
  for (const book of gospels.books) if (book.translation !== originalGospelAttribution) errors.push({ id: book.id, reason: 'legacy_attribution_mismatch' });
  if (cycle && cycle.locale !== `${locale}-RS`) errors.push({ id: 'cycle', reason: 'legacy_locale_mismatch' });
  const check = (id, input) => { const result = evaluateBibleReference(input, context); if (!result.valid) errors.push({ id, reason: result.reason }); };
  if (cycle) for (const day of cycle.days) for (const slot of day.slots) {
    // A complete stored daily quote is mandatory; undefined must not fall
    // through to the evaluator's intentionally valid navigation-only mode.
    if (typeof slot.quote?.text !== 'string' || !slot.quote.text) { errors.push({ id: slot.id, reason: 'missing_quote' }); continue; }
    let reference;
    try { reference = adaptPsalmQuote(slot.quote); } catch { errors.push({ id: slot.id, reason: 'malformed_legacy_quote' }); continue; }
    const action = slot.actions?.primary;
    let routeReference;
    try { routeReference = adaptPsalmQuote({ ...slot.quote, psalm_id: action?.target_id, verse_numbers: action?.highlight_verses }); } catch { errors.push({ id: slot.id, reason: 'malformed_legacy_route' }); continue; }
    if (action.type !== 'open_local_psalm') errors.push({ id: slot.id, reason: 'wrong_route_type' });
    if (!legacyPsalmLabelMatches(slot.quote, locale)) errors.push({ id: slot.id, reason: 'legacy_label_mismatch' });
    if (slot.actions?.source?.target_id !== slot.quote.source_id || slot.actions?.source?.type !== 'open_local_source') errors.push({ id: slot.id, reason: 'legacy_source_route_mismatch' });
    const psalm = psalms.psalms.find(value => value.id === slot.quote.psalm_id);
    if (!psalm || slot.quote.source_page !== psalm.source_page || slot.quote.source_url !== `${psalm.source_url}#V${slot.quote.verse_numbers[0]}`) errors.push({ id: slot.id, reason: 'legacy_source_link_mismatch' });
    check(slot.id, { reference, locale, quote: slot.quote.text, source_ids: [slot.quote.source_id],
      route: { generation_id: generationId, reference: routeReference, legacy_target_id: action.target_id } });
    counts.quotes++;
  }
  if (calendar) for (const day of calendar.days) for (const [index, reading] of (day.gospel?.readings ?? []).entries()) {
    if (!legacyCalendarLabelMatches(reading)) errors.push({ id: `${day.date}:${index}`, reason: 'legacy_calendar_label_mismatch' });
    check(`${day.date}:${index}`, { reference: adaptCalendarReading(reading), locale });
    counts.calendar_readings++;
  }
  return { valid: errors.length === 0, errors, counts };
}

export function assertBibleCandidate(input) {
  const result = validateBibleCandidate(input);
  if (!result.valid) throw new Error(`Bible candidate rejected: ${JSON.stringify(result.errors)}`);
  return result;
}

export async function validateBibleReleaseDirectory(directory) {
  const parse = async path => JSON.parse(await readFile(resolve(directory, path)));
  const index = await parse('index.json');
  const set = await parse(index.channels.production.path);
  const annual = set.modules.find(module => module.module_id === 'library-annual-2026-r1');
  const cycle = set.modules.find(module => module.module_id === 'daily-cycles-r1');
  const calendar = set.modules.find(module => module.module_id === 'calendar-2026-r1');
  if (!annual || !cycle || !calendar) throw new Error('Exact annual, cycle and calendar modules required');
  const results = [];
  for (const locale of ['sr-Cyrl', 'sr-Latn']) results.push(assertBibleCandidate({ locale, generationId: set.release_set_id,
    psalms: await parse(`${dirname(annual.manifest_path)}/data/psalms.${locale}.json`),
    gospels: await parse(`${dirname(annual.manifest_path)}/data/gospels.${locale}.json`),
    cycle: await parse(`${dirname(cycle.manifest_path)}/data/legacy-cycle.${locale}.json`),
    calendar: await parse(`${dirname(calendar.manifest_path)}/data/calendar.2026.json`) }));
  return { generation_id: set.release_set_id, results, authentication: 'not_performed_by_this_semantic_validator' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await validateBibleReleaseDirectory(process.argv[2] ?? resolve(import.meta.dirname, '../releases/v2/production')), null, 2));
}
