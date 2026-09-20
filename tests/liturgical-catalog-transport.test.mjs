import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { CATALOG_MODULE, catalogDependencies } from '../scripts/validate-liturgical-catalog-v1.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const candidateBytes = await readFile(new URL('../fixtures/liturgical-catalog-v1/catalog-candidate.json', import.meta.url));
const candidate = JSON.parse(candidateBytes);
const dependencies = catalogDependencies(candidate);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

test('Node reference transport for an optional liturgical catalog alongside annual, calendar and saints modules', async t => {
  // These assertions describe validate-m0-v2.mjs, not either native client's
  // optional-module recovery policy. The draft catalog is opaque JSON here;
  // transport success does not constitute editorial approval or publication.
  const directory = await mkdtemp(resolve(tmpdir(), 'svetlost33-catalog-node-transport-'));
  const keyId = 'liturgical-catalog-ephemeral-test-key';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const entries = [];
  const catalogRoot = `modules/${CATALOG_MODULE.module_id}`;
  const catalogPath = `${catalogRoot}/${CATALOG_MODULE.payload_path}`;
  const catalogSignaturePath = `${catalogRoot}/manifest.sig`;
  const platforms = ['android', 'ios'];
  const signature = bytes => Buffer.from(`${sign('sha256', bytes, {
    key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32
  }).toString('base64')}\n`, 'ascii');
  const put = async (path, bytes) => {
    const target = resolve(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  };

  async function addModule({ id, type, capabilities, path, bytes, required, dependencies = [], version = '2026.1.1', revision = 1 }) {
    const base = `modules/${id}`;
    const manifest = encode({
      schema_version: 'svetlost33-module-manifest-2', module_id: id,
      module_type: type, version, revision, key_id: keyId, capabilities, dependencies,
      files: [{ path, bytes: bytes.length, sha256: hash(bytes), content_type: 'application/json', encoding: 'utf-8' }]
    });
    await put(`${base}/${path}`, bytes);
    await put(`${base}/manifest.json`, manifest);
    await put(`${base}/manifest.sig`, signature(manifest));
    const entry = {
      module_id: id, module_type: type, version, required,
      manifest_path: `${base}/manifest.json`, manifest_bytes: manifest.length,
      manifest_sha256: hash(manifest), signature_path: `${base}/manifest.sig`
    };
    const existing = entries.findIndex(value => value.module_id === id);
    if (existing < 0) entries.push(entry);
    else entries[existing] = entry;
  }

  async function envelopes() {
    const release = encode({
      schema_version: 'svetlost33-release-set-2', release_set_id: 'liturgical-catalog-node-transport-test',
      sequence: 1, channel: 'development', key_id: keyId,
      approved_platforms: platforms, min_clients: { android: 35, ios: '0.1.0' }, modules: entries
    });
    await put('release-set.json', release);
    await put('release-set.sig', signature(release));
    const index = encode({
      schema_version: 'svetlost33-m0-index-2', sequence: 1,
      issued_at: '2026-09-20T00:00:00Z', expires_at: '2026-09-22T00:00:00Z', key_id: keyId,
      channels: { development: {
        release_set_id: 'liturgical-catalog-node-transport-test', path: 'release-set.json',
        bytes: release.length, sha256: hash(release), signature_path: 'release-set.sig'
      } }
    });
    await put('index.json', index);
    await put('index.sig', signature(index));
  }

  const options = (platform, supportsCatalog) => ({
    publicKeyPath: resolve(directory, 'trusted-public-key.pem'), trustedKeyId: keyId,
    platform, clientVersion: platform === 'android' ? 35 : '0.1.0',
    now: '2026-09-20T12:00:00Z', channel: 'development',
    clientCapabilities: ['library-v1', 'calendar-v1', 'saints-v1', ...(supportsCatalog ? CATALOG_MODULE.capabilities : [])]
  });
  async function catalog(catalogDependencies = dependencies) {
    await addModule({
      id: CATALOG_MODULE.module_id, type: CATALOG_MODULE.module_type,
      capabilities: CATALOG_MODULE.capabilities, path: CATALOG_MODULE.payload_path,
      bytes: candidateBytes, required: CATALOG_MODULE.required,
      version: candidate.version, revision: candidate.revision, dependencies: catalogDependencies
    });
    await envelopes();
  }
  const assertSkipped = result => {
    assert.equal(result.modules, 3);
    assert.equal(result.verifiedModules, 4);
    assert.deepEqual(result.skippedOptionalModules, [CATALOG_MODULE.module_id]);
  };

  try {
    await put('trusted-public-key.pem', publicKey.export({ type: 'spki', format: 'pem' }));
    for (const [id, type, capability] of [
      ['library-annual-2026-r1', 'library', 'library-v1'],
      ['calendar-2026-r1', 'calendar', 'calendar-v1'],
      ['saints-v1', 'library', 'saints-v1']
    ]) {
      await addModule({ id, type, capabilities: [capability], path: 'data/transport-only.json',
        bytes: encode({ transport_test_only: true, module_id: id }), required: id !== 'saints-v1',
        version: dependencies.find(dependency => dependency.module_id === id)?.version ?? '2026.1.1' });
    }
    await catalog();

    await t.test('Node reference transport accepts three distinct library modules and skips only the unsupported catalog', async () => {
      assert.equal(entries.filter(entry => entry.module_type === 'library').length, 3);
      for (const platform of platforms) {
        const supported = await validateRelease(directory, options(platform, true));
        assert.equal(supported.modules, 4);
        assert.equal(supported.verifiedModules, 4);
        assert.deepEqual(supported.skippedOptionalModules, []);
        assertSkipped(await validateRelease(directory, options(platform, false)));
      }
    });

    await t.test('Node reference transport skips an unsupported catalog payload and its missing dependency', async () => {
      try {
        await catalog([{ module_id: 'calendar-2027-missing', version: '2027.1.0' }]);
        await rm(resolve(directory, catalogPath));
        for (const platform of platforms) assertSkipped(await validateRelease(directory, options(platform, false)));
      } finally { await catalog(); }
    });

    await t.test('Node reference transport rejects a supported catalog with a missing declared dependency', async () => {
      try {
        await catalog([{ module_id: 'calendar-2027-missing', version: '2027.1.0' }]);
        for (const platform of platforms) {
          await assert.rejects(validateRelease(directory, options(platform, true)), { code: 'DEPENDENCY' });
        }
      } finally { await catalog(); }
    });

    await t.test('Node reference transport rejects a supported catalog hash mismatch while unsupported clients skip its payload', async () => {
      try {
        const corrupted = Buffer.from(candidateBytes);
        corrupted[0] ^= 1;
        await put(catalogPath, corrupted);
        for (const platform of platforms) {
          await assert.rejects(validateRelease(directory, options(platform, true)), { code: 'HASH' });
          assertSkipped(await validateRelease(directory, options(platform, false)));
        }
      } finally { await put(catalogPath, candidateBytes); }
    });

    await t.test('Node reference transport rejects an invalid catalog manifest signature even when its capability is unsupported', async () => {
      try {
        await put(catalogSignaturePath, Buffer.from('AAAA\n', 'ascii'));
        for (const platform of platforms) for (const supportsCatalog of [true, false]) {
          await assert.rejects(validateRelease(directory, options(platform, supportsCatalog)), { code: 'SIGNATURE' });
        }
      } finally { await catalog(); }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
