// Read-only, hash-bound work queue. Does not fill, approve or publish calendar gaps.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const ROOT = resolve(import.meta.dirname, '../..');
const PROD = resolve(ROOT, 'releases/v2/production');
const RELEASE = 'shared-calendar-browser-2026-09-27-m0v2-s10';
const hash = value => createHash('sha256').update(value).digest('hex');

export async function inventory() {
  const releaseBytes = await readFile(resolve(PROD, `releases/${RELEASE}/release-set.json`));
  const release = JSON.parse(releaseBytes);
  assert.equal(release.sequence, 10);
  const entry = release.modules.find(value => value.module_id === 'calendar-2026-r1');
  assert.equal(entry.manifest_sha256, '11e5d8b92ebbacd40ae6d0bad861c85a2df8220cd0b1091a2b7522754d538905');
  const manifestBytes = await readFile(resolve(PROD, entry.manifest_path));
  assert.equal(hash(manifestBytes), entry.manifest_sha256);
  const manifest = JSON.parse(manifestBytes);
  const record = manifest.files.find(file => file.path === 'data/calendar.2026.json');
  const calendarBytes = await readFile(resolve(PROD, dirname(entry.manifest_path), record.path));
  assert.equal(hash(calendarBytes), record.sha256);
  assert.equal(calendarBytes.length, record.bytes);
  const calendar = JSON.parse(calendarBytes);
  assert.equal(calendar.days.length, 365);
  const entries = calendar.days.flatMap(day => {
    const unresolved = [];
    if (day.gospel.status === 'UNRESOLVED') unresolved.push('gospel');
    if (day.fasting.rule === 'UNKNOWN') unresolved.push('fasting_rule');
    if (day.fasting.status === 'UNKNOWN') unresolved.push('fasting_status');
    return unresolved.length ? [{ date: day.date, unresolved,
      gospel_reason: day.gospel.status === 'UNRESOLVED' ? day.gospel.reason : null,
      fasting_reason: unresolved.some(value => value.startsWith('fasting')) ? day.fasting.review : null,
      state: 'needs_source_review' }] : [];
  });
  const count = kind => entries.filter(entry => entry.unresolved.includes(kind)).length;
  const priority = entries.filter(entry => entry.date >= '2026-09-30');
  assert.equal(count('gospel'), 192);
  assert.equal(count('fasting_rule'), 91);
  assert.equal(count('fasting_status'), 5);
  return {
    schema_version: 'svetlost33-calendar-gap-inventory-1', created_on: '2026-09-30',
    status: 'editorial_work_queue_only', changed_calendar_dates: 0,
    source: { release_set_id: RELEASE, release_set_sha256: hash(releaseBytes),
      calendar_manifest_sha256: hash(manifestBytes), calendar_payload_sha256: hash(calendarBytes),
      calendar_path: `${dirname(entry.manifest_path)}/${record.path}` },
    summary: { gospel_unresolved: count('gospel'), fasting_rule_unknown: count('fasting_rule'),
      fasting_status_unknown: count('fasting_status'), unique_unresolved_dates: entries.length,
      priority_unique_dates: priority.length, priority_from: '2026-09-30', priority_to: '2026-12-31',
      resolved_this_run: 0 },
    priority_dates: priority.map(entry => entry.date),
    entries,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(await inventory(), null, 2)}\n`);
}
