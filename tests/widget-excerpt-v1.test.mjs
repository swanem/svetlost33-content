import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { ROOT, CAPABILITIES, KEY_ID, json, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { EXCERPT_APPROVAL_PATH, createWidgetExcerptPlan, defaultExcerptSource, loadS3Source, prepareWidgetExcerptRelease, S3_INDEX_PATH, S3_SIGNATURE_PATH } from '../scripts/prepare-widget-excerpts-v2.mjs';
import { signWidgetExcerptRelease } from '../scripts/sign-widget-excerpts-v2.mjs';
import { evaluateWidgetExcerpt, WIDGET_EXCERPT_LABEL } from '../scripts/validate-widget-excerpt-v1.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const now = '2026-09-18T13:00:00Z';
const fixtures = JSON.parse(await readFile(new URL('../fixtures/widget-excerpt-v1/cases.json', import.meta.url)));
const approval = JSON.parse(await readFile(resolve(ROOT, EXCERPT_APPROVAL_PATH)));
function patch(input, operations) {
  for (const operation of operations) {
    const keys = operation.path.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
    const key = keys.pop(), parent = keys.reduce((value, key) => value[key], input);
    if (operation.op !== 'add') assert.ok(Object.hasOwn(parent, key), operation.path);
    if (operation.op === 'remove') delete parent[key];
    else parent[key] = structuredClone(operation.value);
  }
  return input;
}

test('portable widget excerpt contract cases', async t => {
  assert.equal(fixtures.test_only, true);
  for (const fixture of fixtures.cases) await t.test(fixture.id, () => {
    const input = patch(structuredClone({ excerpt: fixtures.excerpts[fixture.base], context: fixtures.contexts[fixture.base] }), fixture.patch);
    assert.deepEqual(evaluateWidgetExcerpt(input.excerpt, input.context), fixture.expected);
  });
});

test('exact five bilingual approved pairs alone are added; removing extension reproduces source bytes', async () => {
  assert.equal(approval.user_statement, 'odobravam pet predlozenih izvoda i nastavi sa svim ostalim');
  assert.deepEqual(approval.approved_slot_ids, ['general-day-2-morning', 'general-day-4-morning', 'general-day-5-morning', 'general-day-6-morning', 'general-day-6-noon']);
  assert.equal(approval.approved_excerpts.length, 10);
  assert.deepEqual(WIDGET_EXCERPT_LABEL, { 'sr-Cyrl': 'извод', 'sr-Latn': 'izvod' });
  for (const item of approval.resulting_payloads) {
    const bytes = await readFile(resolve(ROOT, item.path));
    assert.equal(sha256(bytes), item.sha256);
    const cycle = JSON.parse(bytes);
    const selected = [];
    for (const slot of cycle.days.flatMap(day => day.slots)) {
      const excerpt = slot.quote.widget_excerpt;
      if (excerpt) {
        selected.push(slot.id);
        assert.ok(!approval.excluded_draft_slot_ids.includes(slot.id));
        const key = `${slot.id}/${item.locale}`;
        assert.deepEqual(excerpt, fixtures.excerpts[key]);
        assert.equal(evaluateWidgetExcerpt(excerpt, fixtures.contexts[key]).eligible, true);
        assert.equal(slot.widget.full_quote_required, true);
        delete slot.quote.widget_excerpt;
      }
    }
    assert.deepEqual(selected, approval.approved_slot_ids);
    const old = approval.source_cycle_files.find(source => source.locale === item.locale);
    assert.equal(sha256(json(cycle)), old.sha256);
    assert.equal(json(cycle).equals(await readFile(resolve(ROOT, old.path))), true);
  }
  const short = approval.approved_excerpts.find(excerpt => excerpt.source_slot_id === 'general-day-5-morning' && excerpt.locale === 'sr-Cyrl');
  assert.equal(short.reference, 'Пс 92,1 · Даничић');
  assert.deepEqual(short.verse_numbers, [1]);
  assert.equal(fixtures.contexts['general-day-5-morning/sr-Cyrl'].quote.reference, 'Пс 92,1–2 · Даничић');
});

test('sequence 4 changes only active cycles and preserves every signed S3 input', async () => {
  const sourceDirectory = await defaultExcerptSource();
  const source = await loadS3Source(sourceDirectory);
  const plan = await createWidgetExcerptPlan({ now, sourceDirectory });
  const again = await createWidgetExcerptPlan({ now, sourceDirectory });
  assert.deepEqual(plan.files, again.files);
  for (const [path, bytes] of source.files) {
    const destination = path === 'index.json' ? S3_INDEX_PATH : path === 'index.sig' ? S3_SIGNATURE_PATH : path;
    assert.equal(plan.files.get(destination).equals(bytes), true, destination);
  }
  const oldIndex = JSON.parse(source.files.get('index.json'));
  const oldSet = JSON.parse(source.files.get(oldIndex.channels.production.path));
  const index = JSON.parse(plan.files.get('index.json'));
  const set = JSON.parse(plan.files.get(index.channels.production.path));
  assert.equal(index.sequence, 4);
  assert.equal(index.expires_at, oldIndex.expires_at);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  for (const entry of set.modules) {
    const previous = oldSet.modules.find(module => module.module_id === entry.module_id);
    if (entry.module_type !== 'cycles') assert.deepEqual(entry, previous);
    else {
      const manifest = JSON.parse(plan.files.get(entry.manifest_path));
      const original = JSON.parse(source.files.get(previous.manifest_path));
      assert.deepEqual(manifest.capabilities, original.capabilities);
      assert.deepEqual(manifest.dependencies, original.dependencies);
      assert.equal(manifest.version, '2026.1.2');
      assert.equal(manifest.revision, 3);
      assert.equal(manifest.files.length, 3);
      assert.ok(manifest.files.some(file => file.path === 'evidence/widget-excerpt-owner-approval.json'));
    }
  }
  assert.equal(plan.request.documents_to_sign.length, 3);
  for (const item of plan.request.documents_to_sign) assert.equal(plan.files.has(item.signature_path), false);
});

test('builder regenerates the same candidate after the source live pointer advances to S4', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-excerpt-source-'));
  try {
    const original = await createWidgetExcerptPlan({ now });
    const source = resolve(temp, 'advanced-source');
    const files = new Map(original.files);
    files.set('index.sig', Buffer.from('new-live-signature-not-used-by-historical-source-check\n'));
    await writeNewTree(source, files);
    const regenerated = await createWidgetExcerptPlan({ now, sourceDirectory: source });
    assert.deepEqual(regenerated.files, original.files);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('test-only signed transport accepts current 2→4 and 3→4, rejects old Android cleanly, and skips optional organizations on old iOS', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-excerpt-m0-'));
  try {
    const plan = await createWidgetExcerptPlan({ now });
    const files = new Map(plan.files);
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    files.set('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
    const index = JSON.parse(files.get('index.json'));
    const set = JSON.parse(files.get(index.channels.production.path));
    // Test trust anchor only. Existing payload/manifest bytes stay identical;
    // signatures are regenerated in this disposable test mirror, never in source.
    const documents = [...plan.request.documents_to_sign, ...set.modules.filter(entry => entry.module_type !== 'cycles').map(entry => ({ path: entry.manifest_path, signature_path: entry.signature_path }))];
    for (const document of documents) files.set(document.signature_path, Buffer.from(`${sign('sha256', files.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`));
    const out = resolve(temp, 'test-only');
    await writeNewTree(out, files);
    for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
      for (const minimumSequence of [2, 3]) {
        const result = await validateRelease(out, { now, platform, clientVersion, minimumSequence, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES });
        assert.equal(result.sequence, 4); assert.equal(result.modules, 4);
      }
    }
    const unchangedIndex = await readFile(resolve(out, 'index.json'));
    await assert.rejects(validateRelease(out, { now, platform: 'android', clientVersion: 34, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }), { code: 'CLIENT_VERSION' });
    assert.equal((await readFile(resolve(out, 'index.json'))).equals(unchangedIndex), true);
    const oldIos = await validateRelease(out, { now, platform: 'ios', clientVersion: '0.1.0', trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES.filter(value => value !== 'organizations-v1') });
    assert.equal(oldIos.modules, 3); assert.deepEqual(oldIos.skippedOptionalModules, ['organizations-v1']);
    await assert.rejects(validateRelease(out, { now, platform: 'android', clientVersion: 35, minimumSequence: 5, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }), { code: 'REPLAY' });
    const cycles = set.modules.find(entry => entry.module_type === 'cycles');
    const payloadPath = resolve(out, dirname(cycles.manifest_path), 'data/legacy-cycle.sr-Cyrl.json');
    await writeFile(payloadPath, Buffer.concat([await readFile(payloadPath), Buffer.from(' ')]));
    await assert.rejects(validateRelease(out, { now, platform: 'android', clientVersion: 35, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }), { code: 'LENGTH' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('excerpt preparation preserves outputs; signing rejects drift or wrong key before any production signing', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-excerpt-signing-guards-'));
  try {
    const candidate = resolve(temp, 'candidate');
    await prepareWidgetExcerptRelease(candidate, { now });
    await assert.rejects(prepareWidgetExcerptRelease(candidate, { now }), { code: 'EEXIST' });
    await assert.rejects(signWidgetExcerptRelease({ candidate, out: candidate, privateKeyPath: '/not-a-key', now }), /Output already exists/);
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPath = resolve(temp, 'ephemeral-test-key.pem');
    await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    await assert.rejects(signWidgetExcerptRelease({ candidate, out: resolve(temp, 'signed'), privateKeyPath: keyPath, now }), /does not match/);
    await writeFile(resolve(candidate, 'index.json'), '{}\n');
    await assert.rejects(signWidgetExcerptRelease({ candidate, out: resolve(temp, 'signed'), privateKeyPath: '/not-a-key', now }), /Candidate differs/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
