#!/usr/bin/env node
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const valueAfter = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const source = resolve(valueAfter('--source') ?? resolve(root, 'releases/legacy/annual-2026-r1'));
const out = resolve(valueAfter('--out') ?? resolve(root, 'build/development-rc'));
const keyId = 'svetlost33-development-key-1';
const releaseSetId = 'development-annual-2026-r1';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const signature = (bytes, privateKey) => Buffer.from(`${sign('sha256', bytes, {
  key: privateKey,
  padding: constants.RSA_PKCS1_PSS_PADDING,
  saltLength: 32
}).toString('base64')}\n`, 'ascii');
const put = async (path, bytes) => {
  const target = resolve(out, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return bytes;
};
const safePayloadName = name => /^[a-z0-9][A-Za-z0-9.-]{1,80}\.json$/.test(name);

const legacyManifestBytes = await readFile(resolve(source, 'manifest.json'));
const legacyManifest = JSON.parse(legacyManifestBytes);
if (legacyManifest.package_id !== 'svetlost33-annual-2026-r1'
    || legacyManifest.revision !== 1 || legacyManifest.files?.length !== 13) {
  throw new Error('Unexpected legacy annual-2026-r1 source');
}
const sourceRecords = new Map(legacyManifest.files.map(record => [record.path, record]));
if (sourceRecords.size !== legacyManifest.files.length
    || [...sourceRecords.keys()].some(name => !safePayloadName(name))) {
  throw new Error('Unsafe or duplicate legacy payload path');
}

const moduleDefinitions = [
  {
    id: 'library-core', type: 'library', version: '2026.1.0', required: true,
    capabilities: ['library-v1', 'sr-Cyrl', 'sr-Latn'], dependencies: [],
    files: [
      'gospels.sr-Cyrl.json', 'gospels.sr-Latn.json',
      'licenses.sr-Cyrl.json', 'licenses.sr-Latn.json',
      'prayers.sr-Cyrl.json', 'prayers.sr-Latn.json',
      'psalms.sr-Cyrl.json', 'psalms.sr-Latn.json',
      'sources.sr-Cyrl.json', 'sources.sr-Latn.json'
    ]
  },
  {
    id: 'daily-cycles', type: 'cycles', version: '2026.1.0', required: true,
    capabilities: ['cycle-v1'], dependencies: [{ module_id: 'library-core', version: '2026.1.0' }],
    files: ['legacy-cycle.sr-Cyrl.json', 'legacy-cycle.sr-Latn.json']
  },
  {
    id: 'calendar-2026', type: 'calendar', version: '2026.1.0', required: true,
    capabilities: ['calendar-v1', 'explicit-unknown'],
    dependencies: [{ module_id: 'library-core', version: '2026.1.0' }],
    files: ['calendar.2026.json']
  }
];
const assigned = moduleDefinitions.flatMap(module => module.files);
if (assigned.length !== 13 || new Set(assigned).size !== 13
    || assigned.some(name => !sourceRecords.has(name))) {
  throw new Error('Development module partition does not cover the legacy payload exactly');
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
await put('trusted-public-key.pem', Buffer.from(publicKey, 'ascii'));

const moduleEntries = [];
for (const module of moduleDefinitions) {
  const moduleRoot = `modules/${module.id}`;
  const files = [];
  for (const name of module.files) {
    const record = sourceRecords.get(name);
    const bytes = await readFile(resolve(source, 'payload', name));
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
      throw new Error(`Legacy payload hash mismatch: ${name}`);
    }
    await put(`${moduleRoot}/data/${name}`, bytes);
    files.push({ path: `data/${name}`, bytes: bytes.length, sha256: sha256(bytes),
      content_type: 'application/json', encoding: 'utf-8' });
  }
  const manifest = json({ schema_version: 'svetlost33-module-manifest-2',
    module_id: module.id, module_type: module.type, version: module.version, revision: 1,
    key_id: keyId, capabilities: module.capabilities, dependencies: module.dependencies, files });
  await put(`${moduleRoot}/manifest.json`, manifest);
  await put(`${moduleRoot}/manifest.sig`, signature(manifest, privateKey));
  moduleEntries.push({ module_id: module.id, module_type: module.type, version: module.version,
    required: module.required, manifest_path: `${moduleRoot}/manifest.json`,
    manifest_bytes: manifest.length, manifest_sha256: sha256(manifest),
    signature_path: `${moduleRoot}/manifest.sig` });
}

const releaseSet = json({ schema_version: 'svetlost33-release-set-2', release_set_id: releaseSetId,
  sequence: 1, channel: 'development', key_id: keyId, approved_platforms: ['android', 'ios'],
  min_clients: { android: 10, ios: '0.15.0' }, modules: moduleEntries });
await put('release-set.json', releaseSet);
await put('release-set.sig', signature(releaseSet, privateKey));
const index = json({ schema_version: 'svetlost33-m0-index-2', sequence: 1,
  issued_at: '2026-09-15T00:00:00Z', expires_at: '2099-09-15T00:00:00Z', key_id: keyId,
  channels: { development: { release_set_id: releaseSetId, path: 'release-set.json',
    bytes: releaseSet.length, sha256: sha256(releaseSet), signature_path: 'release-set.sig' } } });
await put('index.json', index);
await put('index.sig', signature(index, privateKey));
await put('development-provenance.json', json({ schema_version: 'svetlost33-development-provenance-1',
  production_release: false, source_package_id: legacyManifest.package_id,
  source_manifest_sha256: sha256(legacyManifestBytes), source_payload_files: 13,
  modules: moduleDefinitions.map(module => module.id), excluded_modules: ['backgrounds'],
  exclusion_reason: 'background migration requires per-asset inventory and approval',
  signing: 'ephemeral test key; private key is never written' }));

console.log(`Generated three-module development RC at ${out}; private key was not written.`);
