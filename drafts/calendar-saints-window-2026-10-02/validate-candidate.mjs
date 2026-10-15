#!/usr/bin/env node
// Bounded editorial validator/materializer. Reads pinned S11 only; never writes or signs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_MODULE, catalogDependencies, validateCatalogPayload,
  evaluateCatalog, resolveCatalogDay, searchCatalog,
} from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { toLatin } from '../../scripts/validate-saints-v1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PRODUCTION = resolve(ROOT, 'releases/v2/production');
const HASH = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const delta = JSON.parse(await readFile(resolve(HERE, 'candidate-delta.json')));
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
const S11 = 'shared-content-refresh-2026-09-30-m0v2-s11';
const SET_HASH = 'ef109fcdb5ef14baae8697664e447a1c17378030e57f1209cb3fa2510cbf13d3';
const PINS = {
  'calendar-2026-r1': ['11e5d8b92ebbacd40ae6d0bad861c85a2df8220cd0b1091a2b7522754d538905', 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c'],
  'saints-v1': ['ae73dcd04221e44e57c07af7daf669a27a73005f054d1d99b2333011e77c3292', 'ca3e4fd02ca79e97d53e0e456b2ccaaeb81ebc3b740a71b3eb72049bf01331b5'],
  'liturgical-catalog-v1': ['52ed3faecc892198263e0b192c037ba4b3ee6978ffce2c6d8d5e68a507857521', '7aa40603faefad1a291d8bb379bc54b32576c5119a6fcc93b49cad5172096c26'],
};
const setBytes = await readFile(resolve(PRODUCTION, `releases/${S11}/release-set.json`));
assert.equal(HASH(setBytes), SET_HASH, 'S11 release-set bytes');
const set = JSON.parse(setBytes);
const modules = {};
for (const [id, [manifestHash, payloadHash]] of Object.entries(PINS)) {
  const entry = set.modules.find(item => item.module_id === id);
  assert.ok(entry, `Missing ${id}`);
  const manifestPath = resolve(PRODUCTION, entry.manifest_path);
  const raw = await readFile(manifestPath);
  assert.equal(HASH(raw), manifestHash);
  assert.equal(entry.manifest_sha256, manifestHash);
  assert.equal(raw.length, entry.manifest_bytes);
  const manifest = JSON.parse(raw);
  assert.equal(manifest.files.length, 1);
  const file = manifest.files[0];
  const bytes = await readFile(resolve(dirname(manifestPath), file.path));
  assert.equal(HASH(bytes), payloadHash);
  assert.equal(file.sha256, payloadHash);
  assert.equal(file.bytes, bytes.length);
  modules[id] = { manifest, bytes, payload: JSON.parse(bytes), file };
}
checks.push('Exact immutable S11 release-set, three manifests and three payload hashes/lengths');
const base = modules['liturgical-catalog-v1'].payload;
const saints = modules['saints-v1'].payload;
const calendar = modules['calendar-2026-r1'].payload;
const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${String(index + 2).padStart(2, '0')}`);
const PROFILE = 'spc-rs-ba-julian-v1';
const copy = structuredClone;

check('Delta is the bounded unsigned seven-day proposal, not publication approval', () => {
  assert.equal(delta.schema_version, 'svetlost33-editorial-catalog-delta-1');
  assert.equal(delta.status, 'unsigned_pending_candidate');
  assert.deepEqual(delta.scope, { from: dates[0], through: dates.at(-1), calendar_profile_id: PROFILE,
    preparation_authorized: true, publication_authorized: false, new_articles: 0,
    annual_calendar_changes: 0, new_source_claims: 0, rights_changes: 0 });
  assert.equal(delta.base.release_set_id, S11);
  assert.equal(delta.base.release_set_sha256, SET_HASH);
  assert.equal(delta.base.catalog_sha256, PINS['liturgical-catalog-v1'][1]);
  assert.equal(delta.base.calendar_sha256, PINS['calendar-2026-r1'][1]);
  assert.equal(delta.base.saints_sha256, PINS['saints-v1'][1]);
  assert.deepEqual(delta.additions.map(row => row.date), dates);
  assert.equal(delta.additions.filter(row => row.subject_operation === 'add').length, 6);
  assert.equal(delta.additions.filter(row => row.subject_operation === 'reuse').length, 1);
  assert.deepEqual(delta.candidate, { version: '2026.10.1', revision: 7, review_status: 'pending',
    approval_id: null, calendar_binding_id: 'calendar-spc-2026', article_binding_id: 'saints-pilot-2026' });
});

const candidate = copy(base);
Object.assign(candidate, { version: delta.candidate.version, revision: delta.candidate.revision,
  review_status: 'pending', approval_id: null });
for (const row of delta.additions) {
  const day = saints.days.find(item => item.date === row.date);
  const sourceDay = calendar.days.find(item => item.date === row.date);
  const article = saints.articles.find(item => item.id === row.article_id);
  assert.ok(day && sourceDay && article);
  assert.deepEqual(day.article_ids, [row.article_id]);
  assert.equal(sourceDay.commemoration.status, 'SOURCE_RECORDED');
  assert.equal(day.julian_date, sourceDay.julian_date);
  assert.equal(day.calendar_title['sr-Cyrl'], sourceDay.commemoration.title_cyrl);
  assert.deepEqual(day.calendar_source_ids, sourceDay.commemoration.source_ids);
  assert.deepEqual(day.calendar_source_ids, ['eparhija-month-10']);
  assert.equal(base.occurrences.some(item => item.date === row.date), false);
  assert.equal(base.observances.some(item => item.id === row.observance_id), false);
  const expectedType = { saint_commemoration: 'saint', group_commemoration: 'group', feast: 'feast' }[row.kind];
  assert.equal(article.type, expectedType);
  const name = Object.fromEntries(['sr-Cyrl', 'sr-Latn'].map(locale => [locale, article.content[locale].title]));
  const source_ids = copy(day.calendar_source_ids);
  if (row.subject_operation === 'add') {
    assert.ok(['saint', 'group'].includes(article.type));
    assert.equal(candidate.subjects.some(item => item.id === row.subject_id), false);
    candidate.subjects.push({ id: row.subject_id, type: article.type, name, aliases: [], source_ids, review_status: 'reviewed' });
  } else {
    assert.equal(row.subject_id, 'saint-john-baptist');
    assert.equal(row.article_id, 'conception-john-forerunner');
    assert.equal(base.subjects.find(item => item.id === row.subject_id)?.review_status, 'reviewed');
  }
  const desc = row.kind === 'feast' ? 'Празнични спомен' : row.kind === 'group_commemoration' ? 'Спомен светих мученика' : 'Спомен светитеља';
  candidate.observances.push({ id: row.observance_id, kind: row.kind, name,
    description: { 'sr-Cyrl': desc, 'sr-Latn': toLatin(desc) }, subject_ids: [row.subject_id],
    aliases: [], source_ids, review_status: 'reviewed' });
  candidate.occurrences.push({ id: `occ-${row.observance_id}-2026`, observance_id: row.observance_id,
    calendar_binding_id: delta.candidate.calendar_binding_id, date: row.date, julian_date: day.julian_date,
    calendar_title: copy(day.calendar_title), calendar_source_ids: source_ids, source_ids, review_status: 'reviewed' });
  candidate.article_links.push({ observance_id: row.observance_id, article_binding_id: delta.candidate.article_binding_id,
    article_id: row.article_id, source_ids, review_status: 'reviewed' });
}
const coverage = candidate.coverage.find(item => item.year === 2026 && item.calendar_profile_id === PROFILE);
coverage.mapped_dates += 7;
coverage.occurrences += 7;
checks.push('Seven exact approved day/article/type joins; six new identities and one reused John identity');

check('Pending catalog validates existing schema, both scripts and limits', () => {
  assert.deepEqual(validateCatalogPayload(candidate), { valid: true, reason: null });
  assert.equal(candidate.review_status, 'pending');
  assert.equal(candidate.approval_id, null);
});
check('All old subjects, observances, occurrences and four article links are retained byte-equivalent as JSON', () => {
  for (const key of ['subjects', 'observances', 'occurrences', 'article_links']) {
    assert.deepEqual(candidate[key].slice(0, base[key].length), base[key]);
  }
  assert.equal(base.article_links.length, 4);
  assert.deepEqual([candidate.subjects.length, candidate.observances.length, candidate.occurrences.length, candidate.article_links.length], [18, 34, 32, 11]);
});
check('Unrelated fields, sources/rights, legacy slava map and exact raw bindings are unchanged', () => {
  const changed = new Set(['version', 'revision', 'review_status', 'approval_id', 'subjects', 'observances', 'occurrences', 'article_links', 'coverage']);
  for (const key of Object.keys(base)) if (!changed.has(key)) assert.deepEqual(candidate[key], base[key]);
  const oldCoverage = copy(coverage); oldCoverage.mapped_dates -= 7; oldCoverage.occurrences -= 7;
  assert.deepEqual(oldCoverage, base.coverage.find(item => item.year === 2026 && item.calendar_profile_id === PROFILE));
  assert.deepEqual(candidate.coverage.filter(item => item.year !== 2026), base.coverage.filter(item => item.year !== 2026));
  assert.equal(saints.articles.length, 62);
});
check('Seven unknown Gospels and the Oct 2 fasting conflict are not promoted', () => {
  assert.deepEqual(delta.unchanged_unknowns.gospel_dates, dates);
  assert.deepEqual(delta.unchanged_unknowns.fasting_rule_dates, ['2026-10-02']);
  for (const date of dates) {
    const gospel = calendar.days.find(item => item.date === date).gospel;
    assert.equal(gospel.status, 'UNRESOLVED');
    assert.equal(gospel.production_eligible, false);
    assert.deepEqual(gospel.readings, []);
  }
  const fasting = calendar.days.find(item => item.date === '2026-10-02').fasting;
  assert.equal(fasting.rule, 'UNKNOWN');
  assert.deepEqual(fasting.observations.map(item => item.rule), ['WATER', 'OIL']);
});

// TEST-ONLY editorial simulation. The booleans below are NOT signature verification,
// native acceptance, persisted approval or authorization to ship these bytes.
const simulated = copy(candidate);
simulated.review_status = 'approved';
simulated.approval_id = 'test-only-never-publish';
const generation = { id: 'editorial-test-only-not-a-release', sequence: 1, decision_sha256: HASH(Buffer.from('editorial-test-only')) };
const context = {
  generation, contentAuthenticated: true,
  moduleContext: { ...CATALOG_MODULE, version: simulated.version, revision: simulated.revision,
    dependencies: catalogDependencies(simulated), generation },
  calendarContexts: simulated.calendar_bindings.map(binding => ({ ...binding, authenticated: true, generation, days: calendar.days })),
  articleContexts: simulated.article_bindings.map(binding => ({ ...binding, authenticated: true, generation,
    review_status: saints.review_status, calendar_binding: saints.calendar_binding,
    articles: saints.articles.map(({ id, type }) => ({ id, type })) })),
};
check('Pending candidate is fail-closed even with a simulated host; unauthenticated approved simulation also rejects', () => {
  assert.equal(evaluateCatalog(candidate, context).reason, 'unapproved');
  assert.equal(evaluateCatalog(simulated, { ...context, contentAuthenticated: false }).reason, 'content_not_authenticated');
  assert.deepEqual(evaluateCatalog(simulated, context), { eligible: true, reason: null });
});
for (const row of delta.additions) {
  check(`${row.date}: exact occurrence and linked old article in Cyrillic/Latin search`, () => {
    const resolved = resolveCatalogDay(simulated, context, { date: row.date, calendar_profile_id: PROFILE });
    assert.equal(resolved.state, 'source_recorded');
    assert.deepEqual(resolved.occurrence_ids, [`occ-${row.observance_id}-2026`]);
    for (const locale of ['sr-Cyrl', 'sr-Latn']) {
      const query = simulated.observances.find(item => item.id === row.observance_id).name[locale];
      const result = searchCatalog(simulated, context, { query, locale, year: 2026, calendar_profile_id: PROFILE });
      const match = result.results.find(item => item.observance_id === row.observance_id);
      assert.ok(match);
      assert.deepEqual(match.dates, [row.date]);
      assert.deepEqual(match.article_ids, [row.article_id]);
    }
  });
}
check('Slava search is independent of articles/images; partial names work in both scripts', () => {
  for (const [query, id] of [['Текла', 'obs-protomartyr-thecla'], ['Tekla', 'obs-protomartyr-thecla'],
    ['Доримедонт', 'obs-trophimus-sabbatius-dorymedon'], ['Dorimedont', 'obs-trophimus-sabbatius-dorymedon'],
    ['Јевстатије', 'obs-greatmartyr-eustathius'], ['Jevstatije', 'obs-greatmartyr-eustathius']]) {
    const result = searchCatalog(simulated, { ...context, articleContexts: [] }, { query, locale: 'sr-Cyrl', year: 2026, calendar_profile_id: PROFILE });
    const match = result.results.find(item => item.observance_id === id);
    assert.ok(match); assert.equal(match.date_state, 'source_recorded'); assert.deepEqual(match.article_ids, []);
  }
});
check('John conception remains a separate feast/date from January Synaxis, not a replacement', () => {
  const results = searchCatalog(simulated, context, { query: 'Јован', locale: 'sr-Cyrl', year: 2026, calendar_profile_id: PROFILE }).results;
  assert.deepEqual(results.find(item => item.observance_id === 'obs-john-baptist-synaxis').dates, ['2026-01-20']);
  assert.deepEqual(results.find(item => item.observance_id === 'obs-conception-john-forerunner').dates, ['2026-10-06']);
  assert.equal(results.find(item => item.observance_id === 'obs-conception-john-forerunner').kind, 'feast');
});
check('Quadratus is not Exaltation: exact calendar note remains in the old saint module only', () => {
  const obs = candidate.observances.find(item => item.id === 'obs-apostle-quadratus');
  assert.equal(obs.name['sr-Cyrl'], 'Свети апостол Кодрат');
  assert.equal(candidate.occurrences.find(item => item.observance_id === obs.id).calendar_title['sr-Cyrl'], 'Свети апостол Кодрат (Оданије Воздвижења)');
  assert.equal(candidate.article_links.find(item => item.observance_id === obs.id).article_id, 'apostle-quadratus');
  assert.equal(saints.days.find(item => item.date === '2026-10-04').calendar_notes[0].related_article_id, 'exaltation-cross');
});
check('2027 remains unavailable; wrong profile has no inferred dates', () => {
  assert.equal(resolveCatalogDay(simulated, context, { date: '2027-10-07', calendar_profile_id: PROFILE }).state, 'year_unavailable');
  const result = searchCatalog(simulated, context, { query: 'Tekla', locale: 'sr-Latn', year: 2027, calendar_profile_id: PROFILE });
  assert.deepEqual(result.results.find(item => item.observance_id === 'obs-protomartyr-thecla').dates, []);
  assert.equal(resolveCatalogDay(simulated, context, { date: '2026-10-07', calendar_profile_id: 'different-profile' }).reason, 'unknown_profile');
});
check('Corrupted binding hash, date join, script parity and pending observance do not become verified', () => {
  const wrongHash = copy(simulated); wrongHash.calendar_bindings[0].sha256 = '0'.repeat(64);
  assert.equal(evaluateCatalog(wrongHash, context).reason, 'calendar_mismatch');
  const wrongDate = copy(simulated); wrongDate.occurrences.at(-1).julian_date = '2026-09-26';
  assert.equal(evaluateCatalog(wrongDate, context).reason, 'calendar_day_mismatch');
  const wrongScript = copy(simulated); wrongScript.observances.at(-1).name['sr-Latn'] = 'Wrong';
  assert.equal(validateCatalogPayload(wrongScript).valid, false);
  const pending = copy(simulated); pending.observances.at(-1).review_status = 'pending';
  assert.equal(resolveCatalogDay(pending, context, { date: '2026-10-08', calendar_profile_id: PROFILE }).state, 'uncovered');
});

const bytes = Buffer.from(serialize(candidate));
if (process.argv.includes('--emit-pending-candidate')) {
  process.stdout.write(bytes);
} else {
  const persisted = await readFile(resolve(HERE, 'catalog.pending.json'));
  check('Persisted pending candidate equals exact deterministic reconstruction', () => assert.deepEqual(persisted, bytes));
  const provenance = delta.additions.map(row => ({
    date: row.date, observance_id: row.observance_id, article_id: row.article_id,
    calendar_source: base.sources.find(source => source.id === 'eparhija-month-10'),
    existing_article_sources: saints.articles.find(article => article.id === row.article_id).source_ids
      .map(id => saints.sources.find(source => source.id === id)),
  }));
  console.log(serialize({ status: 'PASS_EDITORIAL_ONLY', checks: checks.length, check_names: checks,
    candidate_sha256: HASH(bytes), candidate_bytes: bytes.length,
    additions: { subjects: 6, observances: 7, occurrences: 7, article_links: 7, articles: 0, calendar_day_changes: 0 },
    totals: { subjects: 18, observances: 34, occurrences: 32, article_links: 11, published_articles_unchanged: 62 },
    runtime_pending_gate: 'unapproved', native_tests_run: false, signatures_verified_here: false,
    published: false, web_research_performed: false,
    unknowns_preserved: delta.unchanged_unknowns, source_provenance: provenance }));
}
