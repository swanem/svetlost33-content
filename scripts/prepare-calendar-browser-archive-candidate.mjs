#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validDate } from './validate-saints-v1.mjs';
import { ARCHIVE_PHASES, civilDayOrdinal, validateCalendarBrowserPayload } from './validate-calendar-browser-v1.mjs';

const exact = (binding, context) => context && ['module_id', 'version', 'revision', 'manifest_sha256'].every(key => binding[key] === context[key]);
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value);
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function nextDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  for (const [y, m, d] of [[year, month, day + 1], [year, month + 1, 1], [year + 1, 1, 1]]) {
    const candidate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (validDate(candidate)) return candidate;
  }
  throw new Error('Date range exceeds Gregorian bounds');
}
const fail = () => { throw new Error('Candidate inputs are incomplete or do not match exact approved source context'); };

/**
 * Pure proposal function. source_context is supplied by an independently verified
 * host, not authenticated by this function or by a JSON authenticated=true claim.
 * A request file and this output are NEVER publication evidence or runtime input.
 */
export function prepareArchiveCandidate(request) {
  if (!request || typeof request !== 'object') fail();
  const { version, revision, calendar_profile_id, archive_start_date, archive_end_date, publication_evidence_id, archive_binding: binding, source_context: source } = request;
  if (!id(publication_evidence_id) || !validDate(archive_start_date) || !validDate(archive_end_date) || archive_end_date < archive_start_date
      || civilDayOrdinal(archive_end_date) - civilDayOrdinal(archive_start_date) >= 1464) fail();
  if (!binding || binding.policy_id !== 'calendar-week-v1' || binding.policy_version !== 1 || !source || source.authenticated !== true
      || source.review_status !== 'approved' || source.binding_id !== binding.id || !exact(binding.library_binding, source.library) || !exact(binding.cycles_binding, source.cycles)) fail();
  if (!source.generation || !id(source.generation.id) || !Number.isSafeInteger(source.generation.sequence) || source.generation.sequence < 1 || !sha(source.generation.decision_sha256)) fail();
  if (!Array.isArray(source.cycles.days) || source.cycles.days.length !== 7 || !Array.isArray(source.library.psalms) || !Array.isArray(source.library.prayer_ids)) fail();
  const phasesByDay = new Map();
  for (const day of source.cycles.days) {
    if (!day || !Number.isInteger(day.cycle_day) || day.cycle_day < 1 || day.cycle_day > 7 || phasesByDay.has(day.cycle_day)
        || !Array.isArray(day.slots) || day.slots.length !== 3) fail();
    const phases = ARCHIVE_PHASES.map(phase => {
      const slots = day.slots.filter(slot => slot?.phase === phase);
      if (slots.length !== 1) fail();
      const slot = slots[0], psalms = source.library.psalms.filter(psalm => psalm?.id === slot.psalm_id);
      if (psalms.length !== 1 || !Array.isArray(psalms[0].verse_numbers) || !Array.isArray(slot.verse_numbers)
          || !slot.verse_numbers.every(number => psalms[0].verse_numbers.includes(number))
          || source.library.prayer_ids.filter(id => id === slot.prayer_id).length !== 1) fail();
      return { phase, cycle_day_id: day.id, slot_id: slot.id, psalm_id: slot.psalm_id, verse_numbers: [...slot.verse_numbers], prayer_id: slot.prayer_id };
    });
    phasesByDay.set(day.cycle_day, phases);
  }
  const archive_days = [];
  for (let date = archive_start_date; ; date = nextDate(date)) {
    archive_days.push({ date, binding_id: binding.id, status: 'available', correction_id: null, phases: structuredClone(phasesByDay.get((civilDayOrdinal(date) - 1) % 7 + 1)) });
    if (date === archive_end_date) break;
  }
  const payload = { schema_version: 'svetlost33-calendar-browser-1', version, revision, review_status: 'pending', approval_id: null,
    calendar_profile_id, catalog_binding: null, feast_memberships: [], archive_start_date, archive_bindings: [structuredClone(binding)], archive_days };
  if (!validateCalendarBrowserPayload(payload).valid) fail();
  return { purpose: 'UNREVIEWED_ARCHIVE_CANDIDATE_NOT_PUBLICATION_HISTORY',
    source_authentication: 'CALLER_MUST_INDEPENDENTLY_VERIFY_SOURCE_CONTEXT', publication_evidence_id,
    source_generation: structuredClone(source.generation),
    required_review: ['Verify exact approved library/cycle manifest bytes through M0.', 'Review publication evidence for every proposed date/phase and the explicit archive start.', 'Approve a concrete module version/revision separately before any signing or publishing.'], payload };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: prepare-calendar-browser-archive-candidate.mjs <proposal-request.json> (stdout only; does not authenticate source JSON)');
  console.log(JSON.stringify(prepareArchiveCandidate(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
}
