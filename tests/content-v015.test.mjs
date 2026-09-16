import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, verify } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { ValidationError, validateRelease } from '../scripts/validate-m0-v2.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const android = resolve(root, '../svetlost33-github');
const legacy = resolve(root, 'releases/legacy/annual-2026-r1');
const positive = resolve(root, 'fixtures/v2/positive/release');
const production = resolve(root, 'releases/v2/annual-2026-r1');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const walkFiles = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};
const treeDigest = async directory => {
  const hash = createHash('sha256');
  for (const path of (await walkFiles(directory)).sort()) {
    const relativePath = path.slice(resolve(directory).length + 1).split('\\').join('/');
    hash.update(relativePath); hash.update('\0'); hash.update(sha256(await readFile(path))); hash.update('\n');
  }
  return hash.digest('hex');
};
const androidClient = {
  trustedKeyId:'svetlost33-fixture-key-1',
  platform:'android',
  clientVersion:10,
  clientCapabilities:['library-v1','sr-Cyrl','sr-Latn','cycle-v1','calendar-v1','explicit-unknown','background-catalog-v1']
};

test('I0 public allowlist has only the exact 13 payloads and four release artifacts', async () => {
  const allowlist = JSON.parse(await readFile(resolve(root, 'inventory/public-allowlist.json')));
  assert.equal(allowlist.allowed.filter(path => path.startsWith('shared/annual/2026/')).length, 13);
  assert.equal(allowlist.allowed.filter(path => path.startsWith('shared/releases/')).length, 4);
  assert.equal(new Set(allowlist.allowed).size, 17);
  assert.ok(allowlist.explicitly_excluded.some(value => value.includes('private signing keys')));
});

test('approved backgrounds v1 inventory binds the exact catalog and 18 source images', async () => {
  const approvalId = 'shared-backgrounds-v1-2026-09-16';
  const approvalRoot = resolve(root, 'approvals', approvalId);
  const approval = JSON.parse(await readFile(resolve(approvalRoot, 'approval.json')));
  const manifestBytes = await readFile(resolve(approvalRoot, 'source-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const rights = JSON.parse(await readFile(resolve(root, 'licenses/backgrounds-v1.json')));
  const sourceCatalogBytes = await readFile(resolve(android, manifest.catalog.source_path));
  const approvedCatalogBytes = await readFile(resolve(approvalRoot, 'catalog.json'));
  const catalog = JSON.parse(sourceCatalogBytes);

  assert.equal(approval.approval_id, approvalId);
  assert.equal(approval.source.manifest_sha256, sha256(manifestBytes));
  assert.equal(approval.source.commit, manifest.source_commit);
  assert.deepEqual(approval.consumer_platforms, ['android', 'ios']);
  assert.equal(manifest.asset_count, 18);
  assert.equal(manifest.assets.length, 18);
  assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, 18);
  assert.equal(approvedCatalogBytes.equals(sourceCatalogBytes), true);
  assert.equal(manifest.catalog.sha256, sha256(sourceCatalogBytes));
  assert.deepEqual(manifest.default_ids, catalog.defaultIds);
  assert.deepEqual(manifest.assets.map(asset => asset.id), catalog.items.map(item => item.id));
  assert.equal(rights.approval_id, approvalId);
  assert.deepEqual(rights.items.map(item => item.id), manifest.assets.map(asset => asset.id));

  for (const asset of manifest.assets) {
    const sourceBytes = await readFile(resolve(android, asset.source_path));
    const rightsItem = rights.items.find(item => item.id === asset.id);
    assert.equal(sourceBytes.length, asset.bytes, asset.id);
    assert.equal(sha256(sourceBytes), asset.sha256, asset.id);
    assert.equal(rightsItem.sha256, asset.sha256, asset.id);
    assert.equal(rightsItem.approval_id, approvalId, asset.id);
    assert.deepEqual({ width:asset.width, height:asset.height }, { width:941, height:1672 });
  }
});

test('legacy r1 mirror preserves all source bytes and manifest hashes', async () => {
  await exec(process.execPath, [resolve(root, 'scripts/import-approved-r1.mjs'), '--source', android, '--check']);
  const manifestBytes = await readFile(resolve(legacy, 'manifest.json'));
  assert.equal(sha256(manifestBytes), 'adcd9c4c03fea220142c4e4e7027ffc4596d77ea44f6f248556723cbe73c640a');
  const manifest = JSON.parse(manifestBytes); assert.equal(manifest.files.length, 13);
  for (const record of manifest.files) {
    const bytes = await readFile(resolve(legacy, 'payload', record.path));
    assert.equal(bytes.length, record.bytes, record.path);
    assert.equal(sha256(bytes), record.sha256, record.path);
  }
});

test('legacy r1 detached RSA signature still verifies', async () => {
  const manifest = await readFile(resolve(legacy, 'manifest.json'));
  const signature = Buffer.from((await readFile(resolve(legacy, 'manifest.sig'), 'ascii')).trim(), 'base64');
  const publicKey = await readFile(resolve(legacy, 'public-key.pem'), 'utf8');
  assert.equal(verify('sha256', manifest, { key:publicKey, padding:constants.RSA_PKCS1_PADDING }, signature), true);
});

test('historical M0 v1 contract is preserved byte-for-byte', async () => {
  for (const name of ['README.md','update-fixtures.json']) {
    const source = await readFile(resolve(android, 'shared/update-contract/v1', name));
    const mirror = await readFile(resolve(root, 'schemas/v1', name));
    assert.equal(mirror.equals(source), true, name);
  }
});

test('all M0 v2 JSON schemas parse and declare Draft 2020-12', async () => {
  for (const name of ['index.schema.json','release-set.schema.json','module-manifest.schema.json']) {
    const schema = JSON.parse(await readFile(resolve(root, 'schemas/v2', name)));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  }
});

test('committed positive fixture validates as a four-module release', async () => {
  const result = await validateRelease(positive, androidClient);
  assert.deepEqual({ id:result.releaseSetId, sequence:result.sequence, modules:result.modules }, { id:'fixture-release-2026-r1', sequence:1, modules:4 });
});

test('fixture generator creates a complete valid signed release without a private key file', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-valid-'));
  try {
    await exec(process.execPath, [resolve(root, 'scripts/generate-v2-fixtures.mjs'), '--out', temp]);
    assert.equal((await validateRelease(temp, androidClient)).modules, 4);
    await assert.rejects(readFile(resolve(temp, 'private-key.pem')));
  } finally { await rm(temp, { recursive:true, force:true }); }
});

test('production export contains the complete approved Android r1 scope', async () => {
  const client = { ...androidClient, trustedKeyId:'svetlost33-content-2026-key-1' };
  const result = await validateRelease(production, { ...client, now:'2026-09-15T12:00:00Z' });
  assert.deepEqual({ id:result.releaseSetId, sequence:result.sequence, modules:result.modules }, {
    id:'annual-2026-r1-m0v2', sequence:1, modules:3
  });
  const set = JSON.parse(await readFile(resolve(production, 'release-set.json')));
  assert.deepEqual(set.approved_platforms, ['android']);
  assert.deepEqual(set.modules.map(module => module.module_id), [
    'library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1'
  ]);
  const scope = JSON.parse(await readFile(resolve(production, 'modules/library-annual-2026-r1/data/release-scope.json')));
  assert.deepEqual(scope.content, { psalms:150, prayers:18, historical_prayers:12, gospel_books:4, calendar_dates:365 });
  assert.equal(scope.daily_readings.source_recorded_suggestion_dates, 173);
  assert.equal(scope.daily_readings.unresolved_dates, 192);
  assert.equal(scope.daily_readings.complete_liturgical_schedule, false);
  assert.equal(scope.fasting.unknown_rule_dates, 91);
  assert.match(scope.exclusions.backgrounds, /rights inventory/);
  await assert.rejects(validateRelease(production, {
    ...client, platform:'ios', clientVersion:'0.15.0', now:'2026-09-15T12:00:00Z'
  }), error => error instanceof ValidationError && error.code === 'APPROVAL');
});

test('UC-T18 historical Android-only release remains byte-identical', async () => {
  assert.equal(await treeDigest(production), '1393c6281e487998675705ff8ca439631aa9750b2b58130b3a1058d220b714bf');
});

test('production exporter is reproducible from approved bytes and never writes a private key', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-production-'));
  try {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength:2048,
      privateKeyEncoding:{ type:'pkcs8', format:'pem' }
    });
    const privatePath = resolve(temp, 'signing-private.pem');
    const output = resolve(temp, 'release');
    await writeFile(privatePath, privateKey, { mode:0o600 });
    await exec(process.execPath, [resolve(root, 'scripts/export-approved-r1-v2.mjs'), '--out', output, '--private-key', privatePath]);
    const result = await validateRelease(output, {
      ...androidClient, trustedKeyId:'svetlost33-content-2026-key-1', publicKeyPath:resolve(output, 'trusted-public-key.pem'), now:'2026-09-15T12:00:00Z'
    });
    assert.equal(result.modules, 3);
    await assert.rejects(readFile(resolve(output, 'private-key.pem')));
    const sourceManifest = await readFile(resolve(legacy, 'manifest.json'));
    const exportedManifest = await readFile(resolve(output, 'modules/library-annual-2026-r1/evidence/source-release-manifest.json'));
    assert.equal(exportedManifest.equals(sourceManifest), true);
  } finally { await rm(temp, { recursive:true, force:true }); }
});

test('UC-T15/16 shared exporter binds one approval and one immutable release to both clients', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-shared-'));
  try {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength:2048,
      privateKeyEncoding:{ type:'pkcs8', format:'pem' }
    });
    const privatePath = resolve(temp, 'signing-private.pem');
    const output = resolve(temp, 'release');
    await writeFile(privatePath, privateKey, { mode:0o600 });
    await exec(process.execPath, [resolve(root, 'scripts/export-approved-r1-v2.mjs'),
      '--approval-mode', 'shared', '--out', output, '--private-key', privatePath]);
    const client = {
      ...androidClient,
      trustedKeyId:'svetlost33-content-2026-key-1',
      publicKeyPath:resolve(output, 'trusted-public-key.pem'),
      now:'2026-09-15T12:00:00Z'
    };
    const androidResult = await validateRelease(output, client);
    const iosResult = await validateRelease(output, {
      ...client, platform:'ios', clientVersion:'0.1.0'
    });
    assert.deepEqual({ id:androidResult.releaseSetId, sequence:androidResult.sequence, modules:androidResult.modules },
      { id:'shared-annual-2026-r1-m0v2-s2', sequence:2, modules:3 });
    assert.deepEqual(iosResult, androidResult);

    const index = JSON.parse(await readFile(resolve(output, 'index.json')));
    assert.equal(index.channels.production.path, 'releases/shared-annual-2026-r1-m0v2-s2/release-set.json');
    assert.equal(index.channels.production.signature_path, 'releases/shared-annual-2026-r1-m0v2-s2/release-set.sig');
    const set = JSON.parse(await readFile(resolve(output, index.channels.production.path)));
    assert.deepEqual(set.approved_platforms, ['android', 'ios']);
    assert.deepEqual(set.min_clients, { android:10, ios:'0.1.0' });
    assert.ok(set.modules.every(module => module.version === '2026.1.1'));
    assert.ok(set.modules.every(module => module.manifest_path.startsWith(
      'releases/shared-annual-2026-r1-m0v2-s2/modules/')));
    const libraryReference = set.modules.find(module => module.module_id === 'library-annual-2026-r1');
    assert.ok(libraryReference);
    const libraryRoot = resolve(output, dirname(libraryReference.manifest_path));
    const libraryManifest = JSON.parse(await readFile(resolve(libraryRoot, 'manifest.json')));
    assert.equal(libraryManifest.revision, 2);
    const scope = JSON.parse(await readFile(resolve(libraryRoot, 'data/release-scope.json')));
    assert.equal(scope.owner_approval_id, 'shared-annual-2026-r1-2026-09-15');
    assert.deepEqual(scope.approved_platforms, ['android', 'ios']);
    const approval = JSON.parse(await readFile(resolve(libraryRoot, 'evidence/owner-approval.json')));
    assert.equal(approval.approval_id, scope.owner_approval_id);
    assert.deepEqual(approval.consumer_platforms, scope.approved_platforms);

    const sourceManifest = JSON.parse(await readFile(resolve(legacy, 'manifest.json')));
    const payloads = new Map(sourceManifest.files.map(record => [record.path, record]));
    const release = set;
    let unchangedPayloads = 0;
    for (const module of release.modules) {
      const manifest = JSON.parse(await readFile(resolve(output, module.manifest_path)));
      const moduleRoot = dirname(module.manifest_path);
      for (const file of manifest.files) {
        const sourceName = file.path.replace(/^data\//, '');
        const expected = payloads.get(sourceName);
        if (!expected) continue;
        const bytes = await readFile(resolve(output, moduleRoot, file.path));
        assert.equal(bytes.length, expected.bytes, sourceName);
        assert.equal(sha256(bytes), expected.sha256, sourceName);
        unchangedPayloads += 1;
      }
    }
    assert.equal(unchangedPayloads, 13);
    await assert.rejects(validateRelease(output, {
      ...client, platform:'ios', clientVersion:'0.0.9'
    }), error => error instanceof ValidationError && error.code === 'CLIENT_VERSION');
    await assert.rejects(readFile(resolve(output, 'private-key.pem')));
    await assert.rejects(exec(process.execPath, [resolve(root, 'scripts/export-approved-r1-v2.mjs'),
      '--approval-mode', 'shared', '--sequence', '1', '--out', resolve(temp, 'replayed'),
      '--private-key', privatePath]), /immutable at sequence 2/);
    await assert.rejects(exec(process.execPath, [resolve(root, 'scripts/export-approved-r1-v2.mjs'),
      '--approval-mode', 'shared', '--sequence', '3', '--out', resolve(temp, 'reused-path'),
      '--private-key', privatePath]), /immutable at sequence 2/);
  } finally { await rm(temp, { recursive:true, force:true }); }
});

test('UC-T18 shared export is reproducible and changed source bytes cannot reuse the approval', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-shared-repeat-'));
  try {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength:2048,
      privateKeyEncoding:{ type:'pkcs8', format:'pem' }
    });
    const privatePath = resolve(temp, 'ephemeral-private.pem');
    const first = resolve(temp, 'first');
    const second = resolve(temp, 'second');
    await writeFile(privatePath, privateKey, { mode:0o600 });
    const args = output => [resolve(root, 'scripts/export-approved-r1-v2.mjs'),
      '--approval-mode', 'shared', '--out', output, '--private-key', privatePath];
    await exec(process.execPath, args(first));
    await exec(process.execPath, args(second));

    const firstFiles = (await walkFiles(first)).map(path => path.slice(first.length + 1)).sort();
    const secondFiles = (await walkFiles(second)).map(path => path.slice(second.length + 1)).sort();
    assert.deepEqual(secondFiles, firstFiles);
    // RSA-PSS signatures intentionally contain random salt. Every other export
    // byte, including the signed documents and public key, is reproducible.
    for (const path of firstFiles.filter(path => !path.endsWith('.sig'))) {
      assert.equal((await readFile(resolve(first, path))).equals(await readFile(resolve(second, path))), true, path);
    }
    const client = {
      ...androidClient, trustedKeyId:'svetlost33-content-2026-key-1',
      publicKeyPath:resolve(first, 'trusted-public-key.pem'), now:'2026-09-15T12:00:00Z'
    };
    assert.equal((await validateRelease(first, client)).sequence, 2);
    assert.equal((await validateRelease(second, { ...client,
      publicKeyPath:resolve(second, 'trusted-public-key.pem') })).sequence, 2);

    const tamperedSource = resolve(temp, 'tampered-source');
    await cp(legacy, tamperedSource, { recursive:true });
    const tamperedPsalm = resolve(tamperedSource, 'payload/psalms.sr-Cyrl.json');
    await writeFile(tamperedPsalm, Buffer.concat([await readFile(tamperedPsalm), Buffer.from(' ')]));
    await assert.rejects(exec(process.execPath, [
      ...args(resolve(temp, 'rejected')), '--source', tamperedSource
    ]), /length|SHA-256/);
  } finally { await rm(temp, { recursive:true, force:true }); }
});

test('development RC wraps every approved annual r1 payload byte into three iOS-compatible modules', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-development-'));
  try {
    await exec(process.execPath, [resolve(root, 'scripts/generate-development-rc.mjs'), '--out', temp]);
    const result = await validateRelease(temp, {
      ...androidClient,
      trustedKeyId: 'svetlost33-development-key-1',
      platform: 'ios', clientVersion: '0.15.0', channel: 'development'
    });
    assert.deepEqual({ id:result.releaseSetId, modules:result.modules },
      { id:'development-annual-2026-r1', modules:3 });
    const provenance = JSON.parse(await readFile(resolve(temp, 'development-provenance.json')));
    assert.equal(provenance.production_release, false);
    assert.deepEqual(provenance.excluded_modules, ['backgrounds']);
    const release = JSON.parse(await readFile(resolve(temp, 'release-set.json')));
    const copied = [];
    for (const module of release.modules) {
      const manifest = JSON.parse(await readFile(resolve(temp, module.manifest_path)));
      const moduleRoot = dirname(module.manifest_path);
      for (const file of manifest.files) {
        const name = file.path.replace(/^data\//, '');
        const actual = await readFile(resolve(temp, moduleRoot, file.path));
        const expected = await readFile(resolve(legacy, 'payload', name));
        assert.equal(actual.equals(expected), true, name);
        copied.push(name);
      }
    }
    assert.deepEqual(copied.sort(), JSON.parse(await readFile(resolve(legacy, 'manifest.json')))
      .files.map(record => record.path).sort());
    await assert.rejects(readFile(resolve(temp, 'private-key.pem')));
  } finally { await rm(temp, { recursive:true, force:true }); }
});

test('every frozen negative fixture is rejected for its expected reason', async t => {
  const matrix = JSON.parse(await readFile(resolve(root, 'fixtures/v2/negative/cases.json')));
  for (const scenario of matrix.cases) await t.test(scenario.id, async () => {
    const temp = await mkdtemp(resolve(tmpdir(), `svetlost33-v2-${scenario.id}-`));
    try {
      await exec(process.execPath, [resolve(root, 'scripts/generate-v2-fixtures.mjs'), '--out', temp, '--scenario', scenario.id]);
      await assert.rejects(validateRelease(temp, androidClient), error => error instanceof ValidationError && error.code === scenario.expected_code);
    } finally { await rm(temp, { recursive:true, force:true }); }
  });
});

test('older network sequence is rejected without touching package bytes', async () => {
  await assert.rejects(validateRelease(positive, { ...androidClient, minimumSequence:2 }), error => error instanceof ValidationError && error.code === 'REPLAY');
});

test('client compatibility is enforced for Android, iOS and required capabilities', async () => {
  await assert.rejects(validateRelease(positive, { ...androidClient, clientVersion:9 }), error => error instanceof ValidationError && error.code === 'CLIENT_VERSION');
  await assert.rejects(validateRelease(positive, { ...androidClient, clientCapabilities:androidClient.clientCapabilities.filter(value => value !== 'calendar-v1') }), error => error instanceof ValidationError && error.code === 'CAPABILITY');
  const withoutBackgrounds = await validateRelease(positive, { ...androidClient, clientCapabilities:androidClient.clientCapabilities.filter(value => value !== 'background-catalog-v1') });
  assert.equal(withoutBackgrounds.modules, 3);
  assert.deepEqual(withoutBackgrounds.skippedOptionalModules, ['backgrounds-core']);
  assert.equal((await validateRelease(positive, { ...androidClient, platform:'ios', clientVersion:'0.15.0' })).modules, 4);
  await assert.rejects(validateRelease(positive, { ...androidClient, platform:'ios', clientVersion:'0.14.9' }), error => error instanceof ValidationError && error.code === 'CLIENT_VERSION');
});

test('index time interval includes issued_at and excludes expires_at', async () => {
  assert.equal((await validateRelease(positive, { ...androidClient, now:'2026-09-15T00:00:00Z' })).sequence, 1);
  await assert.rejects(validateRelease(positive, { ...androidClient, now:'2099-09-15T00:00:00Z' }), error => error instanceof ValidationError && error.code === 'TIME');
});

test('unsupported optional module skips even a corrupt payload after signed manifest verification', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-v2-optional-corrupt-'));
  try {
    await exec(process.execPath, [resolve(root, 'scripts/generate-v2-fixtures.mjs'), '--out', temp, '--scenario', 'corrupt-media']);
    const result = await validateRelease(temp, { ...androidClient, clientCapabilities:androidClient.clientCapabilities.filter(value => value !== 'background-catalog-v1') });
    assert.equal(result.modules, 3);
    assert.deepEqual(result.skippedOptionalModules, ['backgrounds-core']);
  } finally { await rm(temp, { recursive:true, force:true }); }
});
