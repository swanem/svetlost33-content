#!/usr/bin/env node
// Assemble reviewed local candidates only; no signatures, production paths or network writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, json, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { loadCalendarBrowserS9Base, S9_ARCHIVE, S9_INDEX_SHA256, S9_RELEASE_SHA256 } from './prepare-calendar-browser-release-v2.mjs';
import { prepareArchiveCandidate } from './prepare-calendar-browser-archive-candidate.mjs';
import { validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';
import { validateCalendarBrowserPayload } from './validate-calendar-browser-v1.mjs';

export const APPROVAL_ID = 'calendar-browser-2026-09-27-coordinator-r1';
export const RELEASE_ID = 'shared-calendar-browser-2026-09-27-m0v2-s10';
export const REVIEW_PATH = 'drafts/calendar-browser-2026-09-27/holiday-review.json';
export const SCOPE_PATH = 'approvals/calendar-browser-2026-09-27/continuation-scope.json';
export const REVIEW_SHA256 = 'f0cfe5d6e75f9d5fcad95b5b38c1aa1de7efe1be3057f4828ded1f57279d64f8';
export const SCOPE_SHA256 = '6a334338dee51eaa4a6d1d43cc599eb5f10c351b965f754cbd359b78464a0b84';
const START = '2026-09-29', END = '2026-12-31', DEADLINE = '2026-09-28T10:00:00Z';
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const reviewed = rows => rows.map(row => ({ ...structuredClone(row), review_status: 'reviewed' }));
async function input(path) {
  await assertNoSymlinkPath(resolve(ROOT, path));
  const bytes = await readFile(resolve(ROOT, path));
  return { bytes, value: JSON.parse(bytes), record: record(path, bytes) };
}

export async function prepareCalendarContent({ coordinatorReviewed = false, now = new Date().toISOString(), sourceDirectory = BASE } = {}) {
  assert.equal(coordinatorReviewed, true, 'Explicit coordinator source-review GO required');
  assert.ok(Date.parse(now) < Date.parse(DEADLINE), 'Prospective publication deadline missed; review a later start before preparing');
  const base = await loadCalendarBrowserS9Base({ sourceDirectory, now });
  const draft = await input(REVIEW_PATH), scope = await input(SCOPE_PATH);
  assert.equal(draft.record.sha256, REVIEW_SHA256, 'Exact coordinator-reviewed draft snapshot');
  assert.equal(scope.record.sha256, SCOPE_SHA256, 'Exact quoted owner scope snapshot');
  assert.ok(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(`${draft.value.checked_on}T00:00:00Z`)
    && Date.parse(now) >= Date.parse(`${scope.value.recorded_on}T00:00:00Z`), 'Preparation cannot predate source or owner scope review');
  assert.equal(scope.value.record_type, 'OWNER_SCOPE_APPROVAL_NOT_EXACT_PAYLOAD_RECEIPT');
  assert.deepEqual(new Set(scope.value.platforms), new Set(['android', 'ios']));
  const oldEntry = base.set.modules.find(row => row.module_id === 'liturgical-catalog-v1');
  const oldPath = `${dirname(oldEntry.manifest_path)}/data/liturgical-catalog-v1.json`;
  const oldBytes = base.files.get(oldPath), old = JSON.parse(oldBytes);
  assert.equal(draft.value.schema_version, 'svetlost33-holiday-review-draft-1');
  assert.equal(draft.value.base_catalog.sha256, sha256(oldBytes), 'Exact reviewed baseline');
  assert.equal(draft.value.calendar_profile_id, old.calendar_profiles[0].id);
  assert.deepEqual(draft.value.calendar_binding, old.calendar_bindings[0]);
  assert.equal(draft.value.review_status, 'pending');
  assert.equal(draft.value.approval_id, null);
  const catalog = structuredClone(old);
  catalog.version = '2026.9.27'; catalog.revision = old.revision + 1;
  catalog.approval_id = APPROVAL_ID; catalog.review_status = 'approved';
  for (const key of ['sources', 'subjects', 'observances', 'occurrences']) {
    const additions = draft.value.catalog_additions[key];
    assert.ok(Array.isArray(additions), `Explicit additions: ${key}`);
    assert.ok(additions.every(row => !old[key].some(prior => prior.id === row.id)), `Never replace canonical ${key}`);
    catalog[key].push(...reviewed(additions));
  }
  // Leave old articles, titles, permissions, migration states and bindings exactly intact.
  catalog.coverage = structuredClone(draft.value.proposed_coverage);
  assert.deepEqual(catalog.article_links, old.article_links);
  assert.deepEqual(catalog.article_bindings, old.article_bindings);
  assert.deepEqual(catalog.calendar_bindings, old.calendar_bindings);
  assert.deepEqual(catalog.legacy_slava_links, old.legacy_slava_links);
  assert.deepEqual(validateCatalogPayload(catalog), { valid: true, reason: null });
  const catalogBytes = json(catalog);
  const libraryEntry = base.set.modules.find(row => row.module_id === 'library-annual-2026-r1');
  const cyclesEntry = base.set.modules.find(row => row.module_id === 'daily-cycles-r1');
  const moduleSource = entry => {
    const manifest = JSON.parse(base.files.get(entry.manifest_path));
    return { module_id: entry.module_id, version: entry.version, revision: manifest.revision, manifest_sha256: entry.manifest_sha256 };
  };
  const loadData = (entry, path) => JSON.parse(base.files.get(`${dirname(entry.manifest_path)}/data/${path}`));
  const days = locale => loadData(cyclesEntry, `legacy-cycle.${locale}.json`).days.map(day => ({
    id: day.id, cycle_day: day.cycle_day, slots: day.slots.map(slot => ({ id: slot.id, phase: slot.phase,
      psalm_id: slot.quote.psalm_id, verse_numbers: slot.quote.verse_numbers, prayer_id: slot.prayer_id }))
  }));
  const library = locale => ({ ...moduleSource(libraryEntry),
    psalms: loadData(libraryEntry, `psalms.${locale}.json`).psalms.map(psalm => ({ id: psalm.id, verse_numbers: psalm.verses.map(verse => verse.number) })),
    prayer_ids: loadData(libraryEntry, `prayers.${locale}.json`).prayers.map(prayer => prayer.id) });
  assert.deepEqual(days('sr-Cyrl'), days('sr-Latn'), 'Both scripts have identical date assignments');
  assert.deepEqual(library('sr-Cyrl'), library('sr-Latn'), 'Both scripts have identical reader IDs/verses');
  const binding = { id: 'calendar-week-2026-s9', policy_id: 'calendar-week-v1', policy_version: 1,
    library_binding: moduleSource(libraryEntry), cycles_binding: moduleSource(cyclesEntry) };
  // Trust is constructed only from the captured S9 graph verified by the loader, never from draft JSON.
  const proposal = prepareArchiveCandidate({ version: '2026.9.27', revision: 1,
    calendar_profile_id: draft.value.calendar_profile_id, archive_start_date: START, archive_end_date: END,
    publication_evidence_id: 'calendar-browser-2026-prospective-plan', archive_binding: binding,
    source_context: { authenticated: true, review_status: 'approved', binding_id: binding.id,
      generation: { id: base.set.release_set_id, sequence: base.set.sequence, decision_sha256: sha256(base.files.get(`${S9_ARCHIVE}/index.json`)) },
      library: library('sr-Cyrl'), cycles: { ...moduleSource(cyclesEntry), days: days('sr-Cyrl') } } });
  const browser = proposal.payload;
  browser.review_status = 'approved'; browser.approval_id = APPROVAL_ID;
  browser.catalog_binding = { module_id: oldEntry.module_id, version: catalog.version, revision: catalog.revision,
    path: 'data/liturgical-catalog-v1.json', sha256: sha256(catalogBytes) };
  browser.feast_memberships = reviewed(draft.value.feast_memberships);
  assert.deepEqual(validateCalendarBrowserPayload(browser), { valid: true, reason: null });
  const browserBytes = json(browser);
  const plan = { schema_version: 'svetlost33-prospective-archive-plan-1', status: 'PLANNED_NOT_PUBLISHED',
    publication_receipt: null, archive_start_date: START, archive_end_date: END,
    publish_before_utc: DEADLINE, deadline_basis: 'Before the first assigned civil date in UTC+14; all supported device zones remain future',
    policy_id: binding.policy_id, policy_version: binding.policy_version, archive_binding: binding,
    archive_days_sha256: sha256(json(browser.archive_days)), expected_days: browser.archive_days.length,
    before_start: 'unavailable', future_reading: 'forbidden_until_date_is_past_in_device_local_zone',
    if_deadline_missed: 'Abort publication; review a later first date, regenerate, and repeat gates',
    source_generation: proposal.source_generation, note: 'Source S9 authenticated. New schedule is unsigned and not yet public; no retroactive history claim.' };
  const review = { schema_version: 'svetlost33-calendar-browser-candidate-review-1', status: 'APPROVED_FOR_LOCAL_CANDIDATE',
    approval_id: APPROVAL_ID, recorded_at: now, reviewer_role: 'editorial_review_under_owner_scope',
    statement: 'Coordinator reviewed exact factual calendar additions and prospective schedule under the owner scope approval. The owner did not individually review these later-created bytes. This is not a publication receipt or authorization to bypass native/signing gates.',
    approval_scope_record: scope.record, source_reviews: [draft.record],
    scope: { release_set_id: RELEASE_ID, sequence: 10, base_index_sha256: S9_INDEX_SHA256, base_release_sha256: S9_RELEASE_SHA256,
      payloads: [{ module_id: 'liturgical-catalog-v1', bytes: catalogBytes.length, sha256: sha256(catalogBytes) },
        { module_id: 'calendar-browser-v1', bytes: browserBytes.length, sha256: sha256(browserBytes) }],
      feast_memberships: browser.feast_memberships, archive_start_date: START, archive_days: browser.archive_days },
    prospective_publication_plan: { status: plan.status, start_date: START, end_date: END, publish_before_utc: DEADLINE,
      policy_id: binding.policy_id, policy_version: binding.policy_version, archive_bindings: browser.archive_bindings },
    rights_basis: 'Factual names/dates with attributed sources and original short editorial labels only. Existing text licenses unchanged; no imported prose/images/audio or invented permission.',
    publication_authorized: false, runtime_authenticated: false, publication_receipt: null };
  const files = new Map([
    ['catalog.json', catalogBytes], ['browser.json', browserBytes],
    ['prospective-publication-plan.json', json(plan)], ['candidate-review.json', json(review)]
  ]);
  return { files, catalog, browser, plan, review, draft, scope, source: base, now };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--coordinator-reviewed' || args[1] !== '--out')
    throw new Error('Usage: --coordinator-reviewed --out <new-local-candidate-directory>');
  const result = await prepareCalendarContent({ coordinatorReviewed: true });
  await assertNoSymlinkPath(args[2], { allowMissing: true });
  const out = resolve(args[2]);
  assert.ok(!out.startsWith(resolve(ROOT, 'releases')) && !out.startsWith(resolve(ROOT, 'modules')), 'Never write production/module trees');
  await writeNewTree(out, result.files);
  console.log(JSON.stringify({ state: 'LOCAL_REVIEWED_UNSIGNED_NOT_PUBLISHED', out,
    observances: result.catalog.observances.length, feasts: result.browser.feast_memberships.length,
    archive_days: result.browser.archive_days.length, archive_start_date: START, publish_before_utc: DEADLINE,
    files: [...result.files].map(([path, bytes]) => record(path, bytes)) }, null, 2));
}
