import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SAVED_SUBJECTS_SCHEMA, SAVED_SUBJECTS_LIMITS, validateLocalStore, parseLocalStore,
  validateVerifiedView, validSavedKey, target, resolve, mutate } from '../scripts/saved-subjects-v1.mjs';

const bytes = await readFile(new URL('../fixtures/saved-subjects-v1/expected.json', import.meta.url));
const fixture = JSON.parse(bytes);
const operations = { target, resolve, mutate };
const sourceCase = id => fixture.cases.find(item => item.id === id);
const currentView = () => structuredClone(sourceCase('target-explicit-observance').input.view);
const record = () => structuredClone(sourceCase('resolve-one-exact-current-article').input.record);
const storeOf = (...entries) => ({ schema_version: SAVED_SUBJECTS_SCHEMA, entries });
const valid = { valid: true, reason: null };
const malformed = { valid: false, reason: 'malformed' };
const withName = value => ({ key: { kind: 'observance', id: 'test-name' }, last_known_name: { 'sr-Cyrl': value, 'sr-Latn': value } });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('I3 fixture is synthetic, complete, uniquely named and covers all three pure operations', () => {
  assert.equal(fixture.schema_version, 'svetlost33-saved-subjects-test-cases-1');
  assert.equal(fixture.purpose, 'TEST_ONLY_SYNTHETIC_LOCAL_SEMANTICS_NOT_AUTHENTICATION_OR_OWNER_APPROVAL');
  assert.ok(fixture.cases.length >= 25);
  assert.equal(new Set(fixture.cases.map(item => item.id)).size, fixture.cases.length);
  assert.deepEqual([...new Set(fixture.cases.map(item => item.operation))].sort(), ['mutate', 'resolve', 'target']);
  for (const item of fixture.cases) assert.deepEqual(Object.keys(item).sort(), ['expected', 'id', 'input', 'operation']);
});

for (const item of fixture.cases) test(`saved subjects shared: ${item.id}`, () => {
  const input = structuredClone(item.input), before = structuredClone(input);
  deepFreeze(input);
  const result = operations[item.operation](input);
  assert.deepEqual(result, item.expected);
  assert.deepEqual(input, before, 'operation must not modify the original store/view/reader context');
  if (item.operation === 'mutate' && ['write_failed', 'store_unavailable', 'unchanged', 'identity_unavailable', 'limit_reached'].includes(result.state) && input.store !== null) {
    assert.strictEqual(result.store, input.store, 'no-op/failure preserves the actual original logical value');
  }
});

test('independent semantic assertions: typed identity, exact target deduplication, no guessed fallback', () => {
  assert.equal(sourceCase('target-two-observances-ambiguous').expected.state, 'ambiguous');
  assert.equal(sourceCase('target-inferred-saint-group-rejected').expected.state, 'unavailable');
  assert.equal(sourceCase('target-explicit-missing-no-inferred-fallback').expected.state, 'unavailable');
  assert.deepEqual(sourceCase('save-typed-collision-keeps-two-records').expected.store.entries.map(item => item.key.kind), ['saint', 'observance']);
  const duplicate = sourceCase('resolve-deduplicate-and-merge-observance-provenance').expected;
  assert.equal(duplicate.state, 'one_article');
  assert.deepEqual(duplicate.article_targets[0].observance_ids, ['obs-alpha', 'obs-beta', 'obs-z']);
  assert.equal(sourceCase('resolve-same-article-id-different-binding-not-deduplicated').expected.state, 'choose_article');
  assert.equal(sourceCase('resolve-identity-absent-not-withdrawn').expected.state, 'identity_unavailable');
});

test('raw storage: absent differs from JSON null; strict UTF-8/BOM/JSON and raw byte cap', () => {
  const value = storeOf(record()), encoded = Buffer.from(JSON.stringify(value));
  assert.deepEqual(parseLocalStore(null), { ...valid, store: storeOf() });
  assert.deepEqual(parseLocalStore(undefined), { ...valid, store: storeOf() });
  assert.deepEqual(parseLocalStore(encoded), { ...valid, store: value });
  assert.deepEqual(parseLocalStore(Buffer.concat([encoded, Buffer.alloc(SAVED_SUBJECTS_LIMITS.bytes - encoded.length, 32)])), { ...valid, store: value });
  for (const raw of [
    Buffer.concat([encoded, Buffer.alloc(SAVED_SUBJECTS_LIMITS.bytes + 1 - encoded.length, 32)]),
    Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]),
    Buffer.from('null'), Buffer.from(''), Buffer.from('{'), Buffer.from('[]'), '{}',
  ]) assert.deepEqual(parseLocalStore(raw), malformed);
  assert.deepEqual(parseLocalStore(Buffer.from('{"schema_version":"future","entries":[]}')),
    { valid: false, reason: 'unsupported_schema' });
});

test('names count Unicode scalars, require exact Latin parity, and reject unsafe names', () => {
  assert.deepEqual(validateLocalStore(storeOf(withName('🙏'.repeat(200)))), valid);
  assert.deepEqual(validateLocalStore(storeOf(withName('🙏'.repeat(201)))), malformed);
  assert.deepEqual(validateLocalStore(storeOf(withName('x'.repeat(200)))), valid);
  assert.deepEqual(validateLocalStore(storeOf(withName('x'.repeat(201)))), malformed);
  for (const text of ['', ' spaced', 'spaced ', '\ud800', '\udfff', 'bad\u0000', 'bad\u0085', 'bad\u202e', 'bad\u2066', '<b>unsafe</b>']) {
    assert.deepEqual(validateLocalStore(storeOf(withName(text))), malformed);
  }
  assert.deepEqual(validateLocalStore(storeOf({ key: { kind: 'saint', id: 'test-parity' }, last_known_name: { 'sr-Cyrl': 'Љубав Његош Џем', 'sr-Latn': 'Ljubav Njegoš Džem' } })), valid);
  assert.deepEqual(validateLocalStore(storeOf({ ...record(), last_known_name: { 'sr-Cyrl': 'Љубав', 'sr-Latn': 'LJUBAV' } })), malformed);
});

test('storage closes every object, preserves duplicate typed key failures, accepts kind collisions', () => {
  const one = record();
  for (const bad of [
    { ...storeOf(), extra: true }, storeOf({ ...one, read_at: 'private' }),
    storeOf({ ...one, key: { ...one.key, date: '2026-09-20' } }),
    storeOf({ ...one, last_known_name: { ...one.last_known_name, en: 'Name' } }),
    storeOf(one, one), { schema_version: SAVED_SUBJECTS_SCHEMA, entries: {} },
  ]) assert.deepEqual(validateLocalStore(bad), malformed);
  assert.deepEqual(validateLocalStore(storeOf(one, { ...one, key: { ...one.key, kind: 'saint' } })), valid);
  assert.deepEqual(validateLocalStore(null), valid);
  assert.deepEqual(validateLocalStore(undefined), valid);
});

test('ID ASCII and scalar grammar boundaries are exact and do not normalize identity', () => {
  for (const value of ['abc', 'a'.repeat(64), 'abc.def_ghi-jkl']) assert.equal(validSavedKey({ kind: 'observance', id: value }), true);
  for (const value of ['ab', 'a'.repeat(65), 'ABC', 'ćirilica', 'id with space', '_abc', 'abc:one', null, 123]) {
    assert.equal(validSavedKey({ kind: 'observance', id: value }), false);
  }
  assert.equal(validSavedKey({ kind: 'article', id: 'abc' }), false);
});

test('generation and view shape fail closed; boolean sequence and unknown merge metadata are not authority', () => {
  for (const change of [
    view => { view.generation.sequence = true; }, view => { view.generation.sequence = 0; },
    view => { view.generation.sequence = 1.5; }, view => { view.generation.sequence = 9007199254740992; },
    view => { view.generation.id = ''; }, view => { view.generation.decision_sha256 = 'A'.repeat(64); },
    view => { view.generation.extra = true; }, view => { view.identities[0].name['sr-Latn'] = 'Wrong'; },
    view => { view.identities[0].article_targets[0].observance_ids = []; },
    view => { view.identities[0].article_targets[0].observance_ids = ['!']; },
    view => { view.identities.push(structuredClone(view.identities[0])); },
    view => { view.identity_merges = []; },
  ]) {
    const view = currentView(); change(view);
    assert.equal(validateVerifiedView(view), false);
    assert.equal(resolve({ record: record(), view }).state, 'catalog_unavailable');
  }
});

test('invalid operation arguments throw generic TypeError, never raw values or records', () => {
  const input = structuredClone(sourceCase('save-absent-store-canonical-first-record').input);
  for (const bad of [
    { ...input, action: 'merge' }, { ...input, action: 'PRIVATE_USER_CHOICE' },
    { ...input, key: { kind: 'article', id: 'private-sensitive-id' } },
    { ...input, write_succeeds: 'true' }, { ...input, write_succeeds: 1 },
  ]) assert.throws(() => mutate(bad), error => error instanceof TypeError && !/PRIVATE|private-sensitive-id/.test(error.message));
  assert.throws(() => resolve({ record: { PRIVATE_DATA: true }, view: null }), TypeError);
  assert.throws(() => target({ explicit_key: { kind: 'article', id: 'abc' }, candidate_keys: [], view: currentView() }), TypeError);
  assert.throws(() => target({ explicit_key: null, candidate_keys: {}, view: currentView() }), TypeError);
});

test('explicit remove then save reorders, repeated operations and failed writes lose no unrelated record', () => {
  const base = structuredClone(sourceCase('remove-offline').input);
  const removed = mutate(base);
  const saved = mutate({ ...base, store: removed.store, action: 'save', view: currentView() });
  assert.deepEqual(saved.store.entries.map(item => item.key.id), ['test-alpha', 'test-beta']);
  assert.deepEqual(mutate({ ...base, store: saved.store, action: 'save', view: currentView(), write_succeeds: false }),
    { state: 'unchanged', store: saved.store });
  assert.deepEqual(mutate({ ...base, store: saved.store, write_succeeds: false }),
    { state: 'write_failed', store: saved.store });
});

test('a returned reader snapshot remains pinned when caller separately activates another view', () => {
  const initialView = currentView();
  const opened = resolve({ record: record(), view: initialView });
  const frozen = structuredClone(opened);
  initialView.generation.sequence = 99;
  initialView.identities[0].article_targets[0].article_id = 'article-next';
  initialView.identities[0].name['sr-Cyrl'] = 'Ново';
  initialView.identities[0].name['sr-Latn'] = 'Novo';
  assert.deepEqual(opened, frozen);
  assert.equal(resolve({ record: record(), view: initialView }).generation.sequence, 99);
  assert.equal(resolve({ record: record(), view: initialView }).article_targets[0].article_id, 'article-next');
  // Pure-copy semantics only: this is NOT proof of a native pinned reader or authentication.
});
