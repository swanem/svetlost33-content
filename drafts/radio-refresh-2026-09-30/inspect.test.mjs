import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPinned, inspectObservation, sha256, verifyBundle } from './inspect.mjs';
import { captureRadio, CAPTURE_LIMITS } from './capture.mjs';
import { sourceURL } from '../../scripts/radio-monitor-core-v2.mjs';
const inputs = await loadPinned();
const observation = JSON.parse(await readFile(new URL('./source-observation.json', import.meta.url), 'utf8'));
const rehash = o => { o.rows_sha256 = sha256(Buffer.from(`${JSON.stringify(o.rows)}\n`)); return o; };
const run = o => inspectObservation(inputs, o);

test('exact snapshot: 304 rows, 273 unchanged and 31 new, only 30 new rows range-valid', () => {
  const { candidate, report } = run(observation);
  assert.equal(observation.source.response_bytes, 158093);
  assert.equal(observation.source.response_sha256, '0f2cd640a2273771a7f0871070e4b51a4a84c3e67ba5c606864c81c0b870b71f');
  assert.deepEqual(report.counts, { previous_radio_rows: 273, observed_radio_rows: 304, unchanged_radio_rows: 273,
    added_rows: 31, valid_added_rows: 30, errored_added_rows: 1, changed_rows: 0, valid_changed_rows: 0, errored_changed_rows: 0,
    removed_rows: 0, valid_observed_rows: 302, no_reference_rows: 0, errored_observed_rows: 2, validation_errors: 2,
    supplemental_blessing_rows: 42, existing_identity_review_dates: 8, prior_gospel_unresolved: 192,
    resolved_calendar_gaps: 0, calendar_dates_changed: 0 });
  assert.deepEqual(report.observed_window, { first: '2026-01-01', last: '2026-10-31' });
  assert.equal(report.radio_rows_still_missing.length, 61);
  assert.equal(candidate.valid_added[0].date, '2026-10-01'); assert.equal(candidate.valid_added.at(-1).date, '2026-10-31');
  assert.deepEqual(report.pinned_annual_gospel_projection.status_counts, { SOURCE_RECORDED: 173, UNRESOLVED: 192 });
  assert.equal(report.pinned_annual_gospel_projection.original_radio_rows_unresolved, 100);
  assert.equal(report.new_or_changed_date_reviews.length, 31);
  for (const day of report.new_or_changed_date_reviews) {
    assert.equal(day.pinned_annual_status, 'UNRESOLVED');
    assert.equal(day.pinned_annual_reason, 'source_content_not_entered_or_missing');
    assert.equal(day.proposed_runtime_change, false);
  }
  assert.deepEqual(run(observation), run(observation));
});
test('both exact bad references survive unchanged and no part of an errored row is promoted', () => {
  const { candidate, report } = run(observation);
  assert.deepEqual(report.errors.map(x => [x.date, x.code, x.raw_reference]), [
    ['2026-04-09', 'invalid_verse_endpoint', 'Јеванђеље по Луки, зачало 109. 19,39-71'],
    ['2026-10-16', 'invalid_or_reversed_range', 'Јеванђеље по Луки, зачало 32. 7,31-25'],
  ]);
  const bad = candidate.errored_observations.find(x => x.date === '2026-10-16');
  assert.equal(bad.references.length, 2); assert.equal(bad.validation_errors.length, 1);
  assert.ok(!candidate.valid_added.some(x => x.date === bad.date));
  assert.equal(candidate.errored_observations[0].change, 'UNCHANGED_RADIO_FACTS');
  assert.equal(report.monitor_last_good_state_advanced, false); assert.equal(report.monitor_validation_failed, true);
});
test('candidate remains radio-only: no automatic service, approval, gap resolution or activation', () => {
  const { candidate, report } = run(observation);
  assert.equal(candidate.status, 'radio_only_not_liturgical_assignment');
  assert.equal(candidate.publication_authorized, false); assert.equal(candidate.release_allowed, false);
  assert.equal(candidate.owner_approval, null); assert.equal(candidate.clerical_review, null);
  for (const row of [...candidate.valid_added, ...candidate.errored_observations]) {
    assert.equal(row.service_assignment_status, 'UNRESOLVED'); assert.equal(row.production_eligible, false);
    assert.equal(row.review_status, 'PENDING');
  }
  assert.equal(report.prior_identity_reviews_preserved_not_resolved.length, 8);
});
test('all input calendar, fasting and source observations remain unchanged', () => {
  const a = structuredClone(inputs), b = structuredClone(observation);
  run(observation); assert.deepEqual(inputs, a); assert.deepEqual(observation, b);
});
test('source byte metadata, authority flags, response status and observation digest fail closed', () => {
  const mutations = [
    x => { x.owner_approval = 'invented'; }, x => { x.publication_authorized = true; },
    x => { x.status = 'SOURCE_RECORDED'; }, x => { x.source.http_status = 304; },
    x => { x.source.requested_url = 'https://example.org/'; }, x => { x.source.effective_url += '&other=1'; },
    x => { x.source.content_type = 'application/json'; }, x => { x.source.content_type = 'text/html; charset=windows-1251'; },
    x => { x.source.response_sha256 = 'bad'; }, x => { x.source.response_bytes = 5_000_001; },
    x => { x.source.response_body_retained = true; }, x => { x.rows_sha256 = '0'.repeat(64); },
    x => { x.source.checked_at = '2026-09-30T12:00:00Z'; }, x => { x.year = 2027; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(observation); mutate(bad); assert.throws(() => run(bad)); }
});
test('replay rejects duplicate/impossible dates, dropped errors, fabricated validation and rows out of order', () => {
  const mutations = [
    x => { x.rows.push(x.rows[0]); }, x => { x.rows[0].date = '2026-02-30'; },
    x => { x.rows.find(r => r.date === '2026-04-09').validation_errors = []; },
    x => { x.rows[0].validation_errors = [{ code: 'invented' }]; },
    x => { x.rows.reverse(); }, x => { x.rows[0].supplemental_blessing = true; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(observation); mutate(bad); assert.throws(() => run(rehash(bad))); }
});
test('valid changes and removals are distinguished from additions without authorizing deletes', () => {
  const changed = structuredClone(observation);
  changed.rows[0].references = ['Јеванђеље по Марку, зачало 39. 9,10-17'];
  changed.rows = changed.rows.filter(x => x.date !== '2026-01-02');
  const { candidate, report } = run(rehash(changed));
  assert.equal(report.counts.changed_rows, 1); assert.equal(report.counts.valid_changed_rows, 1);
  assert.equal(report.counts.removed_rows, 1); assert.equal(report.counts.added_rows, 31);
  assert.equal(candidate.valid_changed[0].before.references[0], 'Јеванђеље по Марку, зачало 39. 9,10-16');
  assert.equal(candidate.removed_observations[0].date, '2026-01-02');
  assert.equal(candidate.release_allowed, false);
});
test('a present but empty source row is retained separately, never counted as valid new references', () => {
  const empty = structuredClone(observation), row = empty.rows.find(x => x.date === '2026-10-01');
  row.references = []; row.notes = [];
  const { candidate, report } = run(rehash(empty));
  assert.equal(report.counts.valid_added_rows, 29); assert.equal(report.counts.no_reference_rows, 1);
  assert.equal(candidate.no_reference_observations[0].date, '2026-10-01');
  assert.equal(candidate.no_reference_observations[0].reference_status, 'NO_REFERENCE_NOT_ASSIGNMENT');
  assert.ok(!report.new_valid_dates.includes('2026-10-01'));
  assert.equal(report.new_or_changed_date_reviews[0].source_reference_status, 'NO_REFERENCE_NOT_ASSIGNMENT');
});

const goodHtml = '<h1>Тумачења Јеванђеља за 2026. годину</h1><tr id="Datum20261001"><td>day</td><td>date</td><td>Јеванђеље по Луки, зачало 13. 4,16-22</td></tr>';
function fakeResponse({ body = Buffer.from(goodHtml), status = 200, url = sourceURL(2026), redirected = false,
  type = 'text/html; charset=UTF-8', length = null } = {}) {
  return { status, url, redirected, headers: new Headers({ 'content-type': type, ...(length === null ? {} : { 'content-length': length }) }),
    body: new ReadableStream({ start(controller) { controller.enqueue(body); controller.close(); } }) };
}
test('bounded capture uses explicit one GET and hashes exact raw bytes, stores no HTML', async () => {
  let called = 0;
  const captured = await captureRadio({ corpus: inputs.corpus, fetchImpl: async (url, options) => {
    called++; assert.equal(url, sourceURL(2026)); assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
    return fakeResponse();
  } });
  assert.equal(called, 1); assert.equal(captured.rows.length, 1);
  assert.equal(captured.source.response_sha256, sha256(Buffer.from(goodHtml)));
  assert.equal(captured.source.response_body_retained, false); assert.equal('html' in captured, false);
  assert.equal(captured.publication_authorized, false);
});
test('capture rejects redirects, bad status/content/UTF8, over-limit bytes and wrong year', async () => {
  for (const options of [{ status: 302 }, { redirected: true }, { url: 'https://example.org/' },
    { type: 'application/json' }, { type: 'text/html; charset=windows-1251' }, { length: '5000001' },
    { body: Buffer.alloc(5_000_001) }, { body: Buffer.from([255]) }, { body: Buffer.from(goodHtml.replace('2026. годину', '2027. годину')) }]) {
    await assert.rejects(captureRadio({ corpus: inputs.corpus, fetchImpl: async () => fakeResponse(options) }));
  }
  await assert.rejects(captureRadio({ corpus: inputs.corpus }));
  await assert.rejects(captureRadio({ corpus: inputs.corpus, fetchImpl: async () => fakeResponse(), timeoutMs: CAPTURE_LIMITS.milliseconds + 1 }));
});
test('capture deadline rejects a non-cooperative fetch without advancing or writing state', async () => {
  await assert.rejects(captureRadio({ corpus: inputs.corpus, timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /capture_deadline/u);
});
test('frozen candidate/report and artifact manifest exactly reproduce from source facts', async () => {
  await verifyBundle(); const result = run(observation);
  for (const name of ['candidate', 'report']) assert.deepEqual(result[name], JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), 'utf8')));
});
