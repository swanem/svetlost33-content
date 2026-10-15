#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_MODULE, validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';
import { toLatin } from './validate-saints-v1.mjs';
import { CALENDAR_BROWSER_MODULE, evaluateCalendarBrowser, upcomingBrowserFeasts, resolveBrowserArchiveDay, validateCalendarBrowserPayload } from './validate-calendar-browser-v1.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => `${JSON.stringify(value, null, 2)}\n`;
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const generation = { id: 'test-only-browser-generation', sequence: 10, decision_sha256: 'a'.repeat(64) };
const profile = 'test-only-profile-v1';
export function mutateCalendarBrowserFixture(value, mutations) {
  let target = value;
  for (const mutation of mutations) {
    if (!mutation.path.length) { target = structuredClone(mutation.value); continue; }
    let at = target;
    for (const component of mutation.path.slice(0, -1)) at = at[component];
    at[mutation.path.at(-1)] = structuredClone(mutation.value);
  }
  return target;
}
export function invokeCalendarBrowserCase(item, payload, context) {
  if (item.operation === 'upcoming') return upcomingBrowserFeasts(payload, context, item.input);
  if (item.operation === 'archive') return resolveBrowserArchiveDay(payload, context, item.input);
  return evaluateCalendarBrowser(payload, context);
}

/** No real feast classifications, reading text, publication claims or production files. */
export function buildCalendarBrowserFixtures() {
  const calendarBinding = { id: 'test-calendar-binding', calendar_profile_id: profile, year: 2030, module_id: 'test-calendar-2030', version: '2030.1.0', revision: 1, path: 'data/calendar.2030.json', sha256: 'b'.repeat(64) };
  const occurrences = [7, 14].map((day, index) => ({ id: `test-occurrence-${index + 1}`, observance_id: `test-observance-${index + 1}`, calendar_binding_id: calendarBinding.id,
    date: `2030-01-${String(day).padStart(2, '0')}`, julian_date: `2029-12-${String(day + 18)}`, calendar_title: localized(`Пробни празник ${index + 1}`), calendar_source_ids: ['test-source'], source_ids: ['test-source'], review_status: 'reviewed' }));
  // Dates and identities below are synthetic fixtures, not liturgical claims.
  occurrences[1].julian_date = '2030-01-01';
  const catalog = { schema_version: 'svetlost33-liturgical-catalog-1', version: '2030.1.0', revision: 1, review_status: 'approved', approval_id: 'test-only-no-owner-approval',
    calendar_profiles: [{ id: profile, name: localized('Пробни профил') }],
    sources: [{ id: 'test-source', title: 'TEST ONLY', url: 'https://example.test/test-only', publisher: 'TEST ONLY', original_author: null, checked_on: '2030-01-01', review_status: 'reviewed', rights_status: 'recorded_elsewhere' }],
    subjects: [], observances: [1, 2].map(index => ({ id: `test-observance-${index}`, kind: index === 1 ? 'event' : 'feast', name: localized(`Пробни празник ${index}`), description: localized('Искључиво тест'), subject_ids: [], aliases: [], source_ids: ['test-source'], review_status: 'reviewed' })),
    calendar_bindings: [calendarBinding], occurrences, day_reviews: [], article_bindings: [], article_links: [], legacy_slava_links: [],
    coverage: [{ calendar_profile_id: profile, year: 2030, calendar_binding_id: calendarBinding.id, status: 'limited_catalog', mapped_dates: 2, occurrences: 2, complete_saint_list: false },
      { calendar_profile_id: profile, year: 2031, calendar_binding_id: null, status: 'unavailable', mapped_dates: 0, occurrences: 0, complete_saint_list: false }] };
  assert.deepEqual(validateCatalogPayload(catalog), { valid: true, reason: null });
  const catalogContext = { module_id: 'liturgical-catalog-v1', version: catalog.version, revision: catalog.revision, path: 'data/liturgical-catalog-v1.json', sha256: hash(encode(catalog)), generation: { ...generation }, authenticated: true,
    payload: catalog, context: { generation: { ...generation }, contentAuthenticated: true, moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, generation: { ...generation }, dependencies: [{ module_id: calendarBinding.module_id, version: calendarBinding.version }] },
      calendarContexts: [{ ...calendarBinding, authenticated: true, generation: { ...generation }, days: occurrences.map(item => ({ date: item.date, julian_date: item.julian_date, commemoration: { status: 'SOURCE_RECORDED', title_cyrl: item.calendar_title['sr-Cyrl'], source_ids: ['test-source'], complete_saint_list_verified: false } })) }], articleContexts: [] } };
  const libraryBinding = { module_id: 'test-reading-library', version: '2030.1.0', revision: 1, manifest_sha256: 'c'.repeat(64) };
  const cyclesBinding = { module_id: 'test-reading-cycles', version: '2030.1.0', revision: 2, manifest_sha256: 'd'.repeat(64) };
  const phases = ['morning', 'noon', 'evening'].map((phase, index) => ({ phase, cycle_day_id: 'test-cycle-day-1', slot_id: `test-slot-${phase}`, psalm_id: `psalm-${index + 1}`, verse_numbers: [1, 2], prayer_id: `test-prayer-${index + 1}` }));
  const binding = { id: 'test-archive-binding', policy_id: 'calendar-week-v1', policy_version: 1, library_binding: libraryBinding, cycles_binding: cyclesBinding };
  const payload = { schema_version: 'svetlost33-calendar-browser-1', version: '2030.1.0', revision: 1, review_status: 'pending', approval_id: null, calendar_profile_id: profile,
    catalog_binding: { module_id: catalogContext.module_id, version: catalog.version, revision: catalog.revision, path: catalogContext.path, sha256: catalogContext.sha256 },
    feast_memberships: [1, 2].map(index => ({ observance_id: `test-observance-${index}`, occurrence_ids: [`test-occurrence-${index}`], review_status: 'reviewed', source_ids: ['test-source'] })),
    archive_start_date: '2030-01-07', archive_bindings: [binding], archive_days: [
      { date: '2030-01-07', binding_id: binding.id, status: 'available', correction_id: null, phases },
      { date: '2030-01-08', binding_id: binding.id, status: 'available', correction_id: null, phases: [{ ...phases[1], cycle_day_id: 'test-cycle-day-2', slot_id: 'test-slot-tuesday-noon' }] },
      { date: '2030-01-09', binding_id: binding.id, status: 'withdrawn', correction_id: null, phases: [] }
    ] };
  const context = { generation: { ...generation }, contentAuthenticated: true, moduleContext: { ...CALENDAR_BROWSER_MODULE, version: payload.version, revision: payload.revision, generation: { ...generation }, dependencies: [] },
    catalogContext, archiveContexts: [{ binding_id: binding.id, generation: { ...generation }, authenticated: true, review_status: 'approved',
      library: { ...libraryBinding, psalms: [1, 2, 3].map(number => ({ id: `psalm-${number}`, verse_numbers: [1, 2, 3] })), prayer_ids: ['test-prayer-1', 'test-prayer-2', 'test-prayer-3'] },
      cycles: { ...cyclesBinding, days: [{ id: 'test-cycle-day-1', cycle_day: 1, slots: phases.map(item => ({ id: item.slot_id, phase: item.phase, psalm_id: item.psalm_id, verse_numbers: item.verse_numbers, prayer_id: item.prayer_id })) },
        { id: 'test-cycle-day-2', cycle_day: 2, slots: [{ id: 'test-slot-tuesday-noon', phase: 'noon', psalm_id: 'psalm-2', verse_numbers: [1, 2], prayer_id: 'test-prayer-2' }] }] } }] };
  assert.deepEqual(validateCalendarBrowserPayload(payload), { valid: true, reason: null });
  const setup = [{ path: ['review_status'], value: 'approved' }, { path: ['approval_id'], value: 'test-only-no-owner-approval' }];
  const cases = [];
  const mutation = (path, value) => ({ path, value });
  const add = (id, operation = 'evaluate', input = {}, payload_mutations = [], context_mutations = [], synthetic_setup = true) => cases.push({ id, operation, input, synthetic_setup, payload_mutations, context_mutations });
  const upcoming = { from_date: '2030-01-06', locale: 'sr-Latn' };
  const archive = { date: '2030-01-07' };
  add('pending-is-not-approved', 'evaluate', {}, [], [], false);
  add('approved-test-module');
  add('missing-optional-module', 'evaluate', {}, [mutation([], null)]);
  add('unsupported-schema', 'evaluate', {}, [mutation(['schema_version'], 'svetlost33-calendar-browser-2')]);
  add('unknown-closed-field', 'evaluate', {}, [mutation(['unsupported'], true)]);
  add('revision-boolean', 'evaluate', {}, [mutation(['revision'], true)]);
  add('revision-not-safe', 'evaluate', {}, [mutation(['revision'], 9007199254740992)]);
  add('unauthenticated-corrupted-payload', 'evaluate', {}, [], [mutation(['contentAuthenticated'], false)]);
  add('truthy-authentication-is-rejected', 'evaluate', {}, [], [mutation(['contentAuthenticated'], 'true')]);
  for (const [key, value] of [['module_id', 'wrong-module'], ['version', 'wrong-version'], ['revision', 99], ['required', true], ['capabilities', ['unknown-capability']], ['dependencies', [{ module_id: 'test-reading-library', version: '2030.1.0' }]]]) add(`module-${key}-mismatch`, 'evaluate', {}, [], [mutation(['moduleContext', key], value)]);
  for (const [key, value] of [['id', 'old-generation'], ['sequence', 9], ['decision_sha256', '0'.repeat(64)]]) add(`browser-generation-${key}-mismatch`, 'evaluate', {}, [], [mutation(['moduleContext', 'generation', key], value)]);
  add('missing-archive-context-array', 'evaluate', {}, [], [mutation(['archiveContexts'], null)]);
  add('null-host-context', 'evaluate', {}, [], [mutation([], null)]);
  add('two-feasts-ordered', 'upcoming', upcoming);
  add('cyrillic-feasts', 'upcoming', { ...upcoming, locale: 'sr-Cyrl' });
  add('today-not-repeated-in-upcoming', 'upcoming', { ...upcoming, from_date: '2030-01-07' });
  add('d-plus-seven-in-announcement', 'upcoming', { ...upcoming, from_date: '2030-01-07' });
  add('d-plus-eight-outside-announcement', 'upcoming', upcoming);
  add('same-date-editorial-order', 'upcoming', upcoming, [mutation(['feast_memberships'], [...payload.feast_memberships].reverse())], [
    mutation(['catalogContext', 'payload', 'occurrences', 1, 'date'], '2030-01-07'),
    mutation(['catalogContext', 'payload', 'occurrences', 1, 'julian_date'], occurrences[0].julian_date),
    mutation(['catalogContext', 'payload', 'occurrences', 1, 'calendar_title'], occurrences[0].calendar_title),
    mutation(['catalogContext', 'payload', 'coverage', 0, 'mapped_dates'], 1)
  ]);
  add('no-known-not-no-feasts', 'upcoming', { ...upcoming, from_date: '2030-12-31' });
  add('future-year-not-inferred', 'upcoming', { ...upcoming, from_date: '2031-01-01' });
  add('invalid-feast-date', 'upcoming', { ...upcoming, from_date: '2030-02-29' });
  add('unsupported-feast-locale', 'upcoming', { ...upcoming, locale: 'en' });
  add('catalog-missing-feasts-unavailable', 'upcoming', upcoming, [], [mutation(['catalogContext'], null)]);
  add('catalog-pending-feasts-unavailable', 'upcoming', upcoming, [], [mutation(['catalogContext', 'payload', 'review_status'], 'pending')]);
  add('catalog-exact-hash-mismatch', 'upcoming', upcoming, [], [mutation(['catalogContext', 'sha256'], '0'.repeat(64))]);
  add('catalog-truthy-trust', 'upcoming', upcoming, [], [mutation(['catalogContext', 'authenticated'], 'true')]);
  for (const [key, value] of [['id', 'old-generation'], ['sequence', 9], ['decision_sha256', '0'.repeat(64)]]) add(`catalog-generation-${key}-mismatch`, 'upcoming', upcoming, [], [mutation(['catalogContext', 'generation', key], value)]);
  add('calendar-context-cross-generation', 'upcoming', upcoming, [], [mutation(['catalogContext', 'context', 'calendarContexts', 0, 'generation', 'sequence'], 9)]);
  add('unknown-profile', 'upcoming', upcoming, [mutation(['calendar_profile_id'], 'unknown-profile')]);
  add('unknown-observance', 'upcoming', upcoming, [mutation(['feast_memberships', 0, 'observance_id'], 'unknown-observance')]);
  add('unknown-occurrence', 'upcoming', upcoming, [mutation(['feast_memberships', 0, 'occurrence_ids'], ['unknown-occurrence'])]);
  add('wrong-observance-occurrence', 'upcoming', upcoming, [mutation(['feast_memberships', 0, 'occurrence_ids'], ['test-occurrence-2']), mutation(['feast_memberships', 1, 'occurrence_ids'], ['test-occurrence-1'])]);
  add('unknown-source-reference', 'upcoming', upcoming, [mutation(['feast_memberships', 0, 'source_ids'], ['unknown-source'])]);
  add('pending-membership-hidden', 'upcoming', upcoming, [mutation(['feast_memberships', 0, 'review_status'], 'pending')]);
  add('pending-occurrence-hidden', 'upcoming', upcoming, [], [mutation(['catalogContext', 'payload', 'occurrences', 0, 'review_status'], 'pending')]);
  add('pending-source-hidden', 'upcoming', upcoming, [], [mutation(['catalogContext', 'payload', 'sources', 0, 'review_status'], 'pending')]);
  add('kind-alone-never-featured', 'upcoming', upcoming, [mutation(['feast_memberships'], [payload.feast_memberships[0]])]);
  add('archive-first-date-three-phases', 'archive', archive);
  add('before-archive-start-unknown', 'archive', { date: '2030-01-06' });
  add('archive-explicit-phase-gap', 'archive', { date: '2030-01-08' });
  add('withdrawn-day-tombstone', 'archive', { date: '2030-01-09' });
  add('withdrawn-even-with-bodies-removed', 'archive', { date: '2030-01-09' }, [], [mutation(['archiveContexts'], [])]);
  add('corrected-day-visibly-marked', 'archive', archive, [mutation(['archive_days', 0, 'status'], 'corrected'), mutation(['archive_days', 0, 'correction_id'], 'test-reviewed-correction-1')]);
  add('corrected-with-missing-body-keeps-marker', 'archive', archive, [mutation(['archive_days', 0, 'status'], 'corrected'), mutation(['archive_days', 0, 'correction_id'], 'test-reviewed-correction-1')], [mutation(['archiveContexts'], [])]);
  add('corrected-without-marker-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'status'], 'corrected')]);
  add('uncorrected-with-marker-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'correction_id'], 'test-correction')]);
  add('after-last-record-unknown', 'archive', { date: '2030-01-10' });
  add('archive-future-year-not-reconstructed', 'archive', { date: '2031-01-07' });
  add('archive-valid-leap-date-uncovered', 'archive', { date: '2032-02-29' });
  add('invalid-archive-date', 'archive', { date: '2030-02-29' });
  add('archive-independent-of-catalog', 'archive', archive, [], [mutation(['catalogContext'], null)]);
  add('archive-no-calendar-binding', 'archive', archive, [mutation(['catalog_binding'], null), mutation(['feast_memberships'], [])], [mutation(['catalogContext'], null)]);
  add('no-archive-start-is-unavailable', 'archive', archive, [mutation(['archive_start_date'], null), mutation(['archive_days'], []), mutation(['archive_bindings'], [])]);
  add('missing-old-content-never-latest', 'archive', archive, [], [mutation(['archiveContexts'], [])]);
  add('wrong-weekday-valid-slot-rejected', 'archive', { date: '2030-01-06' }, [mutation(['archive_start_date'], '2030-01-06'), mutation(['archive_days', 0, 'date'], '2030-01-06')]);
  add('malformed-null-archive-context', 'archive', archive, [], [mutation(['archiveContexts'], [null])]);
  add('malformed-cycle-day-array', 'archive', archive, [], [mutation(['archiveContexts', 0, 'cycles', 'days'], {})]);
  add('malformed-null-cycle-day', 'archive', archive, [], [mutation(['archiveContexts', 0, 'cycles', 'days'], [null])]);
  add('malformed-null-library-psalm', 'archive', archive, [], [mutation(['archiveContexts', 0, 'library', 'psalms'], [null])]);
  add('duplicate-archive-context-unavailable', 'archive', archive, [], [mutation(['archiveContexts'], [context.archiveContexts[0], context.archiveContexts[0]])]);
  add('archive-truthy-trust', 'archive', archive, [], [mutation(['archiveContexts', 0, 'authenticated'], 'true')]);
  add('archive-content-withdrawn', 'archive', archive, [], [mutation(['archiveContexts', 0, 'review_status'], 'withdrawn')]);
  for (const [key, value] of [['id', 'old-generation'], ['sequence', 9], ['decision_sha256', '0'.repeat(64)]]) add(`archive-generation-${key}-mismatch`, 'archive', archive, [], [mutation(['archiveContexts', 0, 'generation', key], value)]);
  for (const module of ['library', 'cycles']) for (const [key, value] of [['version', 'latest-version'], ['revision', 99], ['manifest_sha256', '0'.repeat(64)]]) add(`${module}-${key}-mismatch`, 'archive', archive, [], [mutation(['archiveContexts', 0, module, key], value)]);
  add('unknown-policy-not-recomputed', 'archive', archive, [mutation(['archive_bindings', 0, 'policy_id'], 'future-policy')]);
  add('unknown-policy-version', 'archive', archive, [mutation(['archive_bindings', 0, 'policy_version'], 2)]);
  add('missing-cycle-day', 'archive', archive, [], [mutation(['archiveContexts', 0, 'cycles', 'days'], [])]);
  add('missing-slot', 'archive', archive, [], [mutation(['archiveContexts', 0, 'cycles', 'days', 0, 'slots'], [])]);
  add('forged-slot-reference', 'archive', archive, [mutation(['archive_days', 0, 'phases', 0, 'slot_id'], 'forged-slot')]);
  add('forged-prayer-reference', 'archive', archive, [mutation(['archive_days', 0, 'phases', 0, 'prayer_id'], 'forged-prayer')]);
  add('forged-verse-reference', 'archive', archive, [mutation(['archive_days', 0, 'phases', 0, 'verse_numbers'], [1, 3])]);
  add('missing-library-psalm', 'archive', archive, [], [mutation(['archiveContexts', 0, 'library', 'psalms'], [])]);
  add('missing-library-prayer', 'archive', archive, [], [mutation(['archiveContexts', 0, 'library', 'prayer_ids'], [])]);
  add('missing-library-verse', 'archive', archive, [], [mutation(['archiveContexts', 0, 'library', 'psalms', 0, 'verse_numbers'], [1])]);
  add('duplicate-verse-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'phases', 0, 'verse_numbers'], [1, 1])]);
  add('reordered-verse-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'phases', 0, 'verse_numbers'], [2, 1])]);
  add('invalid-psalm-number', 'evaluate', {}, [mutation(['archive_days', 0, 'phases', 0, 'psalm_id'], 'psalm-151')]);
  add('invalid-stored-date', 'evaluate', {}, [mutation(['archive_days', 1, 'date'], '2030-02-29')]);
  add('duplicate-date-invalid', 'evaluate', {}, [mutation(['archive_days', 1, 'date'], '2030-01-07')]);
  add('duplicate-phase-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'phases', 1, 'phase'], 'morning')]);
  add('unknown-archive-binding', 'evaluate', {}, [mutation(['archive_days', 0, 'binding_id'], 'missing-binding')]);
  add('withdrawn-retaining-text-invalid', 'evaluate', {}, [mutation(['archive_days', 0, 'status'], 'withdrawn')]);
  add('start-without-record-invalid', 'evaluate', {}, [mutation(['archive_start_date'], '2030-01-06')]);
  add('no-start-with-rows-invalid', 'evaluate', {}, [mutation(['archive_start_date'], null)]);
  add('catalog-null-with-membership-invalid', 'evaluate', {}, [mutation(['catalog_binding'], null)]);
  for (const item of cases) {
    let candidate = structuredClone(payload);
    if (item.synthetic_setup) candidate = mutateCalendarBrowserFixture(candidate, setup);
    candidate = mutateCalendarBrowserFixture(candidate, item.payload_mutations);
    const host = mutateCalendarBrowserFixture(structuredClone(context), item.context_mutations);
    item.expected = invokeCalendarBrowserCase(item, candidate, host);
  }
  return { schema_version: 'svetlost33-calendar-browser-test-cases-1', purpose: 'TEST_ONLY_SYNTHETIC_NOT_PUBLICATION_OR_OWNER_APPROVAL', payload, context, synthetic_test_setup_mutations: setup, cases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = encode(buildCalendarBrowserFixtures());
  const path = 'fixtures/calendar-browser-v1/cases.json';
  if (process.argv.includes('--patch')) process.stdout.write(`*** Begin Patch\n*** Add File: ${resolve(import.meta.dirname, '..', path)}\n${bytes.trimEnd().split('\n').map(line => `+${line}`).join('\n')}\n*** End Patch\n`);
  else {
    assert.equal(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), bytes);
    console.log(JSON.stringify({ path, sha256: hash(bytes), bytes: Buffer.byteLength(bytes), cases: buildCalendarBrowserFixtures().cases.length }));
  }
}
