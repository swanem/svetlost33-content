#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepare, HERE, BLOCK1_HASH } from './prepare.mjs';
import { assertAnnualMapping } from '../saints-year-end-block1-2026-10-06/prepare.mjs';
import { json, hash } from '../calendar-saints-expansion-2026-10-06/prepare.mjs';
import { toLatin, articleWordCount, parseSaintsPayload as historicalParser } from '../../scripts/validate-saints-v1.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';

assert.ok(process.argv.length === 3 && ['--write-new', '--check'].includes(process.argv[2]));
const p = await prepare(), checks = [];
const check = (name, fn) => { fn(); checks.push({ name, result: 'PASS' }); };
check('S12_and_entire_frozen_block1_handoff_artifacts_pinned', () => {
  assert.equal(p.base.index.sequence, 12);
  assert.equal(p.block1Pins[0].sha256, BLOCK1_HASH);
  assert.equal(p.block1Pins.length, 8);
  assert.equal(p.beforeSaints.articles.length, 62);
});
check('exact_21_annual_dates_titles_source_order_no_recurrence', () => {
  assert.deepEqual(p.days.map(x => x.date), p.calendar.days.filter(x => x.date >= '2026-12-11' && x.date <= '2026-12-31').map(x => x.date));
  assert.equal(p.days.length, 21);
  for (const day of p.days) assertAnnualMapping(day, p.calendar);
  for (const row of p.rows) for (const crosscheck of row.source_commemoration_crosschecks) {
    assert.equal(crosscheck.authority_for_2026_civil_date, false);
    if (crosscheck.month_day !== null) assert.equal(crosscheck.month_day, row.julian_date.slice(5));
  }
});
check('original62_and_prior_pending21_retained_without_promotion', () => {
  for (const view of [p.standalone, p.combined]) {
    assert.deepEqual(view.saints.articles.slice(0, 62), p.beforeSaints.articles);
    assert.deepEqual(view.saints.days.slice(0, 62), p.beforeSaints.days);
    assert.deepEqual(view.saints.sources.slice(0, 80), p.beforeSaints.sources);
    assert.deepEqual(view.saints.calendar_binding, p.beforeSaints.calendar_binding);
    assert.equal(view.saints.review_status, 'draft');
    assert.equal(view.catalog.review_status, 'pending');
  }
  assert.deepEqual(p.combined.saints.articles.slice(62, 83), p.first.newArticles);
  assert.deepEqual(p.combined.saints.days.slice(62, 83), p.first.newDays);
  assert.equal(p.combined.saints.articles.length, 104);
  assert.equal(p.combined.saints.days.length, 104);
  assert.equal(p.combined.saints.days.at(-1).date, '2026-12-31');
});
check('both_scripts_100_to_200_words_separate_editorial_takeaway', () => {
  for (const a of p.articles) {
    const c = a.content['sr-Cyrl'], l = a.content['sr-Latn'];
    for (const k of ['title', 'intro', 'takeaway']) assert.equal(l[k], toLatin(c[k]));
    assert.deepEqual(l.body, c.body.map(toLatin));
    for (const text of [c, l]) assert.ok(articleWordCount(text) >= 100 && articleWordCount(text) <= 200);
    assert.ok(c.takeaway.startsWith('Издвајамо'));
  }
});
check('23_specific_primary_sources_and_honest_unknown_bibliography', () => {
  assert.equal(p.sources.length, 23);
  assert.equal(p.sources.filter(x => new URL(x.url).hostname === 'www.oca.org').length, 21);
  assert.equal(p.sources.filter(x => x.published_on !== null).length, 1);
  for (const s of p.sources) {
    assert.equal(s.original_author, null); assert.equal(s.reviewed_on, '2026-10-06');
    assert.ok(['www.oca.org', 'mitropolija.com', 'www.manastirgornjak.rs'].includes(new URL(s.url).hostname));
    assert.equal(s.published_on, s.id === 'ks01-b2-gregory-gornjak' ? '2021-12-20' : null);
  }
  for (const a of p.articles) for (const id of a.source_ids) assert.ok(p.sources.some(x => x.id === id));
  assert.equal(p.rows.flatMap(x => x.excluded_detail_questions).length, 1);
});
check('nicholas_reuse_only_no_wrong_observance_or_identity_merge', () => {
  assert.deepEqual(p.rows.filter(x => x.operation.observance === 'reuse').map(x => x.observance_id), ['obs-nicholas-december']);
  for (const key of Object.keys(p.additions)) assert.deepEqual(p.standalone.catalog[key].slice(0, p.beforeCatalog[key].length), p.beforeCatalog[key]);
  assert.equal(p.additions.subjects.length, 19); assert.equal(p.additions.observances.length, 20);
  assert.equal(p.additions.occurrences.length, 20); assert.equal(p.additions.article_links.length, 21);
  assert.equal(p.additions.article_links.some(x => x.observance_id === 'obs-nicholas-relics-transfer'), false);
  const conception = p.articles.find(x => x.id === 'conception-theotokos-by-anna');
  assert.equal(conception.type, 'feast');
  assert.equal(p.rows.find(x => x.article_id === conception.id).subject_id, null);
  assert.equal(p.beforeSaints.articles.find(x => x.id === 'joachim-and-anna').type, 'group');
  for (const a of p.articles.filter(x => x.type === 'group')) {
    const row = p.rows.find(x => x.article_id === a.id);
    assert.deepEqual(p.standalone.catalog.observances.find(x => x.id === row.observance_id).subject_ids, [row.subject_id]);
  }
  assert.equal(p.additions.subjects.flatMap(x => x.aliases).length, 0);
  assert.equal(p.additions.observances.flatMap(x => x.aliases).length, 0);
});
check('real83_and104_KS01_bound_previews_historical_defaults_unchanged', () => {
  assert.equal(p.standalone.saints.articles.length, 83);
  assert.equal(historicalParser(p.base.modules['saints-v1'].bytes).valid, true);
  for (const view of [p.standalone, p.combined]) {
    assert.equal(profile.saints.parseSaintsPayload(view.saintsBytes).valid, true);
    assert.equal(profile.catalog.parseCatalogPayload(view.catalogBytes).valid, true);
    assert.equal(profile.browser.parseCalendarBrowserPayload(view.browserBytes).valid, true);
    assert.equal(historicalParser(view.saintsBytes).valid, false);
    assert.equal(view.catalog.article_bindings.find(x => x.module_id === 'saints-v1').sha256, hash(view.saintsBytes));
    assert.equal(view.browser.catalog_binding.sha256, hash(view.catalogBytes));
    for (const key of Object.keys(p.beforeBrowser).filter(k => !['version', 'revision', 'review_status', 'approval_id', 'catalog_binding'].includes(k))) assert.deepEqual(view.browser[key], p.beforeBrowser[key]);
  }
});
check('pending_content_never_runtime_eligible_no_synthetic_approval', () => {
  for (const view of [p.standalone, p.combined]) {
    assert.deepEqual(profile.saints.evaluateSaintsDay(view.saints, {}), { eligible: false, reason: 'unapproved' });
    assert.deepEqual(profile.catalog.evaluateCatalog(view.catalog, {}), { eligible: false, reason: 'unapproved' });
    assert.deepEqual(profile.browser.evaluateCalendarBrowser(view.browser, {}), { eligible: false, reason: 'unapproved' });
  }
  for (const key of Object.keys(p.additions)) for (const item of p.additions[key]) assert.equal(item.review_status, 'pending');
});
check('negative_duplicate_script_shape_and_exact_calendar_mapping', () => {
  for (const mutate of [x => x.articles.push(structuredClone(x.articles.at(-1))),
    x => { x.articles.at(-1).content['sr-Latn'].intro += ' changed'; }, x => { x.articles.at(-1).approved = true; }]) {
    const x = structuredClone(p.combined.saints); mutate(x); assert.equal(profile.saints.validateSaintsPayload(x).valid, false);
  }
  for (const mutate of [x => { x.julian_date = '2026-12-31'; }, x => { x.calendar_title['sr-Cyrl'] += ' '; },
    x => { x.calendar_source_ids = ['eparhija-month-11']; }]) {
    const x = structuredClone(p.days[0]); mutate(x); assert.throws(() => assertAnnualMapping(x, p.calendar));
  }
});
for (const [name, bytes] of p.files) assert.deepEqual(await readFile(resolve(HERE, name)), bytes, `Reproducible ${name}`);
checks.push({ name: 'master_delta_sources_deterministic_bytes', result: 'PASS' });
const files = [];
for (const name of ['manuscript.mjs', 'prepare.mjs', 'verify.mjs', ...p.files.keys()]) {
  const bytes = await readFile(resolve(HERE, name)); files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
}
const measure = view => ({ articles: view.saints.articles.length, sources: view.saints.sources.length, days: view.saints.days.length,
  saints_bytes: view.saintsBytes.length, catalog_bytes: view.catalogBytes.length, browser_bytes: view.browserBytes.length });
const receipt = { schema_version: 'svetlost33-ks01-block2-validation-1', status: 'PASS_PENDING_CONTENT_NOT_APPROVED', checked_on: '2026-10-06',
  command: 'node drafts/saints-year-end-block2-2026-10-06/verify.mjs --check', checks, total_checks: checks.length,
  counts: p.totals, files, block1_pins: p.block1Pins,
  words_per_script: { min: Math.min(...p.rows.map(x => x.word_counts['sr-Cyrl'])), max: Math.max(...p.rows.map(x => x.word_counts['sr-Cyrl'])) },
  standalone_measurement: measure(p.standalone), combined_measurement: measure(p.combined),
  runtime_payload_files_written: false, owner_approval: null, clerical_review: null, rights_clearance: null, signed: false, published: false, native_tested: false,
  limitations: ['No content, rights or canonical approval is supplied by tests.', 'Original HTML is not archived; no response-byte hashes claimed.',
    'Gregory of Gornjak place/exact year of repose remains an excluded detail question, not a guessed fact.',
    '104-article measurement contains62 approved and42 pending real editorial drafts; not synthetic prose and not a publishable release.',
    'Combined catalog excludes Package A/B deltas; final approved whole-generation merge remains separate.',
    'No new calendar/Gospel/fasting facts, 2027, native code or build.'] };
const receiptBytes = json(receipt);
const handoff = { schema_version: 'svetlost33-ks01-block2-handoff-1', status: receipt.status,
  path: 'drafts/saints-year-end-block2-2026-10-06', window: ['2026-12-11', '2026-12-31'], counts: p.totals,
  artifacts: [...files, { path: 'validation.json', bytes: receiptBytes.length, sha256: hash(receiptBytes) }],
  check: receipt.command, result: `${checks.length}/${checks.length} PASS`, block1_handoff_sha256: BLOCK1_HASH,
  next_gate: 'Independent exact-text/identity/link/rights review of21 new block2 articles; all remain pending. Revisions must be explicit.',
  remaining_detail_question: 'Gregory of Gornjak repose place/year intentionally omitted because the sources are not unambiguous.',
  combined_measurement: receipt.combined_measurement, approved_originals_preserved: true, no_publication_or_native_changes: true };
for (const [name, bytes] of [['validation.json', receiptBytes], ['handoff.json', json(handoff)]]) {
  if (process.argv[2] === '--write-new') await writeFile(resolve(HERE, name), bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(resolve(HERE, name)), bytes, `Reproducible ${name}`);
}
console.log(JSON.stringify({ result: `${checks.length}/${checks.length} PASS`, status: receipt.status,
  counts: p.totals, words_per_script: receipt.words_per_script, combined: receipt.combined_measurement,
  validation_sha256: hash(receiptBytes), handoff_sha256: hash(json(handoff)) }, null, 2));
