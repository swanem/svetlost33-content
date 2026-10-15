import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArchiveCandidate } from '../scripts/prepare-calendar-browser-archive-candidate.mjs';
import { buildCalendarBrowserFixtures } from '../scripts/generate-calendar-browser-fixtures.mjs';
import { evaluateCalendarBrowser, validateCalendarBrowserPayload } from '../scripts/validate-calendar-browser-v1.mjs';

function request() {
  const fixture = buildCalendarBrowserFixtures(), source = structuredClone(fixture.context.archiveContexts[0]);
  const slots = source.cycles.days[0].slots;
  source.cycles.days = Array.from({ length: 7 }, (_, index) => ({ id: `test-cycle-day-${index + 1}`, cycle_day: index + 1, slots: slots.map(slot => ({ ...slot, id: `${slot.id}-${index + 1}` })) }));
  return { version: '2030.1.0', revision: 1, calendar_profile_id: fixture.payload.calendar_profile_id,
    archive_start_date: '2030-01-07', archive_end_date: '2030-01-14', publication_evidence_id: 'test-only-evidence-not-publication',
    archive_binding: fixture.payload.archive_bindings[0], source_context: source };
}

test('candidate planner is deterministic, explicit-range and pending; it never claims publication', () => {
  const input = request(), before = structuredClone(input), candidate = prepareArchiveCandidate(input);
  assert.deepEqual(input, before); assert.deepEqual(prepareArchiveCandidate(input), candidate);
  assert.equal(candidate.purpose, 'UNREVIEWED_ARCHIVE_CANDIDATE_NOT_PUBLICATION_HISTORY');
  assert.equal(candidate.source_authentication, 'CALLER_MUST_INDEPENDENTLY_VERIFY_SOURCE_CONTEXT');
  assert.equal(candidate.payload.approval_id, null); assert.equal(candidate.payload.review_status, 'pending');
  assert.deepEqual(evaluateCalendarBrowser(candidate.payload), { eligible: false, reason: 'unapproved' });
  assert.deepEqual(validateCalendarBrowserPayload(candidate.payload), { valid: true, reason: null });
  assert.equal(candidate.payload.archive_days.length, 8);
  assert.equal(candidate.payload.archive_days[0].date, '2030-01-07');
  assert.equal(candidate.payload.archive_days.at(-1).date, '2030-01-14');
  assert.equal(candidate.payload.archive_days[0].phases[0].cycle_day_id, 'test-cycle-day-1');
  assert.equal(candidate.payload.archive_days[6].phases[0].cycle_day_id, 'test-cycle-day-7');
  assert.equal(candidate.payload.archive_days[7].phases[0].cycle_day_id, 'test-cycle-day-1');
  assert.deepEqual(candidate.payload.feast_memberships, []);
});

test('candidate planner rejects inferred ranges, absent evidence, unapproved or mismatched inputs', () => {
  for (const change of [
    input => { delete input.archive_start_date; }, input => { delete input.publication_evidence_id; },
    input => { input.archive_start_date = '2030-02-29'; }, input => { input.archive_end_date = '2029-01-01'; },
    input => { input.archive_end_date = '2039-01-01'; }, input => { input.source_context.authenticated = 'true'; },
    input => { input.source_context.review_status = 'pending'; }, input => { input.source_context.library.manifest_sha256 = '0'.repeat(64); },
    input => { input.source_context.cycles.days.pop(); }, input => { input.source_context.cycles.days[0].slots.pop(); },
    input => { input.source_context.library.psalms = []; }, input => { input.archive_binding.policy_id = 'future-policy'; }
  ]) { const input = request(); change(input); assert.throws(() => prepareArchiveCandidate(input)); }
});

test('candidate date generation handles year and leap-day boundaries without a clock', () => {
  for (const [start, end, expected] of [
    ['0099-12-31', '0100-01-01', ['0099-12-31', '0100-01-01']],
    ['2032-02-28', '2032-03-01', ['2032-02-28', '2032-02-29', '2032-03-01']],
    ['9999-12-31', '9999-12-31', ['9999-12-31']]
  ]) { const input = request(); input.archive_start_date = start; input.archive_end_date = end; assert.deepEqual(prepareArchiveCandidate(input).payload.archive_days.map(day => day.date), expected); }
});
