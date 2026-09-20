import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildLiturgicalCatalogFixtures, mutateFixture, CALENDAR_PATH } from '../scripts/generate-liturgical-catalog-fixtures.mjs';
import { validateCatalogPayload, parseCatalogPayload, evaluateCatalog, resolveCatalogDay, searchCatalog, normalizeCatalogQuery, catalogDependencies, CATALOG_LIMITS } from '../scripts/validate-liturgical-catalog-v1.mjs';

const root = resolve(import.meta.dirname, '..');
const bytes = await readFile(resolve(root, 'fixtures/liturgical-catalog-v1/catalog-candidate.json'));
const expectedBytes = await readFile(resolve(root, 'fixtures/liturgical-catalog-v1/expected.json'));
const payload = JSON.parse(bytes), expected = JSON.parse(expectedBytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const setup = () => { const p = structuredClone(payload); mutateFixture(p, expected.synthetic_test_setup_mutations); return { payload: p, context: structuredClone(expected.context) }; };
const invoke = (item, p, host) => item.operation === 'search' ? searchCatalog(p, host, item.input) : item.operation === 'day' ? resolveCatalogDay(p, host, item.input) : evaluateCatalog(p, host);
const result = id => expected.cases.find(item => item.id === id).expected;

test('I2 candidate and cases are deterministic, source-bound and not runtime-approved', async () => {
  const built = await buildLiturgicalCatalogFixtures();
  assert.deepEqual(built.payloadBytes, bytes); assert.deepEqual(built.expectedBytes, expectedBytes);
  assert.equal(hash(bytes), expected.candidate_sha256); assert.equal(bytes.length, expected.candidate_bytes);
  assert.equal(new Set(expected.cases.map(item => item.id)).size, expected.cases.length);
  for (const binding of expected.source_bindings) {
    const sourceBytes = await readFile(resolve(root, binding.repository_path));
    assert.equal(hash(sourceBytes), binding.sha256); assert.equal(sourceBytes.length, binding.bytes);
  }
  assert.deepEqual(validateCatalogPayload(payload), { valid: true, reason: null });
  assert.deepEqual(parseCatalogPayload(bytes), { valid: true, reason: null, payload });
  assert.equal(payload.review_status, 'pending'); assert.equal(payload.approval_id, null);
  assert.ok(payload.sources.every(source => source.rights_status === 'pending'));
  assert.deepEqual(evaluateCatalog(payload, expected.context), { eligible: false, reason: 'unapproved' });
});

for (const item of expected.cases) test(`catalog shared: ${item.id}`, () => {
  const p = structuredClone(payload), host = structuredClone(expected.context);
  if (item.synthetic_setup) mutateFixture(p, expected.synthetic_test_setup_mutations);
  mutateFixture(p, item.payload_mutations); mutateFixture(host, item.context_mutations);
  assert.deepEqual(invoke(item, p, host), item.expected);
});

test('independent semantics: all generation mismatch variants fail, pending metadata cannot leak dates', () => {
  for (const item of expected.cases.filter(item => /generation-mismatch|same-id-different/.test(item.id))) assert.deepEqual(item.expected, { eligible: false, reason: 'generation_mismatch' }, item.id);
  for (const id of ['pending-observance-hidden', 'pending-subject-hidden']) assert.equal(result(id).state, 'no_match');
  assert.deepEqual(result('pending-occurrence-does-not-show-date').results[0].dates, []);
  assert.equal(result('pending-occurrence-day-uncovered').state, 'uncovered');
  assert.deepEqual(result('query-too-long-no-truncation'), { eligible: false, reason: 'query_too_long' });
});

test('independent search assertions: script/diacritics, ambiguity, groups, feast and missing year', () => {
  for (const item of expected.cases.filter(item => item.id.startsWith('miholjdan-'))) assert.deepEqual(item.expected.results.map(item => item.observance_id), ['obs-cyriacus-miholjdan']);
  for (const item of expected.cases.filter(item => item.id.startsWith('djurdjevdan-'))) assert.deepEqual(item.expected.results.map(item => item.observance_id), ['obs-george']);
  assert.equal(normalizeCatalogQuery('Љ ЉУБЉАНА љ'), 'lj ljubljana lj');
  assert.equal(normalizeCatalogQuery('Đurđevdan DJURDJЕVDАN'), 'djurdjevdan djurdjevdan');
  assert.equal(normalizeCatalogQuery('ČĆŠŽ čćšž'.normalize('NFD')), 'ccsz ccsz');
  assert.deepEqual(result('ambiguous-nicholas-date-order').results.map(item => item.observance_id), ['obs-nicholas-relics-transfer', 'obs-nicholas-december']);
  assert.deepEqual(result('ambiguous-michael-date-order').results.map(item => item.observance_id), ['obs-michael-chonae', 'obs-michael-synaxis']);
  const tie = result('unavailable-date-ascii-id-tiebreak').results.map(item => item.observance_id);
  assert.deepEqual(tie, [...tie].sort());
  assert.equal(result('group-peter-paul').results[0].kind, 'group_commemoration');
  assert.deepEqual(result('feast-mala-gospojina').results[0].subject_ids, []);
  for (const id of ['unresolved-nektarios', 'unresolved-stefan', 'year-2027-no-date-copy']) assert.deepEqual(result(id).results[0].dates, []);
  assert.deepEqual(result('2027-identity-and-article-without-2027-date').results[0].article_ids, ['nativity-theotokos']);
  assert.deepEqual(result('2027-identity-and-article-without-2027-date').results[0].dates, []);
  assert.deepEqual(result('2027-identity-and-article-without-2027-date').results[0].occurrence_ids, []);
  for (const id of ['article-authentication-false', 'article-authentication-truthy-string', 'wrong-article-hash-unavailable', 'wrong-article-calendar-hash-unavailable', 'pending-article-link-unavailable', 'missing-article-id-unavailable']) assert.deepEqual(result(id).results[0].article_ids, [], id);
});

test('coverage derives from 13 exact calendar rows; all ten old choices inventoried without migrating settings', async () => {
  assert.equal(payload.subjects.length, 12); assert.equal(payload.observances.length, 15); assert.equal(payload.occurrences.length, 13);
  assert.deepEqual(payload.legacy_slava_links.map(item => item.legacy_id).sort(), ['sveta-petka', 'sveti-sava', 'sveti-nikola', 'sveti-jovan', 'sveti-georgije', 'sveti-dimitrije', 'arhangel-mihailo', 'sveti-stefan-decanski', 'sveti-simeon', 'sveti-nektarije'].sort());
  const calendar = JSON.parse(await readFile(resolve(root, CALENDAR_PATH)));
  for (const item of payload.occurrences) {
    const day = calendar.days.find(day => day.date === item.date);
    assert.equal(day.julian_date, item.julian_date); assert.equal(day.commemoration.title_cyrl, item.calendar_title['sr-Cyrl']);
    assert.deepEqual(day.commemoration.source_ids, item.calendar_source_ids);
  }
  assert.ok(!payload.occurrences.some(item => ['obs-nektarios-aegina', 'obs-stefan-decanski'].includes(item.observance_id)));
  assert.equal(payload.coverage[1].status, 'unavailable'); assert.equal(payload.coverage[1].calendar_binding_id, null);
  assert.equal(result('missing-is-not-confirmed-none').state, 'uncovered');
  assert.equal(result('synthetic-explicit-confirmed_none').state, 'confirmed_none');
  assert.equal(result('synthetic-explicit-unresolved').state, 'unresolved');
  assert.equal(result('year-boundary-unavailable').state, 'year_unavailable');
});

test('raw payload limit and closed shape reject malformed input before optional runtime use', () => {
  for (const bad of [Buffer.alloc(CATALOG_LIMITS.bytes + 1, 32), Buffer.from([0xc0, 0xaf]), Buffer.from('{}'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])]) assert.equal(parseCatalogPayload(bad).valid, false);
  for (const mutate of [
    p => { p.sources[0].url = 'https://user:password@example.com'; },
    p => { p.observances[0].name['sr-Cyrl'] = '<b>Име</b>'; },
    p => { p.observances[0].name['sr-Cyrl'] = 'Име\u202e'; },
    p => { p.occurrences[0].date = '2027-10-27'; },
    p => { p.observances[0].subject_ids = ['group-apostles-peter-paul']; },
    p => { p.coverage[0].mapped_dates++; },
    p => { p.calendar_bindings[0].path = 'data/calendar.2027.json'; }
  ]) { const p = structuredClone(payload); mutate(p); assert.equal(validateCatalogPayload(p).valid, false); }
});

test('dynamic dependencies omit saints only when no article binding/link is present', () => {
  const p = structuredClone(payload);
  assert.deepEqual(catalogDependencies(p), [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }, { module_id: 'saints-v1', version: '2026.9.19' }]);
  p.article_links = []; p.article_bindings = [];
  assert.equal(validateCatalogPayload(p).valid, true);
  assert.deepEqual(catalogDependencies(p), [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }]);
});

test('strict boolean article trust and duplicate/source context ambiguity fail closed', () => {
  const { payload: p, context } = setup();
  context.articleContexts[0].authenticated = 1;
  const input = { query: 'Mala Gospojina', locale: 'sr-Latn', year: 2026, calendar_profile_id: payload.calendar_profiles[0].id };
  assert.deepEqual(searchCatalog(p, context, input).results[0].article_ids, []);
  context.calendarContexts.push(structuredClone(context.calendarContexts[0]));
  assert.deepEqual(evaluateCatalog(p, context), { eligible: false, reason: 'calendar_not_authenticated' });
});

test('exact raw-byte, Unicode scalar and numeric/boolean boundaries', () => {
  assert.equal(parseCatalogPayload(Buffer.concat([bytes, Buffer.alloc(CATALOG_LIMITS.bytes - bytes.length, 32)])).valid, true);
  const { payload: p, context } = setup();
  const input = { query: '🙏'.repeat(128), locale: 'sr-Latn', year: 2026, calendar_profile_id: payload.calendar_profiles[0].id };
  assert.equal(searchCatalog(p, context, input).state, 'empty_query');
  input.query += '🙏'; assert.equal(searchCatalog(p, context, input).reason, 'query_too_long');
  for (const length of [200, 201]) {
    const changed = structuredClone(payload);
    changed.observances[0].name = { 'sr-Cyrl': '🙏'.repeat(length), 'sr-Latn': '🙏'.repeat(length) };
    assert.equal(validateCatalogPayload(changed).valid, length === 200);
  }
  for (const value of [true, 1.5, 9007199254740992]) {
    const changed = structuredClone(payload); changed.revision = value;
    assert.equal(validateCatalogPayload(changed).valid, false);
    const host = structuredClone(context); host.generation.sequence = value;
    assert.equal(evaluateCatalog(p, host).reason, 'generation_mismatch');
  }
  const booleanHost = structuredClone(context); booleanHost.contentAuthenticated = 'true';
  assert.equal(evaluateCatalog(p, booleanHost).reason, 'content_not_authenticated');
  context.moduleContext.dependencies = context.moduleContext.dependencies.map(item => ({ version: item.version, module_id: item.module_id }));
  assert.deepEqual(evaluateCatalog(p, context), { eligible: true, reason: null });
});
