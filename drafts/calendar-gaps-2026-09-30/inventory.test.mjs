import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { inventory } from './inventory.mjs';

test('S10 work queue is exact, deduplicated, prospective-first and does not mark anything resolved', async () => {
  const result = await inventory();
  assert.equal(new Set(result.entries.map(entry => entry.date)).size, result.entries.length);
  assert.equal(result.changed_calendar_dates, 0);
  assert.equal(result.summary.resolved_this_run, 0);
  assert(result.priority_dates.every(date => date >= '2026-09-30' && date <= '2026-12-31'));
  assert(result.summary.unique_unresolved_dates < 192 + 91 + 5);
  assert.deepEqual(result, JSON.parse(await readFile(new URL('./inventory.json', import.meta.url))));
});
