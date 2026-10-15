import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { ROOT, BASE, CAPABILITIES, KEY_ID, json, readTree, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import {
  DETAILS_RELEASE_ID, DETAILS_PAYLOAD_PATH, DETAILS_PAYLOAD_SHA256, DETAILS_APPROVAL_PATH, DETAILS_APPROVAL_SHA256,
  DETAILS_REVIEW_PATH, DETAILS_REVIEW_SHA256, S4_INVENTORY_PATH, S4_INVENTORY_SHA256, S4_INDEX_PATH, S4_SIGNATURE_PATH,
  createCharityDetailsPlan, loadS4Source, prepareCharityDetailsRelease
} from '../scripts/prepare-charity-details-v2.mjs';
import { signCharityDetailsRelease, validateSignedCharityDetailsRelease } from '../scripts/sign-charity-details-v2.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const now = '2026-09-19T13:13:00Z';
const sourceOptions = { now, platform: 'android', clientVersion: 35, trustedKeyId: KEY_ID, minimumSequence: 4, clientCapabilities: CAPABILITIES };
const source = await loadS4Source();
const sourceIndex = JSON.parse(source.files.get('index.json'));
const sourceSet = JSON.parse(source.files.get(sourceIndex.channels.production.path));
const plan = await createCharityDetailsPlan({ now });
const index = JSON.parse(plan.files.get('index.json'));
const set = JSON.parse(plan.files.get(index.channels.production.path));

test('details S5 is reproducible, binds continuation approval and contains exactly three unsigned documents', async () => {
  assert.deepEqual((await createCharityDetailsPlan({ now })).files, plan.files);
  for (const [path, expected] of [[DETAILS_PAYLOAD_PATH, DETAILS_PAYLOAD_SHA256], [DETAILS_APPROVAL_PATH, DETAILS_APPROVAL_SHA256], [DETAILS_REVIEW_PATH, DETAILS_REVIEW_SHA256], [S4_INVENTORY_PATH, S4_INVENTORY_SHA256]]) {
    assert.equal(sha256(await readFile(resolve(ROOT, path))), expected);
  }
  assert.equal(index.sequence, 5);
  assert.equal(index.issued_at, '2026-09-19T13:12:15Z');
  assert.equal(index.expires_at, sourceIndex.expires_at);
  assert.equal(set.release_set_id, DETAILS_RELEASE_ID);
  assert.equal(set.sequence, 5);
  assert.deepEqual(set.approved_platforms, ['android', 'ios']);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  assert.deepEqual(plan.request.minimum_clients, set.min_clients);
  assert.equal(plan.request.publication_authorized_by_approval, false);
  assert.equal(plan.request.documents_to_sign.length, 3);
  assert.equal(plan.request.all_candidate_files.length, plan.files.size - 1);
  for (const document of plan.request.documents_to_sign) {
    assert.equal(plan.files.get(document.path).length, document.bytes);
    assert.equal(sha256(plan.files.get(document.path)), document.sha256);
    assert.ok(!plan.files.has(document.signature_path), document.signature_path);
  }
  for (const item of plan.request.all_candidate_files) {
    assert.equal(plan.files.get(item.path).length, item.bytes);
    assert.equal(sha256(plan.files.get(item.path)), item.sha256);
  }
  assert.equal(plan.request.approval_sha256, DETAILS_APPROVAL_SHA256);
  assert.equal(plan.request.source_inventory_sha256, S4_INVENTORY_SHA256);
  assert.ok([...plan.files.keys()].every(path => !path.includes('private') && !path.endsWith('.key')));
});

test('details S5 preserves the full S4 source tree and every active reading/excerpt module byte', () => {
  assert.equal(source.files.size, 45);
  for (const [path, bytes] of source.files) {
    const target = path === 'index.json' ? S4_INDEX_PATH : path === 'index.sig' ? S4_SIGNATURE_PATH : path;
    assert.ok(plan.files.get(target)?.equals(bytes), target);
  }
  assert.deepEqual(set.modules.filter(module => module.module_id !== 'organizations-v1'), sourceSet.modules.filter(module => module.module_id !== 'organizations-v1'));
  assert.deepEqual(plan.request.unchanged_active_module_ids, ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1']);
  for (const entry of set.modules.filter(module => module.module_id !== 'organizations-v1')) {
    const manifest = JSON.parse(plan.files.get(entry.manifest_path));
    assert.ok(plan.files.get(entry.signature_path).equals(source.files.get(entry.signature_path)));
    for (const file of manifest.files) {
      const path = `${dirname(entry.manifest_path)}/${file.path}`;
      assert.ok(plan.files.get(path).equals(source.files.get(path)), path);
      if (entry.module_type === 'cycles' && file.path.startsWith('data/')) {
        const cycle = JSON.parse(plan.files.get(path));
        assert.equal(cycle.days.flatMap(day => day.slots).filter(slot => slot.quote.widget_excerpt).length, 5);
      }
    }
  }
});

test('details S5 adds only the approved profile payload and evidence, with no logo capability or new payment instructions', async () => {
  assert.equal(set.modules.length, 4);
  const organizations = set.modules.find(module => module.module_id === 'organizations-v1');
  assert.equal(organizations.required, false);
  assert.equal(organizations.version, '2026.9.19');
  const manifest = JSON.parse(plan.files.get(organizations.manifest_path));
  assert.equal(manifest.revision, 2);
  assert.deepEqual(manifest.capabilities, ['organizations-v1']);
  assert.deepEqual(manifest.dependencies, []);
  assert.deepEqual(manifest.files.map(file => file.path), ['data/organizations-v1.json', 'evidence/owner-approval.json', 'evidence/source-review.json']);
  assert.equal(manifest.files[0].bytes, 11073);
  assert.equal(manifest.files[0].sha256, DETAILS_PAYLOAD_SHA256);
  const prefix = dirname(organizations.manifest_path);
  assert.ok(plan.files.get(`${prefix}/data/organizations-v1.json`).equals(await readFile(resolve(ROOT, DETAILS_PAYLOAD_PATH))));
  assert.ok(plan.files.get(`${prefix}/evidence/owner-approval.json`).equals(await readFile(resolve(ROOT, DETAILS_APPROVAL_PATH))));
  assert.ok(plan.files.get(`${prefix}/evidence/source-review.json`).equals(await readFile(resolve(ROOT, DETAILS_REVIEW_PATH))));
  const payload = JSON.parse(plan.files.get(`${prefix}/data/organizations-v1.json`));
  assert.equal(payload.organizations.flatMap(org => org.links).length, 15);
  assert.ok(payload.organizations.every(org => org.logo === null && org.payment_rails.length === 0));
  await assert.rejects(createCharityDetailsPlan({ now: payload.expires_at }), /not currently eligible/);
});

test('later discovery and release additions cannot change the pinned S4 input graph', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-details-archive-'));
  try {
    const advanced = resolve(temp, 'later-public-tree');
    // The candidate already contains the original, signed S4 archive. Simulate
    // future pointer changes only in this disposable copy, never production.
    const laterFiles = new Map(plan.files);
    laterFiles.set('index.json', json({ sequence: 99 }));
    laterFiles.set('index.sig', Buffer.from('not-the-historical-signature\n'));
    laterFiles.set('future-release/extra.json', json({ future: true }));
    await writeNewTree(advanced, laterFiles);
    assert.deepEqual((await createCharityDetailsPlan({ now, sourceDirectory: advanced })).files, plan.files);
    assert.equal((await validateRelease(advanced, { ...sourceOptions, indexPath: S4_INDEX_PATH, indexSignaturePath: S4_SIGNATURE_PATH })).sequence, 4);
    await writeFile(resolve(advanced, S4_INDEX_PATH), json({ sequence: 4 }));
    await assert.rejects(createCharityDetailsPlan({ now, sourceDirectory: advanced }), /S4 input (length|hash)/);
    await rm(resolve(advanced, S4_SIGNATURE_PATH));
    await writeFile(resolve(advanced, S4_INDEX_PATH), source.files.get('index.json'));
    await assert.rejects(loadS4Source(advanced), /Missing frozen S4 input/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('S4 payload and signature tampering fail before preparation can trust a source', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-details-source-'));
  try {
    const copied = resolve(temp, 'public-source');
    await writeNewTree(copied, source.files);
    const target = sourceSet.modules.find(module => module.module_id === 'daily-cycles-r1').signature_path;
    const tampered = Buffer.from(source.files.get(target));
    tampered[0] = tampered[0] === 65 ? 66 : 65;
    await writeFile(resolve(copied, target), tampered);
    await assert.rejects(createCharityDetailsPlan({ now, sourceDirectory: copied }), /S4 input hash/);
    await writeFile(resolve(copied, target), source.files.get(target));
    await writeFile(resolve(copied, 'index.json'), json({ sequence: 5 }));
    await assert.rejects(createCharityDetailsPlan({ now, sourceDirectory: copied }), /S4 input (length|hash)/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('temporary test-anchor mirror verifies both platforms, sequence limits, old optional capabilities and tamper rejection', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-details-contract-'));
  try {
    // An ephemeral in-memory test key signs only a disposable test mirror. No
    // production private key or production signing operation is involved.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const testFiles = new Map(plan.files);
    testFiles.delete('signing-request.json');
    testFiles.set('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
    const documents = [...plan.request.documents_to_sign, ...set.modules.filter(module => module.module_id !== 'organizations-v1').map(entry => ({ path: entry.manifest_path, signature_path: entry.signature_path }))];
    for (const document of documents) testFiles.set(document.signature_path, Buffer.from(`${sign('sha256', testFiles.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`));
    const out = resolve(temp, 'test-only-mirror');
    await writeNewTree(out, testFiles);
    const checks = await validateSignedCharityDetailsRelease(out, { now });
    assert.equal(checks.length, 4);
    assert.ok(checks.every(check => check.sequence === 5 && check.modules === 4));
    const org = set.modules.find(module => module.module_id === 'organizations-v1');
    const path = `${dirname(org.manifest_path)}/data/organizations-v1.json`;
    const changed = Buffer.from(testFiles.get(path));
    changed[changed.indexOf('nurdor.org')] = 'x'.charCodeAt(0);
    await writeFile(resolve(out, path), changed);
    await assert.rejects(validateSignedCharityDetailsRelease(out, { now }), { code: 'HASH' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('preparation refuses overwrite; signer rejects candidate/request drift and extras before any key access', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-details-guards-'));
  try {
    const candidate = resolve(temp, 'candidate');
    await prepareCharityDetailsRelease(candidate, { now });
    assert.deepEqual(await readTree(candidate), plan.files);
    await assert.rejects(prepareCharityDetailsRelease(candidate, { now }), { code: 'EEXIST' });
    const args = { candidate, out: resolve(temp, 'signed'), privateKeyPath: '/deliberately/nonexistent/test-key', now };
    await assert.rejects(signCharityDetailsRelease({ ...args, out: candidate }), /Output already exists/);
    await assert.rejects(signCharityDetailsRelease({ ...args, privateKeyPath: undefined }), /Explicit candidate/);
    for (const path of ['index.json', 'signing-request.json']) {
      await writeFile(resolve(candidate, path), '{}\n');
      await assert.rejects(signCharityDetailsRelease(args), /Candidate differs/);
      await writeFile(resolve(candidate, path), plan.files.get(path));
    }
    await writeFile(resolve(candidate, 'extra.json'), '{}\n');
    await assert.rejects(signCharityDetailsRelease(args), /Candidate file set differs/);
    const linked = resolve(temp, 'linked-candidate');
    await symlink(candidate, linked);
    await assert.rejects(signCharityDetailsRelease({ ...args, candidate: linked }), /regular content directory/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
