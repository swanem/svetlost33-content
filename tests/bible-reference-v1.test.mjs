import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateBibleReference, validateBibleCandidate, assertBibleCandidate, validateBibleReleaseDirectory, adaptPsalmQuote, adaptCalendarReading, legacyCalendarLabelMatches } from '../scripts/validate-bible-reference-v1.mjs';
import { buildBibleReferenceFixture, FIXTURE_PATH } from '../scripts/generate-bible-reference-fixtures.mjs';
import { createWidgetExcerptPlan } from '../scripts/prepare-widget-excerpts-v2.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = await read(FIXTURE_PATH), fixture = JSON.parse(fixtureBytes);
const library = 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data';
const cycles = 'releases/v2/production/releases/shared-widget-excerpts-2026-09-18-m0v2-s4/modules/daily-cycles-r1-2026.1.2-r3/data';
const calendarPath = 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json';
const inputFor = async locale => ({ locale, generationId: fixture.context.generation_id,
  psalms: await json(`${library}/psalms.${locale}.json`), gospels: await json(`${library}/gospels.${locale}.json`),
  cycle: await json(`${cycles}/legacy-cycle.${locale}.json`), calendar: await json(calendarPath) });

test('frozen shared fixture is deterministic, exactly bound to published source bytes', async () => {
  assert.equal(hash(fixtureBytes), '49aa1b3390e1ba85217cba806c0030099817834362b9aa8875af02bf631cf98b');
  assert.equal(fixture.cases.length, 60);
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, 60);
  assert.deepEqual(Buffer.from(`${JSON.stringify(await buildBibleReferenceFixture(), null, 2)}\n`), fixtureBytes);
  for (const binding of fixture.source_bindings) {
    const bytes = await read(binding.path);
    assert.equal(bytes.length, binding.bytes); assert.equal(hash(bytes), binding.sha256);
  }
});

for (const c of fixture.cases) test(`shared reference: ${c.id}`, () => {
  assert.deepEqual(evaluateBibleReference(c.input, c.context_override ?? fixture.context), c.expected);
});

test('current S6 corpus semantic audit passes, does not pretend to authenticate or approve', async () => {
  const result = await validateBibleReleaseDirectory(resolve(root, 'releases/v2/production'));
  assert.equal(result.generation_id, fixture.context.generation_id);
  assert.equal(result.authentication, 'not_performed_by_this_semantic_validator');
  assert.deepEqual(result.results.map(result => result.counts), [{ quotes: 21, calendar_readings: 252 }, { quotes: 21, calendar_readings: 252 }]);
});

for (const locale of ['sr-Cyrl', 'sr-Latn']) test(`candidate gate rejects coherent-looking wrong references, text and links (${locale})`, async () => {
  const original = await inputFor(locale);
  const mutations = [
    ['missing_quote', input => { delete input.cycle.days[0].slots[0].quote.text; }],
    ['missing_quote', input => { input.cycle.days[0].slots[0].quote.text = ''; }],
    ['legacy_locale_mismatch', input => { input.cycle.locale = 'unknown'; }],
    ['legacy_attribution_mismatch', input => { input.psalms.psalms[0].translation = input.gospels.books[0].translation; }],
    ['legacy_attribution_mismatch', input => { input.gospels.books[0].translation = input.psalms.psalms[0].translation; }],
    ['legacy_label_mismatch', input => { input.cycle.days[0].slots[0].quote.reference = locale === 'sr-Cyrl' ? 'Пс 23,1 · Даничић' : 'Ps 23,1 · Daničić'; }],
    ['quote_mismatch', input => { input.cycle.days[0].slots[0].quote.text = input.psalms.psalms.find(psalm => psalm.id === 'psalm-23').verses[0].text; }],
    ['route_reference_mismatch', input => { input.cycle.days[0].slots[0].actions.primary.target_id = 'psalm-23'; input.cycle.days[0].slots[0].actions.primary.highlight_verses = [1]; }],
    ['legacy_source_route_mismatch', input => { input.cycle.days[0].slots[0].actions.source.target_id = 'EBIBLE-PSA023'; }],
    ['legacy_source_link_mismatch', input => { input.cycle.days[0].slots[0].quote.source_url = 'https://ebible.org/srp1868/PSA023.htm#V1'; }],
    ['malformed_legacy_quote', input => { input.cycle.days[0].slots[0].quote.verse_numbers = []; }],
    ['legacy_calendar_label_mismatch', input => { input.calendar.days[0].gospel.readings[0].source_reference = 'Јеванђеље по Марку, зачало 39. 9,11-16'; }],
    ['empty_ranges', input => { input.calendar.days[0].gospel.readings[0].segments = []; }],
    ['unknown_book', input => { input.calendar.days[0].gospel.readings[0].book = 'Unknown'; }]
  ];
  for (const [reason, mutate] of mutations) {
    const input = structuredClone(original); mutate(input);
    const result = validateBibleCandidate(input);
    assert.equal(result.valid, false, reason);
    assert.ok(result.errors.some(error => error.reason === reason), `${reason}: ${JSON.stringify(result.errors)}`);
    assert.throws(() => assertBibleCandidate(input), /Bible candidate rejected/);
  }
});

test('adapters preserve ranges and existing resource IDs, not source label parsing', async () => {
  const input = await inputFor('sr-Cyrl'), quote = input.cycle.days[0].slots[0].quote;
  const before = structuredClone(quote);
  assert.deepEqual(adaptPsalmQuote(quote), { book_id: 'PSA', translation_id: quote.translation_id, versification_id: quote.numbering,
    ranges: [{ start: { chapter: 5, verse: 3 }, end: { chapter: 5, verse: 3 } }] });
  assert.deepEqual(quote, before);
  assert.equal(quote.psalm_id, 'psalm-5');
  const reading = { book: 'Matthew', segments: [{ start: { chapter: 1, verse: 25 }, end: { chapter: 2, verse: 2 } }, { start: { chapter: 2, verse: 5 }, end: { chapter: 2, verse: 6 } }] };
  assert.deepEqual(adaptCalendarReading(reading).ranges, reading.segments);
  assert.notEqual(adaptCalendarReading(reading).ranges, reading.segments);
});

test('recorded separate readings retain order; multi-range grammar is explicit', async () => {
  const input = await inputFor('sr-Cyrl');
  const readings = input.calendar.days.find(day => day.date === '2026-05-19').gospel.readings;
  assert.deepEqual(readings.map(reading => reading.segments[0].start.chapter), [11, 10]);
  assertBibleCandidate(input);
  const reading = { book: 'Matthew', zachalo: 1, segments: [{ start: { chapter: 1, verse: 25 }, end: { chapter: 2, verse: 2 } }, { start: { chapter: 2, verse: 5 }, end: { chapter: 2, verse: 6 } }], source_reference: 'Јеванђеље по Матеју, зачало 1. 1,25-2,2; 2,5-6' };
  assert.equal(legacyCalendarLabelMatches(reading), true);
  reading.source_reference = reading.source_reference.replace('2,5-6', '2,6-7');
  assert.equal(legacyCalendarLabelMatches(reading), false);
});

test('real widget candidate gate preserves approved payloads and unsigned document hashes', async () => {
  const plan = await createWidgetExcerptPlan({ now: '2026-09-20T00:00:00Z' });
  for (const [path, bytes] of plan.files) {
    if (!path.startsWith('releases/shared-widget-excerpts-2026-09-18-m0v2-s4/')) continue;
    assert.deepEqual(bytes, await read(`releases/v2/production/${path}`), path);
  }
});

test('annual real exporter invokes semantic gate; legacy approved bytes pass without signing', async () => {
  const source = (await read('scripts/export-approved-r1-v2.mjs')).toString('utf8');
  assert.ok(source.includes('assertBibleCandidate({ locale, generationId: releaseSetId,'));
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    const path = 'releases/legacy/annual-2026-r1/payload';
    const result = assertBibleCandidate({ locale, generationId: 'shared-annual-2026-r1-m0v2-s2',
      psalms: await json(`${path}/psalms.${locale}.json`), gospels: await json(`${path}/gospels.${locale}.json`),
      cycle: await json(`${path}/legacy-cycle.${locale}.json`), calendar: await json(`${path}/calendar.2026.json`) });
    assert.equal(result.valid, true);
  }
});
