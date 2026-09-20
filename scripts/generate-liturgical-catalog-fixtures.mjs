#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLatin } from './validate-saints-v1.mjs';
import { CATALOG_MODULE, catalogDependencies, evaluateCatalog, resolveCatalogDay, searchCatalog, validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';

const root = resolve(import.meta.dirname, '..');
export const CATALOG_FIXTURE_DIRECTORY = 'fixtures/liturgical-catalog-v1';
export const CALENDAR_PATH = 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json';
const SAINTS_PATH = 'fixtures/saints-v1/saints-v1.json';
const PROFILE = 'spc-rs-ba-julian-v1';
const GENERATION = { id: 'synthetic-i2-test-generation-not-a-release', sequence: 1, decision_sha256: 'e'.repeat(64) };
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export function mutateFixture(target, mutations) {
  for (const { path, value } of mutations) { let at = target; for (const key of path.slice(0, -1)) at = at[key]; at[path.at(-1)] = structuredClone(value); }
}

export async function buildLiturgicalCatalogFixtures() {
  const calendarBytes = await readFile(resolve(root, CALENDAR_PATH)), calendar = JSON.parse(calendarBytes);
  assert.equal(hash(calendarBytes), 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c');
  const saintsBytes = await readFile(resolve(root, SAINTS_PATH)), saints = JSON.parse(saintsBytes);
  const sourceReviewBytes = await readFile(resolve(root, 'docs/I2-CALENDAR-SOURCE-REVIEW.md'));
  assert.equal(hash(saintsBytes), 'ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000');
  const calendarBinding = { id: 'calendar-spc-2026', calendar_profile_id: PROFILE, year: 2026, ...saints.calendar_binding };
  const articleBinding = { id: 'saints-pilot-2026', module_id: 'saints-v1', version: saints.version, revision: saints.revision, path: 'data/saints-v1.json', sha256: hash(saintsBytes) };
  const sourceSpecs = [
    ['spc-kirijak', 'Преподобни Киријак Отшелник', 'https://spc.rs/sr/news/11852.prepodobni-kirijak-otselnik.html', 'Српска православна црква'],
    ['spc-nicholas-transfer', 'Празник преноса моштију Светог Николаја у Никољцу', 'https://spc.rs/sr/news/2598.praznik-prenosa-mostiju-svetog-nikolaja-u-nikoljcu.html', 'Српска православна црква'],
    ['spc-nicholas', 'Празник Светог Николаја у Новом Саду', 'https://www.spc.rs/sr/news/iz-zivota-crkve/12225.praznik-svetog-nikolaja-u-novom-sadu.html', 'Српска православна црква'],
    ['eparhija-michael-chonae', 'Чудо Светог Архангела Михаила у Хони', 'https://www.eparhija-sumadijska.org.rs/index.php/vesti/11139-blagovestenje-19092026', 'Епархија шумадијска'],
    ['spc-michael-synaxis', 'Аранђеловдан у Епархији врањској', 'https://spc.rs/sr/news/5493.arandelovdan-u-eparhiji-vranjskoj.html', 'Српска православна црква'],
    ['spc-peter-paul', 'Права вера није лични ударнички подвиг, него је вера Цркве', 'https://www.spc.rs/sr/news/patrijarh/17190.prava-vera-nije-licni-udarnicki-podvig%2C-nego-je-vera-crkve-.html', 'Српска православна црква'],
    ['eparhija-nativity', 'Календар: 21.09.2026.', 'https://kalendar.eparhija.at/2026/9/21', 'Епархија аустријска СПЦ'],
    ['radio-nektarije', 'Свети Нектарије Егински', 'https://radioglas.rs/Newsview.asp?ID=2367', 'Радио Глас Епархије нишке'],
    ['spc-stefan-decanski', 'Свети краљ Стефан Дечански — крсна слава епископа Јеротеја', 'https://www.spc.rs/sr/news/iz-zivota-crkve/-/12109.sveti-kralj-stefan-decanski-%E2%80%93-krsna-slava-episkopa-jeroteja.html', 'Српска православна црква']
  ];
  const sources = sourceSpecs.map(([id, title, url, publisher]) => ({ id, title, url, publisher, original_author: null, checked_on: '2026-09-20', review_status: 'pending', rights_status: 'pending' }));
  for (const source of calendar.sources.filter(source => /^eparhija-month-(01|02|05|07|09|10|11|12)$/.test(source.id))) sources.push({ id: source.id, title: source.title, url: source.url, publisher: 'Епархија аустријска СПЦ', original_author: null, checked_on: '2026-09-15', review_status: 'pending', rights_status: 'pending' });
  const aliases = (texts, source_ids, kind = 'name_variant') => texts.flatMap(text => ['sr-Cyrl', 'sr-Latn'].map(locale => ({ text: locale === 'sr-Cyrl' ? text : toLatin(text), locale, kind, source_ids })));
  const subjects = [];
  const subject = (id, name, source_ids, names = [], type = 'saint') => { subjects.push({ id, type, name: localized(name), aliases: aliases(names, source_ids), source_ids, review_status: 'pending' }); return id; };
  const petka = subject('saint-paraskeva', 'Преподобна мати Параскева', ['eparhija-month-10'], ['Света Петка']);
  const sava = subject('saint-sava-serbian', 'Свети Сава Српски', ['eparhija-month-01'], ['Свети Сава']);
  const nikola = subject('saint-nicholas-myra', 'Свети Николај Мирликијски', ['spc-nicholas', 'spc-nicholas-transfer'], ['Свети Никола', 'Свети Николај']);
  const jovan = subject('saint-john-baptist', 'Свети Јован Крститељ', ['eparhija-month-01'], ['Јован Претеча']);
  const georgije = subject('saint-george', 'Свети великомученик Георгије', ['eparhija-month-05'], ['Свети Георгије']);
  const dimitrije = subject('saint-demetrius', 'Свети великомученик Димитрије', ['eparhija-month-11'], ['Свети Димитрије']);
  const mihailo = subject('saint-archangel-michael', 'Свети архангел Михаило', ['spc-michael-synaxis', 'eparhija-michael-chonae'], ['Архангел Михаило']);
  const stefan = subject('saint-stefan-decanski', 'Свети краљ Стефан Дечански', ['spc-stefan-decanski'], ['Свети Стефан Дечански']);
  const simeon = subject('saint-simeon-myrrh-streaming', 'Преподобни Симеон Мироточиви', ['eparhija-month-02'], ['Свети Симеон Мироточиви']);
  const nektarije = subject('saint-nektarios-aegina', 'Свети Нектарије Егински', ['radio-nektarije']);
  const kirijak = subject('saint-cyriacus-hermit', 'Преподобни Киријак Отшелник', ['spc-kirijak', 'eparhija-month-10'], ['Киријак']);
  const apostles = subject('group-apostles-peter-paul', 'Свети апостоли Петар и Павле', ['spc-peter-paul', 'eparhija-month-07'], ['Петар и Павле'], 'group');
  const observances = [], occurrences = [], legacy_slava_links = [];
  const observance = (id, subject_ids, date, options = {}) => {
    const day = date ? calendar.days.find(day => day.date === date) : null;
    const source_ids = options.sources ?? day.commemoration.source_ids;
    observances.push({ id, kind: options.kind ?? 'saint_commemoration', name: localized(options.name ?? day.commemoration.title_cyrl),
      description: localized(options.description ?? 'Спомен светитеља'), subject_ids, aliases: aliases(options.aliases ?? [], source_ids, 'popular'), source_ids, review_status: 'pending' });
    if (day) occurrences.push({ id: `occ-${id}-2026`, observance_id: id, calendar_binding_id: calendarBinding.id, date: day.date, julian_date: day.julian_date,
      calendar_title: localized(day.commemoration.title_cyrl), calendar_source_ids: day.commemoration.source_ids, source_ids, review_status: 'pending' });
    if (options.legacy) legacy_slava_links.push({ legacy_id: options.legacy, observance_ids: [id], review_status: 'pending' });
  };
  observance('obs-paraskeva', [petka], '2026-10-27', { legacy: 'sveta-petka' });
  observance('obs-sava-serbian', [sava], '2026-01-27', { legacy: 'sveti-sava' });
  observance('obs-nicholas-december', [nikola], '2026-12-19', { aliases: ['Никољдан'], description: 'Децембарски спомен Светог Николаја', legacy: 'sveti-nikola' });
  observance('obs-john-baptist-synaxis', [jovan], '2026-01-20', { description: 'Сабор Светог Јована Крститеља', legacy: 'sveti-jovan' });
  observance('obs-george', [georgije], '2026-05-06', { aliases: ['Ђурђевдан'], legacy: 'sveti-georgije' });
  observance('obs-demetrius', [dimitrije], '2026-11-08', { aliases: ['Митровдан'], legacy: 'sveti-dimitrije' });
  observance('obs-michael-synaxis', [mihailo], '2026-11-21', { kind: 'feast', aliases: ['Аранђеловдан'], description: 'Сабор Архангела Михаила и осталих небеских сила', legacy: 'arhangel-mihailo' });
  observance('obs-stefan-decanski', [stefan], null, { name: 'Свети краљ Стефан Дечански', sources: ['spc-stefan-decanski'], description: 'Годишња веза није потврђена', legacy: 'sveti-stefan-decanski' });
  observance('obs-simeon-myrrh-streaming', [simeon], '2026-02-26', { legacy: 'sveti-simeon' });
  observance('obs-nektarios-aegina', [nektarije], null, { name: 'Свети Нектарије Егински', sources: ['radio-nektarije'], description: 'Годишња веза није потврђена', legacy: 'sveti-nektarije' });
  observance('obs-cyriacus-miholjdan', [kirijak], '2026-10-12', { aliases: ['Михољдан'] });
  observance('obs-nicholas-relics-transfer', [nikola], '2026-05-22', { description: 'Пренос моштију Светог Николаја', sources: ['eparhija-month-05', 'spc-nicholas-transfer'] });
  observance('obs-michael-chonae', [mihailo], '2026-09-19', { kind: 'event', aliases: ['Чудо у Хони'], description: 'Чудо Архангела Михаила у Хони', sources: ['eparhija-month-09', 'eparhija-michael-chonae'] });
  observance('obs-apostles-peter-paul', [apostles], '2026-07-12', { kind: 'group_commemoration', aliases: ['Петровдан'], description: 'Заједнички спомен апостола', sources: ['eparhija-month-07', 'spc-peter-paul'] });
  observance('obs-nativity-theotokos', [], '2026-09-21', { kind: 'feast', aliases: ['Мала Госпојина'], description: 'Рођење Пресвете Богородице', sources: ['eparhija-month-09', 'eparhija-nativity'] });
  const payload = { schema_version: 'svetlost33-liturgical-catalog-1', version: '2026.9.20', revision: 1, review_status: 'pending', approval_id: null,
    calendar_profiles: [{ id: PROFILE, name: localized('СПЦ — Србија и Босна и Херцеговина, јулијански календар') }], sources, subjects, observances,
    calendar_bindings: [calendarBinding], occurrences, day_reviews: [], article_bindings: [articleBinding],
    article_links: [
      { observance_id: 'obs-michael-chonae', article_binding_id: articleBinding.id, article_id: 'michael-miracle-chonae', source_ids: ['eparhija-michael-chonae'], review_status: 'pending' },
      { observance_id: 'obs-nativity-theotokos', article_binding_id: articleBinding.id, article_id: 'nativity-theotokos', source_ids: ['eparhija-nativity'], review_status: 'pending' }
    ], legacy_slava_links,
    coverage: [{ calendar_profile_id: PROFILE, year: 2026, calendar_binding_id: calendarBinding.id, status: 'limited_catalog', mapped_dates: 13, occurrences: 13, complete_saint_list: false },
      { calendar_profile_id: PROFILE, year: 2027, calendar_binding_id: null, status: 'unavailable', mapped_dates: 0, occurrences: 0, complete_saint_list: false }] };
  assert.deepEqual(validateCatalogPayload(payload), { valid: true, reason: null });
  const testSetup = [{ path: ['review_status'], value: 'approved' }, { path: ['approval_id'], value: 'synthetic-test-only-not-owner-approval' }];
  for (const key of ['sources', 'subjects', 'observances', 'occurrences', 'article_links', 'legacy_slava_links']) payload[key].forEach((_, index) => testSetup.push({ path: [key, index, 'review_status'], value: 'reviewed' }));
  const selectedDates = new Set([...occurrences.map(item => item.date), '2026-12-31']);
  const hostCalendar = { ...calendarBinding, generation: { ...GENERATION }, authenticated: true, days: calendar.days.filter(day => selectedDates.has(day.date)).map(day => ({ date: day.date, julian_date: day.julian_date, commemoration: day.commemoration })) };
  const context = { generation: { ...GENERATION }, contentAuthenticated: true,
    moduleContext: { ...CATALOG_MODULE, version: payload.version, revision: payload.revision, generation: { ...GENERATION }, dependencies: catalogDependencies(payload) },
    calendarContexts: [hostCalendar], articleContexts: [{ ...articleBinding, generation: { ...GENERATION }, authenticated: true, review_status: 'approved', calendar_binding: saints.calendar_binding, articles: saints.articles.map(article => ({ id: article.id, type: article.type })) }] };
  const cases = [];
  const add = (id, operation, input = {}, payload_mutations = [], context_mutations = [], setup = true) => cases.push({ id, operation, input, synthetic_setup: setup, payload_mutations, context_mutations });
  const searchInput = (query, locale = 'sr-Latn', year = 2026) => ({ query, locale, year, calendar_profile_id: PROFILE });
  const dayInput = date => ({ date, calendar_profile_id: PROFILE });
  add('candidate-is-not-runtime-approved', 'evaluate', {}, [], [], false);
  add('reviewed-synthetic-catalog', 'evaluate');
  for (const query of ['Михољдан', 'miholjdan', 'МИХОЉДАН', 'Киријак', 'kirijak', 'Miholjdan', 'miholj', 'КИРИЈАК']) add(`miholjdan-${cases.length}`, 'search', searchInput(query));
  for (const query of ['Ђурђевдан', 'Đurđevdan', 'Djurdjevdan', 'Đurđevdan'.normalize('NFD')]) add(`djurdjevdan-${cases.length}`, 'search', searchInput(query));
  for (const query of ['Никољдан', 'Nikoljdan', 'Љ', 'lj']) add(`lj-digraph-${cases.length}`, 'search', searchInput(query));
  add('ambiguous-nicholas-date-order', 'search', searchInput('Sveti Nikola'));
  add('ambiguous-michael-date-order', 'search', searchInput('Arhangel Mihailo'));
  add('unavailable-date-ascii-id-tiebreak', 'search', searchInput('Sveti', 'sr-Latn', 2027));
  add('case-and-combining-george', 'search', searchInput('SVETI GEORGIJE', 'sr-Cyrl'));
  add('michael-not-miholjdan', 'search', searchInput('Aranđelovdan'));
  add('group-peter-paul', 'search', searchInput('Petar i Pavle'));
  add('feast-mala-gospojina', 'search', searchInput('Mala Gospojina', 'sr-Cyrl'));
  add('unresolved-nektarios', 'search', searchInput('Nektarije'));
  add('unresolved-stefan', 'search', searchInput('Stefan'));
  add('year-2027-no-date-copy', 'search', searchInput('Miholjdan', 'sr-Latn', 2027));
  add('empty-query', 'search', searchInput(''));
  add('emoji-only-query', 'search', searchInput('🙏🕊️'));
  add('punctuation-only-query', 'search', searchInput(' ... '));
  add('query-too-long-no-truncation', 'search', searchInput('a'.repeat(129)));
  add('unknown-query', 'search', searchInput('nepoznat naziv'));
  add('recorded-date', 'day', dayInput('2026-10-12'));
  add('missing-is-not-confirmed-none', 'day', dayInput('2026-12-31'));
  add('year-boundary-unavailable', 'day', dayInput('2027-01-01'));
  add('not-authenticated', 'evaluate', {}, [], [{ path: ['contentAuthenticated'], value: false }]);
  add('calendar-not-authenticated', 'evaluate', {}, [], [{ path: ['calendarContexts', 0, 'authenticated'], value: false }]);
  add('catalog-generation-mismatch', 'evaluate', {}, [], [{ path: ['moduleContext', 'generation', 'id'], value: 'older-generation' }]);
  add('calendar-generation-mismatch', 'evaluate', {}, [], [{ path: ['calendarContexts', 0, 'generation', 'id'], value: 'older-generation' }]);
  add('article-generation-mismatch', 'evaluate', {}, [], [{ path: ['articleContexts', 0, 'generation', 'id'], value: 'older-generation' }]);
  for (const host of [['moduleContext'], ['calendarContexts', 0], ['articleContexts', 0]]) {
    add(`same-id-different-sequence-${host[0]}`, 'evaluate', {}, [], [{ path: [...host, 'generation', 'sequence'], value: 2 }]);
    add(`same-id-different-digest-${host[0]}`, 'evaluate', {}, [], [{ path: [...host, 'generation', 'decision_sha256'], value: 'f'.repeat(64) }]);
  }
  for (const key of ['version', 'revision', 'sha256']) add(`calendar-${key}-mismatch`, 'evaluate', {}, [], [{ path: ['calendarContexts', 0, key], value: key === 'revision' ? 99 : key === 'sha256' ? '0'.repeat(64) : 'other-version' }]);
  add('calendar-title-mismatch', 'evaluate', {}, [], [{ path: ['calendarContexts', 0, 'days', 0, 'commemoration', 'title_cyrl'], value: 'Други назив' }]);
  add('calendar-julian-mismatch', 'evaluate', {}, [], [{ path: ['calendarContexts', 0, 'days', 0, 'julian_date'], value: '2026-01-08' }]);
  add('calendar-sources-mismatch', 'evaluate', {}, [], [{ path: ['calendarContexts', 0, 'days', 0, 'commemoration', 'source_ids'], value: ['other-source'] }]);
  add('unknown-module-capability', 'evaluate', {}, [], [{ path: ['moduleContext', 'capabilities'], value: ['unknown'] }]);
  add('declared-required-module', 'evaluate', {}, [], [{ path: ['moduleContext', 'required'], value: true }]);
  add('missing-manifest-dependency', 'evaluate', {}, [], [{ path: ['moduleContext', 'dependencies'], value: [] }]);
  add('unknown-root-field', 'evaluate', {}, [{ path: ['new_field'], value: true }]);
  add('duplicate-observance', 'evaluate', {}, [{ path: ['observances', 1, 'id'], value: payload.observances[0].id }]);
  add('unknown-subject', 'evaluate', {}, [{ path: ['observances', 0, 'subject_ids'], value: ['unknown'] }]);
  add('wrong-latin-name', 'evaluate', {}, [{ path: ['observances', 0, 'name', 'sr-Latn'], value: 'Wrong name' }]);
  add('false-full-coverage', 'evaluate', {}, [{ path: ['coverage', 0, 'complete_saint_list'], value: true }]);
  add('copied-2027-count', 'evaluate', {}, [{ path: ['coverage', 1, 'mapped_dates'], value: 13 }]);
  add('invalid-civil-date', 'evaluate', {}, [{ path: ['occurrences', 0, 'date'], value: '2026-02-30' }]);
  const kyrObs = observances.findIndex(item => item.id === 'obs-cyriacus-miholjdan'), kyrOcc = occurrences.findIndex(item => item.observance_id === 'obs-cyriacus-miholjdan');
  add('pending-observance-hidden', 'search', searchInput('Miholjdan'), [{ path: ['observances', kyrObs, 'review_status'], value: 'pending' }]);
  add('pending-subject-hidden', 'search', searchInput('Miholjdan'), [{ path: ['subjects', subjects.findIndex(item => item.id === kirijak), 'review_status'], value: 'pending' }]);
  add('pending-occurrence-does-not-show-date', 'search', searchInput('Miholjdan'), [{ path: ['occurrences', kyrOcc, 'review_status'], value: 'pending' }]);
  add('pending-occurrence-day-uncovered', 'day', dayInput('2026-10-12'), [{ path: ['occurrences', kyrOcc, 'review_status'], value: 'pending' }]);
  add('missing-article-keeps-search-metadata', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts'], value: [] }]);
  add('unapproved-article-keeps-search-metadata', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'review_status'], value: 'draft' }]);
  add('article-authentication-false', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'authenticated'], value: false }]);
  add('article-authentication-truthy-string', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'authenticated'], value: 'true' }]);
  add('2027-identity-and-article-without-2027-date', 'search', searchInput('Mala Gospojina', 'sr-Latn', 2027));
  add('wrong-article-hash-unavailable', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'sha256'], value: '0'.repeat(64) }]);
  add('wrong-article-calendar-hash-unavailable', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'calendar_binding', 'sha256'], value: '0'.repeat(64) }]);
  add('pending-article-link-unavailable', 'search', searchInput('Mala Gospojina'), [{ path: ['article_links', 1, 'review_status'], value: 'pending' }]);
  add('missing-article-id-unavailable', 'search', searchInput('Mala Gospojina'), [], [{ path: ['articleContexts', 0, 'articles'], value: [] }]);
  add('article-id-does-not-become-subject', 'evaluate', {}, [{ path: ['observances', kyrObs, 'subject_ids'], value: ['nativity-theotokos'] }]);
  const day = calendar.days.find(day => day.date === '2026-12-31');
  for (const status of ['confirmed_none', 'unresolved']) add(`synthetic-explicit-${status}`, 'day', dayInput(day.date), [
    { path: ['day_reviews'], value: [{ calendar_binding_id: calendarBinding.id, date: day.date, julian_date: day.julian_date, calendar_title: localized(day.commemoration.title_cyrl), calendar_source_ids: day.commemoration.source_ids, status, source_ids: day.commemoration.source_ids, review_status: 'reviewed' }] },
    { path: ['coverage', 0, 'mapped_dates'], value: 14 }
  ]);
  for (const item of cases) {
    const candidate = structuredClone(payload), host = structuredClone(context);
    if (item.synthetic_setup) mutateFixture(candidate, testSetup);
    mutateFixture(candidate, item.payload_mutations); mutateFixture(host, item.context_mutations);
    item.expected = item.operation === 'search' ? searchCatalog(candidate, host, item.input) : item.operation === 'day' ? resolveCatalogDay(candidate, host, item.input) : evaluateCatalog(candidate, host);
  }
  const payloadBytes = encode(payload);
  const expected = { schema_version: 'svetlost33-liturgical-catalog-test-cases-1', purpose: 'TEST_ONLY_SYNTHETIC_TRUST_AND_REVIEW_NOT_OWNER_APPROVAL',
    candidate_sha256: hash(payloadBytes), candidate_bytes: payloadBytes.length, synthetic_test_setup_mutations: testSetup, context, cases,
    source_bindings: [{ repository_path: CALENDAR_PATH, sha256: hash(calendarBytes), bytes: calendarBytes.length }, { repository_path: SAINTS_PATH, sha256: hash(saintsBytes), bytes: saintsBytes.length }, { repository_path: 'docs/I2-CALENDAR-SOURCE-REVIEW.md', sha256: hash(sourceReviewBytes), bytes: sourceReviewBytes.length }],
    compatibility: [
      { id: 'old-client-unknown-optional-capability', expected: 'skip_catalog_before_payload_and_its_dependency_assertions_keep_independent_modules' },
      { id: 'new-client-six-modules', expected: 'catalog_and_annual_and_saints_are_distinct_projectors' },
      { id: 'native-optional-download-failure', expected: 'preserve_existing_platform_policy_resolver_rejects_retained_mismatched_binding' },
      { id: 'supported-downloaded-module-missing-dependency', expected: 'existing_dependency_gate_rejects_candidate_keep_previous_generation' }
    ] };
  return { payload, payloadBytes, expected, expectedBytes: encode(expected) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildLiturgicalCatalogFixtures();
  for (const [name, bytes] of [['catalog-candidate.json', built.payloadBytes], ['expected.json', built.expectedBytes]]) {
    const path = resolve(root, CATALOG_FIXTURE_DIRECTORY, name);
    if (process.argv.includes('--write')) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
    else assert.deepEqual(await readFile(path), bytes, `Deterministic ${name}`);
    console.log(JSON.stringify({ path: `${CATALOG_FIXTURE_DIRECTORY}/${name}`, bytes: bytes.length, sha256: hash(bytes) }));
  }
  console.log(JSON.stringify({ subjects: built.payload.subjects.length, observances: built.payload.observances.length, occurrences: built.payload.occurrences.length, cases: built.expected.cases.length }));
}
