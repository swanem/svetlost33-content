import assert from 'node:assert/strict';
import { constants, createHash, verify } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { ValidationError, validateRelease } from '../scripts/validate-m0-v2.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const android = resolve(root, '../svetlost33-github');
const legacy = resolve(root, 'releases/legacy/annual-2026-r1');
const positive = resolve(root, 'fixtures/v2/positive/release');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
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
