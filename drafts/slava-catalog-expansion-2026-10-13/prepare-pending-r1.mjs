// Read-only preparation: validates an unsigned editorial draft and emits it to stdout.
// Does not write files, approve content, change source modules or publish anything.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateCatalogPayload, evaluateCatalog } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { toLatin } from '../../scripts/validate-saints-v1.mjs';

const d = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(f));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const audit = read(path.join(d, 'request-and-gap-audit.json'));
const review = read(path.join(d, 'source-review-r1.json'));
const catalogPath = path.resolve(d, audit.baseline.catalog_path);
const calendarPath = path.resolve(d, audit.baseline.calendar_path);
assert.equal(hash(fs.readFileSync(catalogPath)), audit.baseline.catalog_sha256);
assert.equal(hash(fs.readFileSync(calendarPath)), audit.baseline.calendar_sha256);
const original = read(catalogPath);
const calendar = read(calendarPath);
const candidate = structuredClone(original);
candidate.version = '2026.10.13-slava-draft-r1';
candidate.revision = original.revision + 1;
candidate.review_status = 'pending';
candidate.approval_id = null;

const groupIds = new Set(['obs-forty-martyrs-sebaste', 'obs-vidovdan-lazar-serbian-martyrs', 'obs-cosmas-damian-rome', 'obs-joachim-anna']);
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const aliases = rows => rows.flatMap(row => ['sr-Cyrl', 'sr-Latn'].map(locale => ({ text: row[locale], locale, kind: 'popular', source_ids: row.source_ids })));
const proposals = [...review.proposed_new_observances, ...review.proposed_existing_date_additions];
const sourceIds = new Set(proposals.flatMap(row => row.source_ids));
for (const row of review.proposed_new_observances) {
  for (const alias of row.aliases) for (const id of alias.source_ids) sourceIds.add(id);
}
const labels = {
  'spc-stephen-2026-01-09': ['Свети првомученик Стефан, 9. јануар 2026.', 'Српска православна црква'],
  'nyc-luke-october-2026': ['Распоред богослужења, октобар 2026.', 'Храм Светог Саве у Њујорку'],
  'nyc-stefan-decanski-2026': ['Свети краљ Стефан Дечански, Мратиндан', 'Храм Светог Саве у Њујорку'],
  'nyc-nektarios-feast': ['Свети Нектарије Егински, календарски спомен', 'Храм Светог Саве у Њујорку'],
  'zurich-nektarios-2026': ['Свети Нектарије Егински, распоред службе за 2026.', 'Храм Свете Тројице у Цириху'],
  'spc-cosmas-damian-roman-identity': ['Свети мученици и бесребреници Козма и Дамјан', 'Српска православна црква'],
  'eparhija-bn-lucindan-2015': ['Лучиндан у Жупском манастиру', 'Епархија будимљанско-никшићка']
};
for (const id of sourceIds) {
  if (candidate.sources.some(item => item.id === id)) continue;
  const annual = review.annual_evidence.find(item => item.id === id);
  if (annual) {
    const originalSource = calendar.sources.find(item => item.id === id);
    assert(originalSource && originalSource.evidence_sha256 === annual.sha256);
    const evidencePath = path.resolve(d, '../../../svetlost33-github', annual.evidence_path);
    assert.equal(hash(fs.readFileSync(evidencePath)), annual.sha256);
    candidate.sources.push({ id, title: `Календар за 2026, месец ${id.slice(-2)}`, url: annual.url, publisher: 'Епархија аустријска', original_author: null, checked_on: '2026-10-13', review_status: 'pending', rights_status: 'pending' });
    continue;
  }
  const source = review.primary_sources.find(item => item.id === id);
  assert(source && source.status === 'opened_primary_page', `Missing opened source ${id}`);
  assert(labels[id]);
  candidate.sources.push({ id, title: labels[id][0], url: source.url, publisher: labels[id][1], original_author: null, checked_on: '2026-10-13', review_status: 'pending', rights_status: 'pending' });
}

for (const row of review.proposed_new_observances) {
  assert(!original.observances.some(item => item.id === row.proposed_id));
  assert.deepEqual(row.name, localized(row.name['sr-Cyrl']));
  const group = groupIds.has(row.proposed_id);
  const subjectId = row.proposed_subject?.id ?? row.proposed_id.replace(/^obs-/, group ? 'group-' : 'saint-');
  assert(!candidate.subjects.some(item => item.id === subjectId));
  candidate.subjects.push({ id: subjectId, type: group ? 'group' : 'saint', name: row.name, aliases: [], source_ids: row.source_ids, review_status: 'pending' });
  candidate.observances.push({ id: row.proposed_id, kind: group ? 'group_commemoration' : 'saint_commemoration', name: row.name, description: localized(group ? 'Заједнички спомен светитеља' : 'Спомен светитеља'), subject_ids: [subjectId], aliases: aliases(row.aliases), source_ids: row.source_ids, review_status: 'pending' });
}
for (const row of review.proposed_existing_date_additions) {
  const observance = candidate.observances.find(item => item.id === row.observance_id);
  assert(observance);
  observance.description = localized('Спомен светитеља');
  observance.aliases.push(...aliases(row.aliases_to_propose));
  observance.source_ids = [...new Set([...observance.source_ids, ...row.source_ids])];
  observance.review_status = 'pending';
}
const binding = candidate.calendar_bindings.find(item => item.year === 2026);
assert.equal(binding.sha256, audit.baseline.calendar_sha256);
for (const row of proposals) {
  const day = calendar.days.find(item => item.date === row.date_2026);
  assert(day?.commemoration.status === 'SOURCE_RECORDED');
  const observanceId = row.proposed_id ?? row.observance_id;
  candidate.occurrences.push({ id: `occ-${observanceId}-2026`, observance_id: observanceId, calendar_binding_id: binding.id, date: day.date, julian_date: day.julian_date, calendar_title: localized(day.commemoration.title_cyrl), calendar_source_ids: day.commemoration.source_ids, source_ids: row.source_ids, review_status: 'pending' });
}
const occurrences = candidate.occurrences.filter(item => item.calendar_binding_id === binding.id);
const coverage = candidate.coverage.find(item => item.calendar_binding_id === binding.id);
coverage.occurrences = occurrences.length;
coverage.mapped_dates = new Set(occurrences.map(item => item.date)).size;
assert.deepEqual(validateCatalogPayload(candidate), { valid: true, reason: null });
assert.deepEqual(evaluateCatalog(candidate), { eligible: false, reason: 'unapproved' });

const changedExisting = review.proposed_existing_date_additions.map(item => item.observance_id);
for (const key of ['subjects', 'sources', 'occurrences']) {
  for (const item of original[key]) assert.deepEqual(candidate[key].find(value => value.id === item.id), item);
}
for (const item of original.observances) {
  if (!changedExisting.includes(item.id)) assert.deepEqual(candidate.observances.find(value => value.id === item.id), item);
}
for (const id of changedExisting) {
  const before = original.observances.find(item => item.id === id);
  const after = candidate.observances.find(item => item.id === id);
  for (const key of ['id', 'kind', 'name', 'subject_ids']) assert.deepEqual(before[key], after[key]);
}
for (const key of ['calendar_profiles', 'calendar_bindings', 'article_bindings', 'article_links', 'legacy_slava_links', 'day_reviews']) assert.deepEqual(candidate[key], original[key]);
assert.deepEqual(candidate.coverage.filter(item => item.year !== 2026), original.coverage.filter(item => item.year !== 2026));
for (const item of candidate.occurrences.slice(original.occurrences.length)) {
  const day = calendar.days.find(value => value.date === item.date);
  assert.equal(item.julian_date, day.julian_date);
  assert.equal(item.calendar_title['sr-Cyrl'], day.commemoration.title_cyrl);
  assert.deepEqual(item.calendar_source_ids, day.commemoration.source_ids);
}
const payload = JSON.stringify(candidate, null, 2) + '\n';
const report = {
  schema_version: 1, checked_on: '2026-10-13', status: 'PASS',
  scope: 'Local pending content candidate validation only; no native build, authenticated activation, signing or publication',
  candidate_file: 'liturgical-catalog-v1.pending-r1.json', candidate_sha256: hash(payload), candidate_bytes: Buffer.byteLength(payload),
  baseline_catalog_sha256: audit.baseline.catalog_sha256, baseline_calendar_sha256: audit.baseline.calendar_sha256,
  before: { subjects: original.subjects.length, observances: original.observances.length, occurrences: original.occurrences.length, sources: original.sources.length },
  after: { subjects: candidate.subjects.length, observances: candidate.observances.length, occurrences: candidate.occurrences.length, sources: candidate.sources.length },
  changed_existing_observances: changedExisting, new_observances: review.proposed_new_observances.map(item => item.proposed_id),
  checks: {
    catalog_schema_and_structure: 'PASS', cyrillic_latin_parity: 'PASS', unique_ids_and_references: 'PASS',
    existing_subjects_sources_occurrences_unchanged: 'PASS', unaffected_existing_observances_unchanged: 'PASS',
    existing_identity_names_and_subjects_preserved: 'PASS', annual_date_title_and_source_bindings: 'PASS',
    articles_and_legacy_links_unchanged: 'PASS', coverage_2027_unchanged_unavailable: 'PASS', runtime_rejects_pending_candidate: 'PASS'
  },
  runtime: { eligible: false, reason: 'unapproved' }, editorial_approval: null, published: false
};
console.log(JSON.stringify(process.argv.includes('--emit') ? { payload, report } : report));
