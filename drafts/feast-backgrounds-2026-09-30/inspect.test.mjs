import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { inspectSource, safeRelativePath } from './inspect.mjs';

test('all 14 original PNGs decode with exact source hashes and no runtime date rules', async () => {
  const value = await inspectSource();
  assert.equal(value.items.length, 7);
  assert.equal(value.production_release, false);
  assert.deepEqual(value.approved_platforms, []);
  assert(value.items.every(item => item.calendar_binding === null && !item.auto_rotation));
  assert(value.items.every(item => item.variants.clean.sha256 !== item.variants.named.sha256));
  assert.equal(value.items.find(item => item.source_id === 'bogojavljenje').variants.clean.width, 793);
  assert.equal(value.clean_original_bytes, 17_414_965);
  assert.deepEqual(value, JSON.parse(await readFile(new URL('./candidate.json', import.meta.url))));
});

test('reject unsafe relative paths before reading any file', () => {
  for (const value of ['../secret', '/tmp/file', 'a/../b', 'a//b', 'a\\b', '', 'a/'.repeat(81)]) {
    assert.throws(() => safeRelativePath(value), value);
  }
  assert.equal(safeRelativePath('bez-teksta/01-pokrov.png'), 'bez-teksta/01-pokrov.png');
});
