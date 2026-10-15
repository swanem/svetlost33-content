import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { buildGospelIndex, parseRadioHtml, referenceErrors, reviewObservation, sourceURL } from '../../scripts/radio-monitor-core-v2.mjs';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const safeRead = async path => { assert.equal((await lstat(path)).isSymbolicLink(), false); return readFile(path); };

export async function loadPinned() {
  const pins = await readJSON(resolve(here, 'pins.json')), result = { pins };
  assert.deepEqual(pins.files.map(x => x.role).sort(), ['calendar', 'calendarManifest', 'core', 'corpus', 'inventory', 'libraryManifest', 'set']);
  for (const file of pins.files) {
    assert.ok(!file.path.includes('..') && !file.path.startsWith('/'));
    const bytes = await safeRead(resolve(root, file.path));
    assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha256(bytes), file.sha256, file.path);
    if (file.role !== 'core') result[file.role] = JSON.parse(bytes);
  }
  const { inventory, set, calendarManifest, libraryManifest } = result;
  const pin = role => pins.files.find(x => x.role === role);
  assert.equal(pin('set').sha256, 'ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879');
  assert.equal(pin('calendar').sha256, 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c');
  assert.equal(inventory.source.release_set_sha256, pin('set').sha256);
  assert.equal(inventory.source.calendar_payload_sha256, pin('calendar').sha256);
  assert.equal(inventory.source.calendar_manifest_sha256, pin('calendarManifest').sha256);
  assert.equal(`releases/v2/production/${inventory.source.calendar_path}`, pin('calendar').path);
  for (const [role, module] of [['calendarManifest', calendarManifest], ['libraryManifest', libraryManifest]]) {
    const link = set.modules.find(x => x.module_id === module.module_id);
    assert.equal(link.manifest_sha256, pin(role).sha256); assert.equal(link.manifest_bytes, pin(role).bytes);
    assert.equal(`releases/v2/production/${link.manifest_path}`, pin(role).path);
  }
  for (const [role, module, path] of [['calendar', calendarManifest, 'data/calendar.2026.json'], ['corpus', libraryManifest, 'data/gospels.sr-Cyrl.json']]) {
    const file = module.files.find(x => x.path === path);
    assert.equal(file.sha256, pin(role).sha256); assert.equal(file.bytes, pin(role).bytes);
  }
  return result;
}

function rowFacts(row) { return { date: row.date, references: row.references, notes: row.notes, supplemental_blessing: row.supplemental_blessing }; }
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Replays factual rows through the actual parser. This synthetic fixture is NOT original HTML. */
export function replayFacts(rows, index) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 366);
  for (const row of rows) {
    assert.match(row.date, /^2026-\d{2}-\d{2}$/u);
    assert.ok(Array.isArray(row.references) && Array.isArray(row.notes));
    assert.ok([...row.references, ...row.notes].every(x => typeof x === 'string' && x.length <= 2000));
  }
  const html = `<h1>Тумачења Јеванђеља за 2026. годину</h1><table>${rows.map(row => `<tr id="Datum${row.date.replaceAll('-', '')}"><td>day</td><td>date</td><td>${[...row.notes, ...row.references].map(escape).join('<br>')}</td></tr>`).join('')}</table>`;
  const replayed = parseRadioHtml(html, 2026, index);
  assert.deepEqual(replayed, rows, 'stored rows must exactly match parser validation, ordering and normalization');
  return replayed;
}

export function inspectObservation(inputs, observation) {
  const { calendar, corpus, inventory, pins } = structuredClone(inputs);
  const copy = structuredClone(observation), index = buildGospelIndex(corpus);
  assert.equal(copy.schema_version, 'svetlost33-radio-source-observation-1'); assert.equal(copy.year, 2026);
  assert.equal(copy.status, 'radio_only_not_liturgical_assignment');
  assert.equal(copy.owner_approval, null); assert.equal(copy.publication_authorized, false);
  assert.equal(copy.source.requested_url, sourceURL(2026)); assert.equal(copy.source.effective_url, sourceURL(2026));
  assert.equal(copy.source.http_status, 200); assert.equal(copy.source.response_body_retained, false);
  assert.match(copy.source.content_type ?? '', /^text\/html(?:\s*;|\s*$)/iu);
  const charsets = [...copy.source.content_type.matchAll(/;\s*charset\s*=\s*"?([^;"\s]+)"?/giu)];
  assert.ok(charsets.length <= 1 && (!charsets.length || /^utf-?8$/iu.test(charsets[0][1])));
  assert.equal(copy.source.response_hash_is_not_a_signature, true);
  assert.match(copy.source.response_sha256, /^[a-f0-9]{64}$/u);
  assert.ok(Number.isInteger(copy.source.response_bytes) && copy.source.response_bytes > 0 && copy.source.response_bytes <= 5_000_000);
  const start = Date.parse(copy.source.requested_at), end = Date.parse(copy.source.checked_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 15_000);
  assert.equal(sha256(jsonBytes(copy.rows)), copy.rows_sha256);
  const rows = replayFacts(copy.rows, index);
  const before = calendar.days.flatMap(day => {
    const observations = day.gospel.source_observations.filter(x => x.source_id === 'radio');
    assert.equal(observations.length, 1); const source = observations[0];
    if (!source.source_row_present) { assert.deepEqual(source.references, []); return []; }
    return [{ date: day.date, references: source.references, notes: source.source_notes,
      supplemental_blessing: source.supplemental_blessing,
      validation_errors: source.references.flatMap((ref, reference) => referenceErrors(ref, index).map(x => ({ reference, ...x }))) }];
  });
  const observed = reviewObservation({ year: 2026, rows: before, last_success_at: null, seen_fingerprints: [] }, rows,
    { year: 2026, checkedAt: copy.source.checked_at });
  const diff = observed.candidate?.diff ?? { added: [], changed: [], removed: [] };
  const prior = new Map(before.map(x => [x.date, x])), current = new Map(rows.map(x => [x.date, x]));
  const classify = row => !prior.has(row.date) ? 'ADDED_RADIO_ROW' :
    JSON.stringify(rowFacts(prior.get(row.date))) !== JSON.stringify(rowFacts(row)) ? 'CHANGED_RADIO_FACTS' : 'UNCHANGED_RADIO_FACTS';
  const pending = row => ({ ...structuredClone(row), change: classify(row),
    status: 'radio_only_not_liturgical_assignment', review_status: 'PENDING', service_assignment_status: 'UNRESOLVED',
    production_eligible: false, source_locator: `tr#Datum${row.date.replaceAll('-', '')}`,
    baseline_gospel_status: calendar.days.find(x => x.date === row.date).gospel.status,
    baseline_gospel_reason: calendar.days.find(x => x.date === row.date).gospel.reason,
    previously_unresolved: inventory.entries.find(x => x.date === row.date)?.unresolved.includes('gospel') ?? false });
  const added = diff.added, changed = diff.changed.map(x => x.after);
  const hasValidReferences = row => row.references.length > 0 && !row.validation_errors.length;
  const validationErrors = rows.filter(x => x.validation_errors.length).map(pending);
  const candidate = { schema_version: 'svetlost33-radio-refresh-candidate-1',
    status: 'radio_only_not_liturgical_assignment', review_status: 'PENDING',
    owner_approval: null, clerical_review: null, publication_authorized: false, release_allowed: false,
    source: copy.source, source_rows_sha256: copy.rows_sha256,
    baseline_calendar_sha256: pins.files.find(x => x.role === 'calendar').sha256,
    valid_added: added.filter(hasValidReferences).map(pending),
    valid_changed: diff.changed.filter(x => hasValidReferences(x.after)).map(x => ({ date: x.date, before: x.before, after: pending(x.after) })),
    no_reference_observations: rows.filter(x => !x.references.length).map(x => ({ ...pending(x), reference_status: 'NO_REFERENCE_NOT_ASSIGNMENT' })),
    errored_observations: validationErrors,
    removed_observations: diff.removed,
    notes: ['Verse-range validity is not liturgical assignment or owner approval.',
      'Errored rows are not repaired or partly promoted.', 'Removed rows are review signals, not deletion instructions.',
      'Supplemental blessing remains radio-only. Existing identity-review signals are not resolved by this parser.'] };
  const allErrors = validationErrors.flatMap(x => x.validation_errors.map(error => ({ date: x.date, ...error, raw_reference: x.references[error.reference] })));
  const priorSignals = calendar.days.filter(x => x.gospel.reference_identity_review.length).map(x => ({ date: x.date, signals: x.gospel.reference_identity_review }));
  const reasonCounts = {}, statusCounts = {};
  for (const day of calendar.days) {
    statusCounts[day.gospel.status] = (statusCounts[day.gospel.status] ?? 0) + 1;
    reasonCounts[day.gospel.reason] = (reasonCounts[day.gospel.reason] ?? 0) + 1;
  }
  const dateReviews = [...added, ...changed].sort((a, b) => a.date.localeCompare(b.date)).map(row => {
    const old = calendar.days.find(x => x.date === row.date).gospel;
    return { date: row.date, change: classify(row), source_references: row.references, validation_errors: row.validation_errors,
      source_reference_status: row.validation_errors.length ? 'ERROR_NOT_CORRECTED' : !row.references.length ? 'NO_REFERENCE_NOT_ASSIGNMENT' : 'VERSE_RANGES_VALID_NOT_LITURGICAL_APPROVAL',
      pinned_annual_status: old.status, pinned_annual_reason: old.reason,
      pinned_annual_service_assignment_status: old.service_assignment_status,
      pinned_annual_reading_count: old.readings.length, proposed_runtime_change: false };
  });
  const report = { status: candidate.status, publication_authorized: false, owner_approval: null,
    source_checked_at: copy.source.checked_at, source_response_sha256: copy.source.response_sha256,
    counts: { previous_radio_rows: before.length, observed_radio_rows: rows.length,
      unchanged_radio_rows: rows.filter(x => classify(x) === 'UNCHANGED_RADIO_FACTS').length,
      added_rows: added.length, valid_added_rows: candidate.valid_added.length, errored_added_rows: added.filter(x => x.validation_errors.length).length,
      changed_rows: changed.length, valid_changed_rows: candidate.valid_changed.length, errored_changed_rows: changed.filter(x => x.validation_errors.length).length,
      removed_rows: diff.removed.length, valid_observed_rows: rows.filter(hasValidReferences).length,
      no_reference_rows: candidate.no_reference_observations.length,
      errored_observed_rows: validationErrors.length, validation_errors: allErrors.length,
      supplemental_blessing_rows: rows.filter(x => x.supplemental_blessing).length,
      existing_identity_review_dates: priorSignals.length,
      prior_gospel_unresolved: inventory.summary.gospel_unresolved, resolved_calendar_gaps: 0, calendar_dates_changed: 0 },
    observed_window: { first: rows[0].date, last: rows.at(-1).date },
    pinned_annual_gospel_projection: { days: calendar.days.length, status_counts: statusCounts, reason_counts: reasonCounts,
      note: 'SOURCE_RECORDED means a radio/source proposal, not a confirmed liturgical service assignment. The published 173/192 projection is unchanged.',
      original_radio_rows: before.length, original_radio_rows_unresolved: before.filter(x => calendar.days.find(d => d.date === x.date).gospel.status === 'UNRESOLVED').length,
      supplemental_flag_rows: before.filter(x => x.supplemental_blessing).length,
      supplemental_primary_reason_rows: reasonCounts.radio_supplemental_blessing_not_a_service_assignment ?? 0,
      note_on_overlap: '42 supplemental flags are not an additive unresolved-reason bucket: 40 have that primary reason, while 2 are in dated_sources_disagree. The 8 identity-review dates are overlapping review signals, not 8 additional unresolved days.' },
    new_or_changed_date_reviews: dateReviews,
    new_valid_dates: candidate.valid_added.map(x => x.date), errors: allErrors,
    radio_rows_still_missing: calendar.days.filter(x => !current.has(x.date)).map(x => x.date),
    prior_identity_reviews_preserved_not_resolved: priorSignals,
    monitor_last_good_state_advanced: JSON.stringify(observed.state.rows) !== JSON.stringify(before),
    monitor_validation_failed: observed.validation_failed, production_activation_allowed: false,
    remaining_gates: ['human_source_fact_review', 'separate_liturgical_assignment_review_if_requested', 'explicit_content_approval', 'new_exact_release_and_native_validation', 'separate_production_authorization'] };
  return { candidate, report };
}

export async function verifyBundle() {
  const manifest = await readJSON(resolve(here, 'manifest.json'));
  assert.equal(manifest.publication_authorized, false); assert.equal(manifest.owner_approval, null);
  const expected = ['README.md', 'pins.json', 'capture.mjs', 'inspect.mjs', 'inspect.test.mjs', 'source-observation.json', 'candidate.json', 'report.json'];
  assert.deepEqual(manifest.files.map(x => x.path).sort(), expected.sort());
  for (const file of manifest.files) {
    assert.ok(!file.path.includes('/') && !file.path.includes('..'));
    const bytes = await safeRead(resolve(here, file.path));
    assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha256(bytes), file.sha256, file.path);
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'read-only inspector has no write/activation flags');
  await verifyBundle();
  const result = inspectObservation(await loadPinned(), await readJSON(resolve(here, 'source-observation.json')));
  for (const name of ['candidate', 'report']) assert.deepEqual(result[name], await readJSON(resolve(here, `${name}.json`)));
  console.log(JSON.stringify(result.report, null, 2));
}
