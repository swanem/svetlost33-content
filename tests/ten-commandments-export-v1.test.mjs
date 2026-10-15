import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { INPUTS, OUTPUT, LABELS, readInputs, projectTenCommandments, serializeTenCommandments, transliterate, exportTenCommandments, sha256 } from '../scripts/export-ten-commandments-v1.mjs';

const raw = await readInputs(), m = JSON.parse(raw.manuscript), source = JSON.parse(raw.sources);
const runtime = projectTenCommandments(raw), bytes = serializeTenCommandments(runtime);
const pairs = value => {
  const out = [];
  function visit(v, path) {
    if (!v || typeof v !== 'object') return;
    if ('sr-Cyrl' in v) { out.push([path, v]); return; }
    for (const [k, child] of Object.entries(v)) visit(child, `${path}/${k}`);
  }
  visit(value, ''); return out;
};
test('exact approved source, additive approval and historical validation remain pinned', () => {
  for (const [key, pin] of Object.entries(INPUTS)) assert.equal(sha256(raw[key]), pin.sha256);
  assert.equal(m.review_status, 'DRAFT'); assert.equal(m.owner_approval, null);
  assert.equal(JSON.parse(raw.approval).status, 'CONTENT_APPROVED_FOR_PLANNED_INTEGRATION');
});
test('changed manuscript, sources, approval or validation rejects before projection', () => {
  for (const name of Object.keys(INPUTS)) {
    const altered = { ...raw, [name]: Buffer.concat([raw[name], Buffer.from(' ')]) };
    assert.throws(() => projectTenCommandments(altered), new RegExp(`exact ${name} hash`));
  }
  const pending = JSON.parse(raw.approval); pending.status = 'PENDING';
  assert.throws(() => projectTenCommandments({ ...raw, approval: Buffer.from(JSON.stringify(pending)) }), /exact approval hash/);
});
test('all48 approved localized pairs survive byte-for-byte at their original paths', () => {
  const expected = pairs(m), actual = new Map(pairs(runtime));
  assert.equal(expected.length, 48);
  for (const [path, value] of expected) assert.deepEqual(actual.get(path), value, path);
  assert.equal(actual.size, 52); // four source titles/translators, mechanical transliteration only
});
test('exact10+10+17 ordering, stable identifiers and separated attribution', () => {
  assert.equal(runtime.id, 'ten-commandments'); assert.equal(runtime.revision, 1);
  assert.equal(runtime.items.length, 10);
  runtime.items.forEach((item, i) => {
    assert.equal(item.id, `commandment-${i + 1}`); assert.equal(item.number, i + 1);
    assert.deepEqual(item.text, m.items[i].text); assert.deepEqual(item.explanation, m.items[i].explanation);
    assert.deepEqual(item.references, m.items[i].references);
  });
  assert.equal(runtime.biblical_reading.verses.length, 17);
  assert.deepEqual(runtime.biblical_reading.verses, m.biblical_reading.verses);
  runtime.biblical_reading.verses.forEach((v, i) => assert.equal(v.number, i + 1));
  assert.deepEqual(runtime.biblical_reading.attribution, m.biblical_reading.attribution);
  assert.deepEqual(runtime.summary_attribution, m.summary_attribution);
  assert.deepEqual(runtime.explanation_note, m.explanation_note);
});
test('all localized consumer fields use matched scripts and exact transliteration', () => {
  for (const [path, value] of pairs(runtime)) {
    assert.deepEqual(Object.keys(value).sort(), ['sr-Cyrl', 'sr-Latn']);
    assert.equal(value['sr-Latn'], transliterate(value['sr-Cyrl']), path);
    assert.doesNotMatch(value['sr-Cyrl'], /\p{Script=Latin}/u, path);
    assert.doesNotMatch(value['sr-Latn'], /\p{Script=Cyrillic}/u, path);
  }
});
test('all four sources stay exact bibliographic URLs; no EXO/DEU reader action', () => {
  assert.equal(runtime.sources.length, 4);
  runtime.sources.forEach((s, i) => {
    assert.equal(s.id, source.sources[i].id); assert.equal(s.url, source.sources[i].url);
    assert.equal(new URL(s.url).protocol, 'https:');
    for (const k of ['title', 'translator']) if (source.sources[i][k]) {
      assert.equal(s[k]['sr-Cyrl'], source.sources[i][k]);
      assert.equal(s[k]['sr-Latn'], transliterate(source.sources[i][k]));
    }
  });
  assert.doesNotMatch(bytes.toString(), /svetlost33:\/\/|"(?:deep_link|route|route_id|action|url_scheme)"/);
});
test('closed nested consumer allowlist excludes private draft/evidence fields', () => {
  const exact = (o, fields) => assert.deepEqual(Object.keys(o).sort(), [...fields].sort());
  exact(runtime, ['id', 'revision', ...LABELS, 'items', 'biblical_reading', 'sources']);
  runtime.items.forEach(i => { exact(i, ['id', 'number', 'text', 'explanation', 'references']);
    i.references.forEach(r => exact(r, ['source_id', 'book_id', 'chapter', 'verse_from', 'verse_to'])); });
  exact(runtime.biblical_reading, ['source_id', 'book_id', 'chapter', 'verse_from', 'verse_to', 'label', 'attribution', 'verses']);
  runtime.biblical_reading.verses.forEach(v => exact(v, ['number', 'text']));
  runtime.sources.forEach(s => exact(s, ['id', 'url', ...(s.title ? ['title'] : []), ...(s.translator ? ['translator'] : [])]));
  assert.doesNotMatch(bytes.toString(), /"(?:owner_approval|clerical_review|review_status|publication_authorized|editorial_notes|authority|user_statement|verification|source_edition|rights_basis|scope|prepared_on|checked_on|runtime_schema)"|\/Users\//);
});
test('export is deterministic, UTF8 JSON and the sole bundle file matches generated bytes', async () => {
  assert.deepEqual(serializeTenCommandments(projectTenCommandments(raw)), bytes);
  assert.deepEqual(JSON.parse(bytes), runtime);
  assert.deepEqual(await readFile(new URL(`../${OUTPUT}`, import.meta.url)), bytes);
  assert.deepEqual(await readdir(new URL('../exports/ten-commandments-v1/', import.meta.url)), ['ten-commandments.json']);
  const result = await exportTenCommandments({ check: true });
  assert.equal(result.sha256, sha256(bytes)); assert.equal(result.public_distribution_executed, false);
  assert.ok(bytes.length < 32 * 1024, 'small offline bundle resource');
});
