import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { prepareCalendarContent, APPROVAL_ID } from '../scripts/prepare-calendar-browser-content-v1.mjs';
import { json, sha256 } from '../scripts/prepare-charity-release-v2.mjs';

const options = { coordinatorReviewed: true, now: '2026-09-27T10:00:00Z' };
let result;
test('reviewed content uses exact authenticated S9 and preserves every prior entity and text binding', async () => {
  result = await prepareCalendarContent(options);
  const entry = result.source.set.modules.find(row => row.module_id === 'liturgical-catalog-v1');
  const old = JSON.parse(result.source.files.get(`${dirname(entry.manifest_path)}/data/liturgical-catalog-v1.json`));
  for (const key of ['sources', 'subjects', 'observances', 'occurrences'])
    assert.deepEqual(result.catalog[key].slice(0, old[key].length), old[key], key);
  for (const key of ['calendar_profiles', 'calendar_bindings', 'article_bindings', 'article_links', 'legacy_slava_links', 'day_reviews'])
    assert.deepEqual(result.catalog[key], old[key], key);
  assert.equal(result.catalog.observances.length, 27);
  assert.equal(result.catalog.occurrences.length, 25);
  assert.equal(result.browser.feast_memberships.length, 21);
  assert.equal(result.catalog.coverage.find(row => row.year === 2027).status, 'unavailable');
  assert.equal(result.browser.approval_id, APPROVAL_ID);
  assert.equal(result.draft.value.review_status, 'pending');
  assert.equal(result.review.publication_authorized, false);
  assert.equal(result.review.runtime_authenticated, false);
  assert.equal(result.review.publication_receipt, null);
});
test('prospective archive is 94 explicit days and 282 verified phases, not backfilled history', async () => {
  const { browser, plan, review } = result ?? await prepareCalendarContent(options);
  assert.equal(browser.archive_days.length, 94);
  assert.equal(browser.archive_days.reduce((sum, day) => sum + day.phases.length, 0), 282);
  assert.equal(browser.archive_start_date, '2026-09-29');
  assert.equal(browser.archive_days.at(-1).date, '2026-12-31');
  assert.ok(browser.archive_days.every(day => day.status === 'available' && day.correction_id === null));
  assert.deepEqual(browser.archive_days[0].phases.map(phase => phase.cycle_day_id), Array(3).fill('general-day-2'));
  assert.deepEqual(browser.archive_days.at(-1).phases.map(phase => phase.cycle_day_id), Array(3).fill('general-day-4'));
  assert.equal(plan.status, 'PLANNED_NOT_PUBLISHED');
  assert.equal(plan.publication_receipt, null);
  assert.equal(plan.publish_before_utc, '2026-09-28T10:00:00Z');
  assert.equal(plan.archive_days_sha256, sha256(json(browser.archive_days)));
  assert.deepEqual(review.scope.archive_days, browser.archive_days);
  assert.deepEqual(review.prospective_publication_plan.archive_bindings, browser.archive_bindings);
});
test('payload and local review output is deterministic for fixed reviewed inputs and timestamp', async () => {
  const first = result ?? await prepareCalendarContent(options), second = await prepareCalendarContent(options);
  for (const [path, bytes] of first.files) assert.deepEqual(second.files.get(path), bytes, path);
  const catalogRecord = first.review.scope.payloads.find(row => row.module_id === 'liturgical-catalog-v1');
  assert.equal(catalogRecord.sha256, sha256(first.files.get('catalog.json')));
  assert.equal(first.browser.catalog_binding.sha256, catalogRecord.sha256);
});
test('requires coordinator GO and refuses a missed prospective publication deadline', async () => {
  await assert.rejects(prepareCalendarContent({ now: options.now }), /source-review GO/);
  await assert.rejects(prepareCalendarContent({ ...options, now: '2026-09-26T12:00:00Z' }), /cannot predate/);
  await assert.rejects(prepareCalendarContent({ ...options, now: '2026-09-28T10:00:00Z' }), /deadline missed/);
  await assert.rejects(prepareCalendarContent({ ...options, now: '2026-09-30T12:00:00Z' }), /deadline missed/);
});
