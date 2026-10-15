import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCalendarBrowserFixtures, invokeCalendarBrowserCase, mutateCalendarBrowserFixture } from '../scripts/generate-calendar-browser-fixtures.mjs';
import { CALENDAR_BROWSER_MODULE, CALENDAR_BROWSER_LIMITS, civilDayOrdinal, evaluateCalendarBrowser, parseCalendarBrowserPayload, validateCalendarBrowserPayload, upcomingBrowserFeasts, resolveBrowserArchiveDay } from '../scripts/validate-calendar-browser-v1.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const fixtureBytes = await readFile(new URL('../fixtures/calendar-browser-v1/cases.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes);
const result = id => fixture.cases.find(item => item.id === id).expected;
const approved = () => ({ payload: mutateCalendarBrowserFixture(structuredClone(fixture.payload), fixture.synthetic_test_setup_mutations), context: structuredClone(fixture.context) });

test('calendar browser fixture is deterministic, synthetic and pending by default', () => {
  assert.equal(`${JSON.stringify(buildCalendarBrowserFixtures(), null, 2)}\n`, fixtureBytes.toString('utf8'));
  assert.equal(fixture.purpose, 'TEST_ONLY_SYNTHETIC_NOT_PUBLICATION_OR_OWNER_APPROVAL');
  assert.equal(fixture.payload.review_status, 'pending');
  assert.equal(fixture.payload.approval_id, null);
  assert.equal(new Set(fixture.cases.map(item => item.id)).size, fixture.cases.length);
  assert.deepEqual(evaluateCalendarBrowser(fixture.payload, fixture.context), { eligible: false, reason: 'unapproved' });
});

for (const item of fixture.cases) test(`calendar browser shared: ${item.id}`, () => {
  let payload = structuredClone(fixture.payload);
  if (item.synthetic_setup) payload = mutateCalendarBrowserFixture(payload, fixture.synthetic_test_setup_mutations);
  payload = mutateCalendarBrowserFixture(payload, item.payload_mutations);
  const context = mutateCalendarBrowserFixture(structuredClone(fixture.context), item.context_mutations);
  assert.deepEqual(invokeCalendarBrowserCase(item, payload, context), item.expected);
});

test('independent upcoming expectations: tomorrow, D+7, D+8, today exclusion and editorial priority', () => {
  assert.deepEqual(result('two-feasts-ordered').items.map(item => [item.date, item.days_away]), [['2030-01-07', 1], ['2030-01-14', 8]]);
  assert.deepEqual(result('today-not-repeated-in-upcoming').items.map(item => item.days_away), [7]);
  assert.deepEqual(result('d-plus-seven-in-announcement').items.filter(item => item.days_away <= 7).map(item => item.occurrence_id), ['test-occurrence-2']);
  assert.deepEqual(result('d-plus-eight-outside-announcement').items.filter(item => item.days_away <= 7).map(item => item.occurrence_id), ['test-occurrence-1']);
  assert.deepEqual(result('same-date-editorial-order').items.map(item => item.observance_id), ['test-observance-2', 'test-observance-1']);
  assert.equal(result('cyrillic-feasts').items[0].name, 'Пробни празник 1');
  assert.equal(result('two-feasts-ordered').items[0].name, 'Probni praznik 1');
  assert.equal(result('no-known-not-no-feasts').state, 'no_known_occurrence');
  assert.equal(result('future-year-not-inferred').state, 'unavailable');
  assert.deepEqual(result('future-year-not-inferred').coverage_years, [2030]);
  assert.equal(result('two-feasts-ordered').coverage, 'limited_catalog');
  assert.deepEqual(result('kind-alone-never-featured').items.map(item => item.observance_id), ['test-observance-1']);
});

test('independent archive expectations: all phases, gaps, explicit boundary, corrections and withdrawal', () => {
  const first = result('archive-first-date-three-phases');
  assert.equal(first.date, '2030-01-07'); assert.equal(first.state, 'available');
  assert.deepEqual(first.phases.map(item => item.selection.slot_id), ['test-slot-morning', 'test-slot-noon', 'test-slot-evening']);
  assert.deepEqual(first.phases[0].selection.verse_numbers, [1, 2]);
  assert.equal(first.phases[0].selection.policy_id, 'calendar-week-v1');
  assert.equal(first.phases[0].selection.library_binding.manifest_sha256, 'c'.repeat(64));
  assert.deepEqual(first.phases[0].selection.generation, fixture.context.generation);
  assert.equal(result('before-archive-start-unknown').state, 'archive_unavailable');
  assert.equal(result('after-last-record-unknown').state, 'uncovered');
  assert.equal(result('archive-future-year-not-reconstructed').state, 'uncovered');
  assert.deepEqual(result('archive-explicit-phase-gap').phases.map(item => item.state), ['phase_unavailable', 'available', 'phase_unavailable']);
  assert.equal(result('corrected-day-visibly-marked').state, 'corrected');
  assert.equal(result('corrected-day-visibly-marked').correction_id, 'test-reviewed-correction-1');
  assert.equal(result('corrected-with-missing-body-keeps-marker').state, 'content_unavailable');
  assert.equal(result('corrected-with-missing-body-keeps-marker').correction_id, 'test-reviewed-correction-1');
  assert.equal(result('withdrawn-even-with-bodies-removed').state, 'withdrawn');
  assert.deepEqual(result('withdrawn-even-with-bodies-removed').phases, []);
  assert.deepEqual(result('archive-independent-of-catalog'), first);
  assert.deepEqual(result('archive-no-calendar-binding'), first);
  assert.equal(result('wrong-weekday-valid-slot-rejected').state, 'content_unavailable');
});

test('mismatched exact content and generation never turn into latest content', () => {
  for (const id of ['missing-old-content-never-latest', 'archive-content-withdrawn', 'duplicate-archive-context-unavailable', 'archive-truthy-trust', 'unknown-policy-not-recomputed', 'unknown-policy-version', 'wrong-weekday-valid-slot-rejected']) {
    assert.equal(result(id).state, 'content_unavailable', id);
    assert.ok(result(id).phases.every(item => item.selection === null), id);
  }
  for (const item of fixture.cases.filter(item => /^archive-generation-|^(library|cycles)-(version|revision|manifest_sha256)-mismatch/.test(item.id))) {
    assert.equal(item.expected.state, 'content_unavailable', item.id);
    assert.ok(item.expected.phases.every(phase => phase.selection === null));
  }
  for (const item of fixture.cases.filter(item => /^browser-generation-/.test(item.id))) assert.equal(item.expected.reason, 'generation_mismatch');
  for (const item of fixture.cases.filter(item => /^catalog-generation-/.test(item.id))) assert.equal(item.expected.state, 'unavailable');
});

test('raw corruption, UTF-8, BOM, empty JSON, unsupported schema and limits fail closed', () => {
  const bytes = Buffer.from(JSON.stringify(fixture.payload));
  assert.equal(parseCalendarBrowserPayload(bytes).valid, true);
  for (const bytes of [Buffer.from('{'), Buffer.from([0xc0, 0xaf]), Buffer.from('{}'), Buffer.alloc(CALENDAR_BROWSER_LIMITS.bytes + 1, 32), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(fixture.payload))])]) assert.deepEqual(parseCalendarBrowserPayload(bytes), { valid: false, reason: 'malformed' });
  assert.equal(parseCalendarBrowserPayload(Buffer.concat([bytes, Buffer.alloc(CALENDAR_BROWSER_LIMITS.bytes - bytes.length, 32)])).valid, true);
  assert.deepEqual(validateCalendarBrowserPayload(null), { valid: false, reason: 'absent' });
  assert.equal(result('unsupported-schema').reason, 'unsupported_schema');
});

test('civil ordinal arithmetic handles Gregorian boundaries without Date.UTC year-0-to-99 behavior', () => {
  assert.equal(civilDayOrdinal('0001-01-01'), 1);
  assert.equal(civilDayOrdinal('0100-01-01') - civilDayOrdinal('0099-12-31'), 1);
  assert.equal(civilDayOrdinal('1900-03-01') - civilDayOrdinal('1900-02-28'), 1);
  assert.equal(civilDayOrdinal('2000-03-01') - civilDayOrdinal('2000-02-28'), 2);
  assert.equal(civilDayOrdinal('2027-01-01') - civilDayOrdinal('2026-12-31'), 1);
  assert.equal(civilDayOrdinal('2030-01-14') - civilDayOrdinal('2030-01-07'), 7);
  assert.equal((civilDayOrdinal('2030-01-07') - 1) % 7 + 1, 1);
  assert.equal(civilDayOrdinal('9999-12-31'), 3652059);
  assert.throws(() => civilDayOrdinal('0000-01-01'));
});

test('date-group cutoff preserves every same-date item and accurate further-coverage flag', () => {
  const { payload, context } = approved(), catalog = context.catalogContext.payload;
  const first = structuredClone(catalog.occurrences[0]), last = structuredClone(catalog.occurrences[1]);
  catalog.observances = []; catalog.occurrences = []; payload.feast_memberships = [];
  for (let index = 0; index < 52; index++) {
    const id = `test-observance-${String(index).padStart(3, '0')}`, occurrenceId = `test-occurrence-${String(index).padStart(3, '0')}`;
    catalog.observances.push({ id, kind: 'event', name: { 'sr-Cyrl': 'Проба', 'sr-Latn': 'Proba' }, description: { 'sr-Cyrl': 'Проба', 'sr-Latn': 'Proba' }, subject_ids: [], aliases: [], source_ids: ['test-source'], review_status: 'reviewed' });
    catalog.occurrences.push({ ...(index === 51 ? last : first), id: occurrenceId, observance_id: id });
    payload.feast_memberships.push({ observance_id: id, occurrence_ids: [occurrenceId], review_status: 'reviewed', source_ids: ['test-source'] });
  }
  catalog.coverage[0].occurrences = 52;
  let actual = upcomingBrowserFeasts(payload, context, { from_date: '2030-01-06', locale: 'sr-Latn' });
  assert.equal(actual.items.length, 51); assert.equal(actual.truncated, true);
  assert.equal(actual.items.at(-1).observance_id, 'test-observance-050');
  payload.feast_memberships.pop(); catalog.occurrences.pop(); catalog.observances.pop();
  catalog.coverage[0].occurrences = 51; catalog.coverage[0].mapped_dates = 1;
  actual = upcomingBrowserFeasts(payload, context, { from_date: '2030-01-06', locale: 'sr-Latn' });
  assert.equal(actual.items.length, 51); assert.equal(actual.truncated, false);
});

test('pure archive resolution does not mutate host, input or a captured prior result', () => {
  const { payload, context } = approved(), before = structuredClone({ payload, context });
  const first = resolveBrowserArchiveDay(payload, context, { date: '2030-01-07' });
  assert.deepEqual({ payload, context }, before);
  context.generation.sequence++;
  assert.equal(resolveBrowserArchiveDay(payload, context, { date: '2030-01-07' }).reason, 'generation_mismatch');
  assert.equal(first.phases[0].selection.generation.sequence, 10);
  assert.equal(first.phases[0].selection.slot_id, 'test-slot-morning');
});

test('new optional envelope fits unchanged M0 schema with no new transport type or mandatory dependencies', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/v2/module-manifest.schema.json', import.meta.url)));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  const manifest = { schema_version: 'svetlost33-module-manifest-2', module_id: CALENDAR_BROWSER_MODULE.module_id, module_type: 'library', version: fixture.payload.version, revision: 1, key_id: 'test-only-no-signature', capabilities: CALENDAR_BROWSER_MODULE.capabilities, dependencies: [], files: [{ path: CALENDAR_BROWSER_MODULE.payload_path, bytes: 1, sha256: '0'.repeat(64), content_type: 'application/json', encoding: 'utf-8' }] };
  assert.equal(validate(manifest), true);
  assert.equal(result('missing-optional-module').reason, 'absent');
  assert.equal(result('module-dependencies-mismatch').reason, 'module_mismatch');
});

test('existing signed fixture keeps unchanged anti-replay and expiry checks without new signing', async () => {
  const directory = resolve(import.meta.dirname, '../fixtures/v2/positive/release');
  const options = { platform: 'android', clientVersion: 99, now: '2030-01-07T12:00:00Z', trustedKeyId: 'svetlost33-fixture-key-1', clientCapabilities: ['library-v1', 'sr-Cyrl', 'sr-Latn', 'cycle-v1', 'calendar-v1', 'explicit-unknown', 'background-catalog-v1', 'calendar-browser-v1'] };
  assert.equal((await validateRelease(directory, options)).sequence, 1);
  await assert.rejects(validateRelease(directory, { ...options, minimumSequence: 2 }), error => error.code === 'REPLAY');
  await assert.rejects(validateRelease(directory, { ...options, now: '2100-01-01T00:00:00Z' }), error => error.code === 'TIME');
});
