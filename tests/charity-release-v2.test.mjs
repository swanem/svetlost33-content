import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ROOT, BASE, BASE_INDEX_PATH, BASE_SIGNATURE_PATH, PAYLOAD, PAYLOAD_SHA256, RELEASE_ID, KEY_ID, CAPABILITIES,
  createCharityReleasePlan, loadArchivedBase, prepareCharityRelease, readTree, sha256, writeNewTree
} from '../scripts/prepare-charity-release-v2.mjs';
import { signCharityRelease } from '../scripts/sign-charity-release-v2.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';
import { validateOrganizationsRegistry } from '../scripts/validate-organizations-v1.mjs';

const now = '2026-09-18T10:40:00Z';
const payloadBytes = await readFile(resolve(ROOT, PAYLOAD));
const payload = JSON.parse(payloadBytes);
const context = { module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: '2026.9.18', revision: 1 };
const options = { now, contentAuthenticated: true, paymentSessionFresh: true, clientCapabilities: ['organizations-v1'], moduleContext: context };
const enabled = result => result.organizations.flatMap(org => org.links.filter(link => link.enabled).map(link => `${org.id}/${link.kind}`));

test('reviewed payload implements exactly the three owner-approved cards and six links', () => {
  assert.equal(sha256(payloadBytes), PAYLOAD_SHA256);
  assert.equal(payloadBytes.length, 5565);
  assert.equal(payload.dataset_kind, 'reviewed');
  assert.deepEqual(payload.organizations.map(org => org.id), ['nurdor-rs', 'norbs-plus-rs', 'srbi-za-srbe-rs']);
  assert.deepEqual(payload.organizations.map(org => org.legal_name), [
    'Nacionalno udruženje roditelja dece obolele od raka - NURDOR', 'Fondacija NORBS Plus', 'Хуманитарна организација Срби за Србе'
  ]);
  assert.deepEqual(payload.organizations.flatMap(org => org.links.map(link => link.url)), [
    'https://www.nurdor.org/doniraj', 'https://www.nurdor.org/nase-price',
    'https://1jeposeban.rs/', 'https://norbs.rs/fondacija-norbs-plus/',
    'https://donacije.srbizasrbe.org/', 'https://www.srbizasrbe.org/pomogli-smo/'
  ]);
  for (const org of payload.organizations) {
    assert.equal(org.status, 'active');
    assert.deepEqual(org.payment_rails, []);
    assert.equal(org.logo, null);
    assert.deepEqual(Object.keys(org.name).sort(), ['sr-Cyrl', 'sr-Latn']);
    assert.deepEqual(Object.keys(org.description).sort(), ['sr-Cyrl', 'sr-Latn']);
    assert.deepEqual(org.links.map(link => link.kind), ['donation', 'story']);
    assert.ok(org.links.every(link => !new URL(link.url).search && !new URL(link.url).hash));
  }
  assert.equal(enabled(validateOrganizationsRegistry(payload, options)).length, 6);
  assert.deepEqual(enabled(validateOrganizationsRegistry(payload, { ...options, contentAuthenticated: false })), []);
  assert.deepEqual(enabled(validateOrganizationsRegistry(payload, { ...options, paymentSessionFresh: false })), [
    'nurdor-rs/story', 'norbs-plus-rs/story', 'srbi-za-srbe-rs/story'
  ]);
});

test('review cutoff is 30 days, exclusive at expiry, without disabling historical readability', () => {
  assert.equal(Date.parse(payload.expires_at) - Date.parse(payload.issued_at), 30 * 24 * 60 * 60 * 1000);
  const until = Date.parse(payload.expires_at);
  assert.equal(enabled(validateOrganizationsRegistry(payload, { ...options, now: until - 1 })).length, 6);
  const expired = validateOrganizationsRegistry(payload, { ...options, now: until });
  assert.deepEqual(enabled(expired), []);
  assert.equal(expired.organizations.length, 3);
  assert.ok(expired.blockers.includes('registry_expired'));
  assert.throws(() => validateOrganizationsRegistry(payload, { ...options, moduleContext: { ...context, revision: 2 } }), { code: 'MODULE_IDENTITY' });
});

test('all previous fixture and immutable release bytes retain their recorded hashes', async () => {
  const evidence = JSON.parse(await readFile(resolve(ROOT, 'approvals/charity-cards-2026-09-18/preserved-inputs.json')));
  assert.equal(evidence.immutable_files.length, 95);
  for (const record of evidence.immutable_files) {
    const bytes = await readFile(resolve(ROOT, record.path));
    assert.equal(bytes.length, record.bytes, record.path);
    assert.equal(sha256(bytes), record.sha256, record.path);
  }
});

test('unsigned preparation is reproducible and preserves old signed modules with compatible minimum clients', async () => {
  const { files, request } = await createCharityReleasePlan({ now });
  const again = await createCharityReleasePlan({ now });
  assert.deepEqual(files, again.files);
  const oldIndex = JSON.parse(await readFile(resolve(BASE, BASE_INDEX_PATH)));
  const oldSet = JSON.parse(await readFile(resolve(BASE, oldIndex.channels.production.path)));
  const index = JSON.parse(files.get('index.json'));
  const set = JSON.parse(files.get(index.channels.production.path));
  assert.equal(index.sequence, 3);
  assert.equal(index.expires_at, oldIndex.expires_at);
  assert.equal(set.release_set_id, RELEASE_ID);
  assert.deepEqual(set.modules.slice(0, 3), oldSet.modules);
  assert.deepEqual(set.min_clients, { android: 10, ios: '0.1.0' });
  assert.equal(set.modules[3].required, false);
  const manifest = JSON.parse(files.get(set.modules[3].manifest_path));
  assert.deepEqual(manifest.capabilities, ['organizations-v1']);
  assert.equal(manifest.files[0].sha256, PAYLOAD_SHA256);
  for (const [path, bytes] of await loadArchivedBase()) {
    if (path !== 'index.json' && path !== 'index.sig') assert.deepEqual(files.get(path), bytes, path);
  }
  assert.equal(request.documents_to_sign.length, 3);
  for (const document of request.documents_to_sign) {
    assert.ok(!files.has(document.signature_path));
    assert.equal(sha256(files.get(document.path)), document.sha256);
  }
  assert.ok([...files.keys()].every(path => !path.includes('private') && !path.endsWith('.key')));
});

test('archived source remains reproducible after the live discovery advances', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-charity-advanced-base-'));
  try {
    const baseCopy = resolve(temp, 'production');
    await cp(BASE, baseCopy, { recursive: true });
    const original = await createCharityReleasePlan({ now });
    // Simulate publication in an isolated copy only; no real live pointer is
    // changed by tests. Historical source verification still uses its signature.
    await writeFile(resolve(baseCopy, 'index.json'), original.files.get('index.json'));
    await writeFile(resolve(baseCopy, 'index.sig'), 'not-the-historical-signature\n');
    await writeFile(resolve(baseCopy, 'later-publication-evidence.json'), '{}\n');
    const regenerated = await createCharityReleasePlan({ now, baseDirectory: baseCopy });
    assert.deepEqual(regenerated.files, original.files);
    const historical = await validateRelease(baseCopy, { now, platform: 'android', clientVersion: 10, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES, indexPath: BASE_INDEX_PATH, indexSignaturePath: BASE_SIGNATURE_PATH });
    assert.equal(historical.sequence, 2);
    await assert.rejects(validateRelease(baseCopy, { now, platform: 'android', clientVersion: 10, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }), { code: 'SIGNATURE' });
    await assert.rejects(validateRelease(baseCopy, { now, platform: 'android', clientVersion: 10, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES, indexPath: '../outside.json' }), { code: 'PATH' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('a test-only signed copy validates for both native capabilities and skips only organizations on older clients', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-charity-contract-'));
  try {
    const { files, request } = await createCharityReleasePlan({ now });
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const testFiles = new Map(files);
    testFiles.set('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
    const index = JSON.parse(testFiles.get('index.json'));
    const set = JSON.parse(testFiles.get(index.channels.production.path));
    // This temporary mirror uses an explicit test trust anchor, never the
    // production signer. Only signatures/key differ; all manifest/data bytes
    // match the candidate. The private test key exists only in this process.
    const documents = [
      ...request.documents_to_sign,
      ...set.modules.slice(0, 3).map(entry => ({ path: entry.manifest_path, signature_path: entry.signature_path }))
    ];
    for (const document of documents) testFiles.set(document.signature_path, Buffer.from(`${sign('sha256', testFiles.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`));
    const out = resolve(temp, 'test-only-mirror');
    await writeNewTree(out, testFiles);
    for (const [platform, clientVersion] of [['android', 10], ['ios', '0.1.0']]) {
      const check = { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: 3, clientCapabilities: CAPABILITIES };
      assert.equal((await validateRelease(out, check)).modules, 4);
      const legacy = await validateRelease(out, { ...check, clientCapabilities: CAPABILITIES.filter(value => value !== 'organizations-v1') });
      assert.equal(legacy.modules, 3);
      assert.deepEqual(legacy.skippedOptionalModules, ['organizations-v1']);
      await assert.rejects(validateRelease(out, { ...check, minimumSequence: 4 }), { code: 'REPLAY' });
    }
    const target = resolve(out, set.modules[3].manifest_path.replace('manifest.json', 'data/organizations-v1.json'));
    await writeFile(target, Buffer.concat([payloadBytes, Buffer.from(' ')]));
    await assert.rejects(validateRelease(out, { now, platform: 'android', clientVersion: 10, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }), { code: 'LENGTH' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('preparation refuses existing outputs and signing rejects drift before opening any key', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-charity-guard-'));
  try {
    const candidate = resolve(temp, 'candidate');
    await prepareCharityRelease(candidate, { now });
    await assert.rejects(prepareCharityRelease(candidate, { now }), { code: 'EEXIST' });
    await assert.rejects(signCharityRelease({ candidate, out: candidate, privateKeyPath: '/deliberately/nonexistent/test-key', now }), /Output already exists/);
    await writeFile(resolve(candidate, 'index.json'), '{}\n');
    await assert.rejects(signCharityRelease({ candidate, out: resolve(temp, 'signed'), privateKeyPath: '/deliberately/nonexistent/test-key', now }), /Candidate differs/);
    const link = resolve(temp, 'symlink-candidate');
    await symlink(candidate, link);
    await assert.rejects(readTree(link), /regular content directory/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('production signer rejects any explicitly supplied key that does not match the established anchor', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-charity-wrong-key-'));
  try {
    const candidate = resolve(temp, 'candidate');
    await prepareCharityRelease(candidate, { now });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPath = resolve(temp, 'explicit-test-key.pem');
    await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    await assert.rejects(signCharityRelease({ candidate, out: resolve(temp, 'signed'), privateKeyPath: keyPath, now }), /does not match the pinned existing production public key/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
