#!/usr/bin/env node
// Offline reference-only editorial candidate. No changes to the signed calendar or source text.
import assert from 'node:assert/strict';
import { lstat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { adaptBibleCorpus, adaptCalendarReading, evaluateBibleReference, legacyCalendarLabelMatches } from '../../scripts/validate-bible-reference-v1.mjs';
import { HERE, START, END, dates, dayOffset, urlFor } from './collect.mjs';

export const S13 = 'shared-saints104-2026-10-06-m0v2-s13';
export const SOURCE_ID = 'pravoslavno-rs-daily-readings-2026-10-06';
const S13_ROOT = resolve(ROOT, 'drafts/saints104-release-2026-10-06/signed-s13');
const requestPath = 'approvals/pravoslavno-gospel-2026-10-06/source-intake-request.json';
const requestHash = '1c143c74ae952dc918baaedfb3e9dfa210cc05f5300651bba211268d7e79b133';
const readbackPath = 'approvals/saints104-2026-10-06/public-readback-s13.json';
const readbackHash = 'e6bce373760da88996bf2df0a789ff853eef483e12a9d393608106d149f9c700';
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const unescape = text => text.replace(/&nbsp;/gu, ' ').replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/giu, (_, x, n) => String.fromCodePoint(parseInt(x ?? n, x ? 16 : 10))).replace(/\s+/gu, ' ').trim();
const BOOKS = { 'Матеј': 'Matthew', 'Матеја': 'Matthew', 'Марко': 'Mark', 'Марка': 'Mark', 'Лука': 'Luke', 'Луке': 'Luke', 'Јован': 'John', 'Јована': 'John' };
const SERVICES = new Map([['Јутрење', 'matins'], ['Јутрења', 'matins'], ['Литургија', 'liturgy'], ['Вечерња', 'vespers']]);

export function parseHeading(raw) {
  const text = unescape(raw);
  const match = /^(?:Свето )?Јеванђеље\s+(?:(?:од|по)\s+)?(Матеј|Матеја|Марко|Марка|Лука|Луке|Јован|Јована),\s*зачало\s+([1-9][0-9]*(?:,\s*[1-9][0-9]*)*)\.?\s*\(([^()]+)\)$/u.exec(text);
  assert.ok(match, `Unsupported Gospel heading: ${text}`);
  const segments = []; let chapter = null;
  for (const part of match[3].split(/;\s*/u)) {
    const range = /^(?:([1-9][0-9]*),\s*)?([1-9][0-9]*)(?:[-–](?:([1-9][0-9]*),\s*)?([1-9][0-9]*))?$/u.exec(part.trim());
    assert.ok(range, `Unsupported printed range: ${part}`);
    chapter = range[1] ? Number(range[1]) : chapter;
    assert.ok(chapter, 'First segment must state chapter');
    const endChapter = Number(range[3] ?? chapter);
    segments.push({ start: { chapter, verse: Number(range[2]) }, end: { chapter: endChapter, verse: Number(range[4] ?? range[2]) } });
    chapter = endChapter; // A semicolon verse-only continuation retains its printed current chapter.
  }
  const zachaloNumbers = match[2].split(/,\s*/u).map(Number);
  return { book: BOOKS[match[1]], segments, zachalo: zachaloNumbers[0], zachalo_numbers: zachaloNumbers,
    zachalo_qualifier: '', range_precision: 'VERSE_RANGE_AS_PRINTED', service: 'unspecified', role: 'source_daily_reading',
    source_reference: text, source_ids: [SOURCE_ID] };
}

export function parsePage(html, date) {
  assert.ok(dates.includes(date), 'Outside fixed intake scope');
  const visibleDates = [...html.matchAll(/<div>\s*([0-9]{2})\.([0-9]{2})\.([0-9]{4})\s*<\/div>/gu)].map(m => `${m[3]}-${m[2]}-${m[1]}`);
  assert.deepEqual(visibleDates, [date], 'Exactly one displayed civil date must match requested date');
  const start = html.indexOf('id="glavnitekst"');
  const ends = ['<a name=teofan>', '<div style="clear:both; padding:6px;', '</body>'].map(marker => html.indexOf(marker, start)).filter(index => index > start);
  const end = Math.min(...ends);
  assert.ok(start >= 0 && Number.isFinite(end) && end > start, 'Known bounded reading section required; horizon refusal is not a reading');
  const body = html.slice(start, end), readings = [], evidence = [];
  let service = null;
  for (const element of body.matchAll(/<(b|div|span)\b[^>]*>([^<>]+)<\/\1>/gu)) {
    const text = unescape(element[2]);
    if (SERVICES.has(text)) { service = { source_label: text, normalized_label: SERVICES.get(text) }; continue; }
    if (!/^(?:Свето )?Јеванђеље\s/u.test(text)) continue;
    const reading = parseHeading(text); readings.push(reading);
    evidence.push({ reading_index: readings.length - 1, source_heading: text, explicit_service: service ? { ...service } : null,
      source_locator: { section_id: 'glavnitekst', heading_tag: element[1], gospel_heading_ordinal: readings.length },
      runtime_service: 'unspecified', note: service ? 'Printed service retained as publisher provenance; not promoted to independently confirmed SPC service assignment.' : 'No service label printed for this reading.' });
  }
  assert.ok(readings.length > 0, 'No parsed Gospel reading');
  assert.equal(readings.length, (body.match(/Јеванђеље/gu) ?? []).length, 'Do not silently drop any Gospel heading');
  return { displayed_date: date, readings, evidence };
}

export async function loadBaseline() {
  const pins = [], pinned = async (path, expected) => { const bytes = await readRefreshInput(resolve(ROOT, path)); assert.equal(sha256(bytes), expected, `Pinned input ${path}`); pins.push(record(path, bytes)); return JSON.parse(bytes); };
  const request = await pinned(requestPath, requestHash), readback = await pinned(readbackPath, readbackHash);
  assert.equal(readback.status, 'PASS'); assert.equal(readback.release_set_id, S13); assert.equal(readback.fetched_files, 63); assert.equal(readback.shared_profile_checks, 24);
  const fromGraph = async path => { const expected = readback.files.find(x => x.path === path); assert.ok(expected); const bytes = await readRefreshInput(resolve(S13_ROOT, path)); assert.equal(bytes.length, expected.bytes); assert.equal(sha256(bytes), expected.sha256); pins.push(record(`drafts/saints104-release-2026-10-06/signed-s13/${path}`, bytes)); return JSON.parse(bytes); };
  const index = await fromGraph('index.json'); const set = await fromGraph(index.channels.production.path);
  const modulePayload = async (id, file) => { const entry = set.modules.find(x => x.module_id === id); assert.ok(entry); const manifest = await fromGraph(entry.manifest_path); assert.equal(sha256(json(manifest)), entry.manifest_sha256); assert.ok(manifest.files.some(x => x.path === file)); return fromGraph(`${dirname(entry.manifest_path)}/${file}`); };
  const calendar = await modulePayload('calendar-2026-r1', 'data/calendar.2026.json'), books = [];
  for (const locale of ['sr-Cyrl', 'sr-Latn']) books.push(...adaptBibleCorpus(await modulePayload('library-annual-2026-r1', `data/psalms.${locale}.json`), await modulePayload('library-annual-2026-r1', `data/gospels.${locale}.json`), locale));
  return { request, calendar, context: { generation_id: S13, books }, pins: [...new Map(pins.map(p => [p.path, p])).values()] };
}

export function validateReadings(readings, context) {
  return readings.map(reading => {
    const reference = adaptCalendarReading(reading), locales = {};
    for (const locale of ['sr-Cyrl', 'sr-Latn']) {
      const result = evaluateBibleReference({ locale, reference }, context);
      assert.equal(result.valid, true, `Canonical corpus reference: ${reading.source_reference}: ${result.reason}`);
      // Retain identity/count/labels only. Neither the website's nor local corpus prose is exported here.
      locales[locale] = { label: result.label, attribution: result.attribution, verse_keys: result.verse_keys, source_ids: result.source_ids };
    }
    assert.deepEqual(locales['sr-Cyrl'].verse_keys, locales['sr-Latn'].verse_keys);
    return { reference, locales, existing_legacy_source_label_compatible: legacyCalendarLabelMatches(reading) };
  });
}

export async function prepare() {
  const baseline = await loadBaseline(), acquisitionBytes = await readRefreshInput(resolve(HERE, 'acquisition/manifest.json'));
  const acquisition = JSON.parse(acquisitionBytes); assert.deepEqual(acquisition.window, [START, END]);
  assert.equal(acquisition.stopped_reason, null); assert.equal(acquisition.robots_policies.every(p => p.permitted), true);
  const rows = [], rawPins = [];
  for (const date of dates) {
    const record = acquisition.records.find(r => r.id === date), before = baseline.calendar.days.find(d => d.date === date);
    assert.ok(before); const row = { date, before_gospel: structuredClone(before.gospel), state: 'UNRESOLVED_INTAKE', errors: [] };
    try {
      assert.equal(record?.result?.http_status, 200, 'HTTP200 dated page required');
      assert.equal(record.result.url, urlFor(date)); assert.equal(record.result.effective_url, urlFor(date));
      const raw = await readRefreshInput(resolve(HERE, 'acquisition', record.result.path));
      assert.equal(raw.length, record.result.bytes); assert.equal(sha256(raw), record.result.sha256);
      rawPins.push({ path: `acquisition/${record.result.path}`, bytes: raw.length, sha256: sha256(raw) });
      const page = parsePage(decode(raw), date), validated = validateReadings(page.readings, baseline.context);
      const oldRefs = before.gospel.readings.map(adaptCalendarReading), nextRefs = validated.map(v => v.reference);
      const observedOld = (before.gospel.observed_readings ?? []).map(adaptCalendarReading);
      const same = JSON.stringify(oldRefs) === JSON.stringify(nextRefs);
      const conflict = oldRefs.length > 0 && !same;
      const observedConflict = observedOld.length > 0 && JSON.stringify(observedOld) !== JSON.stringify(nextRefs);
      row.state = conflict || observedConflict ? 'CONFLICT_PRESERVED_FOR_REVIEW' : 'SOURCE_REFERENCE_VALIDATED_PENDING_REVIEW';
      row.comparison = { existing_status: before.gospel.status, previous_reading_count: oldRefs.length,
        kind: conflict || observedConflict ? 'DIFFERENT_EXISTING_REFERENCE_REQUIRES_RECONCILIATION' : same ? 'SAME_REFERENCES' : 'NEW_OBSERVATION_FOR_UNRESOLVED_DATE',
        conflicts_with_existing_readings: conflict, conflicts_with_observed_readings: observedConflict,
        previous_missing_or_disagreement_evidence_retained: true };
      row.source = { source_id: SOURCE_ID, url: record.result.url, displayed_date: page.displayed_date, fetched_at: record.result.fetched_at,
        raw_sha256: record.result.sha256, raw_evidence_path: `acquisition/${record.result.path}`, publisher_attribution: 'Pravoslavno.rs / Pravoslavni podsetnik; © Mikro knjiga' };
      row.source_readings = page.readings; row.reading_provenance = page.evidence; row.canonical_checks = validated;
      row.proposed_gospel = { ...structuredClone(before.gospel), status: 'SOURCE_RECORDED', readings: page.readings,
        reason: 'single_publisher_references_recorded_service_unassigned_pending_review',
        source_ids: [...new Set([...before.gospel.source_ids, SOURCE_ID])], service_assignment_status: 'UNRESOLVED',
        calendar_activation_status: 'DRAFT', complete_service_schedule_verified: false, production_eligible: false,
        source_observations: [...structuredClone(before.gospel.source_observations ?? []), {
          source_id: SOURCE_ID, source_locator: `${record.result.url} #glavnitekst`, references: page.readings.map(r => r.source_reference),
          source_notes: ['Prema Pravoslavno.rs; not Radio Slovo ljubve or independent SPC confirmation. Exact service headings are retained separately in the draft provenance.'],
        }] };
    } catch (error) { row.errors.push(String(error.message)); }
    rows.push(row);
  }
  let lastContiguous = null;
  for (const row of rows) { if (row.state !== 'SOURCE_REFERENCE_VALIDATED_PENDING_REVIEW') break; lastContiguous = row.date; }
  const valid = rows.filter(r => r.source_readings && r.errors.length === 0), conflicts = rows.filter(r => r.state === 'CONFLICT_PRESERVED_FOR_REVIEW');
  const summary = { requested_dates: dates.length, fetched_http200: acquisition.records.filter(r => dates.includes(r.id) && r.result?.http_status === 200).length,
    valid_source_dates: valid.length, candidate_dates_without_reference_conflict: rows.filter(r => r.state === 'SOURCE_REFERENCE_VALIDATED_PENDING_REVIEW').length,
    gospel_readings: valid.reduce((n, r) => n + r.source_readings.length, 0), multi_reading_dates: valid.filter(r => r.source_readings.length > 1).map(r => r.date),
    discontiguous_readings: valid.flatMap(r => r.source_readings.filter(x => x.segments.length > 1).map(x => ({ date: r.date, source_reference: x.source_reference }))),
    explicit_service_readings: valid.flatMap(r => r.reading_provenance.filter(x => x.explicit_service)).length,
    gaps: rows.filter(r => r.errors.length).map(r => ({ date: r.date, errors: r.errors })), conflicts: conflicts.map(r => r.date),
    last_validated_source_date: valid.at(-1)?.date ?? null, last_contiguous_validated_source_date: lastContiguous,
    next_search_local_date: lastContiguous ? dayOffset(lastContiguous, -10) : null, timezone: 'Europe/Belgrade', next_search_local_time: '09:00',
    legacy_source_label_incompatibilities: valid.flatMap(r => r.canonical_checks.filter(x => !x.existing_legacy_source_label_compatible)).length,
    production_calendar_changed: false, signed: false, published: false };
  const candidate = { schema_version: 'svetlost33-pravoslavno-gospel-intake-1', status: 'DRAFT_REFERENCE_OBSERVATIONS_NOT_RELEASE_APPROVED',
    window: [START, END], source_id: SOURCE_ID, display_attribution: { 'sr-Cyrl': 'Према Pravoslavno.rs', 'sr-Latn': 'Prema Pravoslavno.rs' },
    source_selection: 'User-authorized publisher source; not asserted official SPC schedule or Radio Slovo ljubve.',
    text_policy: 'References only; source translation/commentary retained only as private research HTML. Verse rendering must reuse the exact approved S13 Vuk/eBible corpus.',
    scope_excludes: ['production import/signing/publication', 'native changes', 'A/B', '2027', 'fasting', 'saints104', 'existing archive assignments'],
    approval: { path: requestPath, sha256: requestHash, authorizes_intake_only: true }, baseline: { release_set_id: S13, pins: baseline.pins },
    summary, rows };
  const delta = { schema_version: 'svetlost33-pravoslavno-gospel-delta-1', status: 'REVIEW_ONLY_NO_CALENDAR_BYTES_REPLACED', summary,
    daily_operations: rows.map(r => ({ date: r.date, state: r.state, before_gospel_sha256: sha256(json(r.before_gospel)),
      proposed_gospel_sha256: r.proposed_gospel ? sha256(json(r.proposed_gospel)) : null, comparison: r.comparison ?? null, errors: r.errors })),
    remaining_gates: ['Independent date/reference/provenance review', 'Existing shared legacy source_reference grammar rejects Pravoslavno headings; explicit source-label adapter compatibility must be reviewed before any annual release assembly',
      'Exact approved-calendar content revision and binding regeneration only after review; do not mutate S13', 'Both native source-label/reader acceptance and separately authorized production signing/publication'],
    no_new_rights_grant: true, no_clerical_endorsement: true };
  return { candidate, delta, baseline, acquisition, inputPins: [...baseline.pins, record('acquisition/manifest.json', acquisitionBytes), ...rawPins],
    files: new Map([['candidate.json', json(candidate)], ['delta.json', json(delta)]]) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]; assert.ok(process.argv.length === 3 && ['--write', '--refresh-before-handoff'].includes(mode));
  const p = await prepare();
  if (mode === '--write') await writeNewTree(resolve(HERE, 'review'), p.files);
  else {
    assert.equal(await lstat(resolve(HERE, 'handoff.json')).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; }), false, 'Frozen handoff cannot be refreshed');
    for (const [path, bytes] of p.files) await writeFile(resolve(HERE, 'review', path), bytes);
  }
  console.log(JSON.stringify(p.candidate.summary, null, 2));
}
