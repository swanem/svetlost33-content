#!/usr/bin/env node
// One small, deterministic suite. Validation is not source/rights/owner approval.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepare, assertAnnualMapping, HERE } from './prepare.mjs';
import { hash, json } from '../calendar-saints-expansion-2026-10-06/prepare.mjs';
import { toLatin, articleWordCount, parseSaintsPayload as historicalParser } from '../../scripts/validate-saints-v1.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';

assert.ok(process.argv.length === 3 && ['--write-new', '--check'].includes(process.argv[2]));
const p = await prepare();
const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, result: 'PASS' }); };
check('pinned_S12_inputs_and_previously_frozen_A_capacity_handoffs', () => {
  assert.equal(p.base.index.sequence, 12);
  assert.equal(p.beforeSaints.articles.length, 62);
  assert.equal(p.protectedInputs.length, 4);
});
check('exact_21_existing_annual_rows_no_unproven_date_conversion', () => {
  const dates = p.calendar.days.filter(x => x.date >= '2026-11-20' && x.date <= '2026-12-10').map(x => x.date);
  assert.equal(dates.length, 21);
  assert.deepEqual(p.newDays.map(x => x.date), dates);
  for (const day of p.newDays) assertAnnualMapping(day, p.calendar);
  for (const row of p.inventory) {
    assert.equal(row.canonical_source_commemoration_month_day, row.julian_date.slice(5));
    assert.equal(row.date_evidence.fresh_calendar_web_fetch, false);
    assert.deepEqual(row.unresolved_identity_or_date, []);
  }
});
check('62_existing_articles_sources_days_and_calendar_binding_preserved', () => {
  assert.deepEqual(p.saints.articles.slice(0, 62), p.beforeSaints.articles);
  assert.deepEqual(p.saints.days.slice(0, 62), p.beforeSaints.days);
  assert.deepEqual(p.saints.sources.slice(0, 80), p.beforeSaints.sources);
  assert.deepEqual(p.saints.calendar_binding, p.beforeSaints.calendar_binding);
  assert.equal(p.newArticles.length, 21);
  assert.equal(p.newArticles.some(a => p.beforeSaints.articles.some(b => a.id === b.id)), false);
});
check('both_scripts_100_to_200_words_separate_original_editorial_takeaway', () => {
  for (const a of p.newArticles) {
    const cyrl = a.content['sr-Cyrl'], latn = a.content['sr-Latn'];
    for (const k of ['title', 'intro', 'takeaway']) assert.equal(latn[k], toLatin(cyrl[k]));
    assert.deepEqual(latn.body, cyrl.body.map(toLatin));
    for (const c of [cyrl, latn]) assert.ok(articleWordCount(c) >= 100 && articleWordCount(c) <= 200);
    assert.ok(cyrl.takeaway.startsWith('Издвајамо'));
  }
});
check('22_specific_church_sources_unknown_publication_not_fabricated', () => {
  assert.equal(p.sourceRecords.length, 22);
  assert.equal(new Set(p.sourceRecords.map(x => x.id)).size, 22);
  for (const s of p.sourceRecords) {
    assert.equal(s.reviewed_on, '2026-10-06');
    assert.equal(s.original_author, null);
    assert.ok(['www.oca.org', 'www.spc.rs'].includes(new URL(s.url).hostname));
    assert.equal(s.published_on, s.id.endsWith('spc-date') ? '2021-12-08' : null);
  }
  for (const a of p.newArticles) for (const id of a.source_ids) assert.ok(p.sourceRecords.some(s => s.id === id));
  assert.equal(p.saints.sources.at(-1).reviewed_on, '2026-09-15');
});
check('reuse_two_catalog_observances_no_duplicate_or_silent_group_split', () => {
  assert.equal(p.additions.subjects.length, 19);
  assert.equal(p.additions.observances.length, 19);
  assert.equal(p.additions.occurrences.length, 19);
  assert.equal(p.additions.article_links.length, 21);
  assert.deepEqual(p.inventory.filter(x => x.operation.observance === 'reuse').map(x => x.observance_id), ['obs-michael-synaxis', 'obs-entry-theotokos']);
  for (const key of ['sources', 'subjects', 'observances', 'occurrences', 'article_links']) {
    assert.deepEqual(p.catalog[key].slice(0, p.beforeCatalog[key].length), p.beforeCatalog[key]);
  }
  for (const a of p.newArticles.filter(x => x.type === 'group')) {
    const row = p.inventory.find(x => x.article_id === a.id);
    assert.equal(p.catalog.subjects.find(x => x.id === row.subject_id).type, 'group');
    assert.deepEqual(p.catalog.observances.find(x => x.id === row.observance_id).subject_ids, [row.subject_id]);
  }
  assert.equal(p.additions.subjects.flatMap(x => x.aliases).length, 0);
  assert.equal(p.additions.observances.flatMap(x => x.aliases).length, 0);
  assert.equal(p.newArticles.find(x => x.id === 'philip-apostle-twelve').type, 'saint');
  assert.ok(p.beforeSaints.articles.some(x => x.id === 'philip-deacon-seventy'));
});
check('explicit_KS01_profile_accepts_83_article_local_preview_not_historical_v1', () => {
  assert.equal(profile.saints.parseSaintsPayload(p.saintsBytes).valid, true);
  assert.equal(profile.catalog.parseCatalogPayload(p.catalogBytes).valid, true);
  assert.equal(profile.browser.parseCalendarBrowserPayload(p.browserBytes).valid, true);
  assert.equal(historicalParser(p.base.modules['saints-v1'].bytes).valid, true);
  assert.equal(historicalParser(p.saintsBytes).valid, false);
  assert.equal(p.saints.articles.length, 83);
  assert.equal(p.catalog.article_bindings.find(x => x.module_id === 'saints-v1').sha256, hash(p.saintsBytes));
  assert.equal(p.browser.catalog_binding.sha256, hash(p.catalogBytes));
  for (const key of Object.keys(p.beforeBrowser).filter(k => !['version', 'revision', 'review_status', 'approval_id', 'catalog_binding'].includes(k))) {
    assert.deepEqual(p.browser[key], p.beforeBrowser[key]);
  }
});
check('pending_prose_metadata_and_links_never_runtime_eligible', () => {
  assert.deepEqual(profile.saints.evaluateSaintsDay(p.saints, {}), { eligible: false, reason: 'unapproved' });
  assert.deepEqual(profile.catalog.evaluateCatalog(p.catalog, {}), { eligible: false, reason: 'unapproved' });
  assert.deepEqual(profile.browser.evaluateCalendarBrowser(p.browser, {}), { eligible: false, reason: 'unapproved' });
  for (const key of Object.keys(p.additions)) for (const row of p.additions[key]) assert.equal(row.review_status, 'pending');
  assert.equal(p.saints.review_status, 'draft');
  assert.equal(p.catalog.approval_id, null); assert.equal(p.browser.approval_id, null);
});
check('negative_duplicate_script_shape_and_exact_annual_join', () => {
  for (const mutate of [x => x.articles.push(structuredClone(x.articles.at(-1))),
    x => { x.articles.at(-1).content['sr-Latn'].intro += ' altered'; },
    x => { x.articles.at(-1).owner_approved = true; }]) {
    const x = structuredClone(p.saints); mutate(x);
    assert.equal(profile.saints.validateSaintsPayload(x).valid, false);
  }
  for (const mutate of [x => { x.julian_date = '2026-11-28'; }, x => { x.calendar_title['sr-Cyrl'] += ' '; },
    x => { x.calendar_source_ids = ['eparhija-month-12']; }]) {
    const x = structuredClone(p.newDays[0]); mutate(x);
    assert.throws(() => assertAnnualMapping(x, p.calendar));
  }
});
for (const [name, bytes] of p.files) assert.deepEqual(await readFile(resolve(HERE, name)), bytes, `Reproducible ${name}`);
checks.push({ name: 'master_delta_source_registry_deterministic_bytes', result: 'PASS' });
const records = [];
for (const name of ['manuscript.mjs', 'prepare.mjs', 'verify.mjs', ...p.files.keys()]) {
  const bytes = await readFile(resolve(HERE, name)); records.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
}
const receipt = { schema_version: 'svetlost33-ks01-block1-validation-1', status: 'PASS_PENDING_CONTENT_NOT_APPROVED',
  checked_on: '2026-10-06', command: 'node drafts/saints-year-end-block1-2026-10-06/verify.mjs --check',
  checks, total_checks: checks.length, files: records, counts: p.totals,
  words_per_script: { min: Math.min(...p.inventory.map(x => x.word_counts['sr-Cyrl'])), max: Math.max(...p.inventory.map(x => x.word_counts['sr-Cyrl'])) },
  in_memory_raw_bytes: { saints: p.saintsBytes.length, catalog: p.catalogBytes.length, browser: p.browserBytes.length },
  runtime_files_written: false, native_tested: false, owner_approval: null, clerical_review: null, rights_clearance: null,
  signed: false, published: false, protected_inputs: p.protectedInputs,
  limitations: ['Structural validation does not certify prose correctness, rights or canonical approval.',
    'Church-page extracted text read; original HTML not archived and response-byte hashes unavailable.',
    'S12 annual rows are the sole 2026 date authority; no fresh November/December calendar fetch.',
    'Local merged 83-article preview excludes pending Package A/B changes; future approved release must rebase and regenerate exact bindings.',
    'No second block, production payload, release set, signature, approval record or native build produced.'] };
const receiptBytes = json(receipt);
const handoff = { schema_version: 'svetlost33-ks01-block1-handoff-1', status: receipt.status,
  path: 'drafts/saints-year-end-block1-2026-10-06', window: ['2026-11-20', '2026-12-10'], counts: p.totals,
  artifacts: [...records, { path: 'validation.json', bytes: receiptBytes.length, sha256: hash(receiptBytes) }],
  check: receipt.command, result: `${checks.length}/${checks.length} PASS`,
  next_gate: 'Human review of these exact 21 new texts and pending metadata/rights; no owner or church approval has been supplied.',
  sources: 'sources.json: 21 directly opened OCA church lives and 1 directly opened SPC dated report; annual mappings remain pinned S12.',
  reuse: '0 existing articles; 2 existing catalog observances/occurrences reused without changes.',
  approved_originals_preserved: true, no_publication_or_native_changes: true };
for (const [name, bytes] of [['validation.json', receiptBytes], ['handoff.json', json(handoff)]]) {
  if (process.argv[2] === '--write-new') await writeFile(resolve(HERE, name), bytes, { flag: 'wx' });
  else assert.deepEqual(await readFile(resolve(HERE, name)), bytes, `Reproducible ${name}`);
}
console.log(JSON.stringify({ result: `${checks.length}/${checks.length} PASS`, status: receipt.status, counts: p.totals,
  validation_sha256: hash(receiptBytes), handoff_sha256: hash(json(handoff)), in_memory_raw_bytes: receipt.in_memory_raw_bytes }, null, 2));
