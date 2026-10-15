#!/usr/bin/env node
// Local test artifacts only. A fresh RSA key lives in memory; only its public half is exported.
import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const CORPUS = 'fixtures/ks01-capacity-2026-10-06/generated';
export const BASE = 'releases/v2/production';
export const RELEASE = `${BASE}/releases/shared-calendar-saints-2026-10-02-m0v2-s12/release-set.json`;
export const KEY_ID = 'ks01-test-transport-key-1';
export const TEST_NOW = '2026-10-06T12:00:00Z';
export const CLIENTS = { old: { android: 1000, ios: '99.0.0' }, expanded: { android: 1001, ios: '99.0.1' } };
export const SETS = [
  { name: 'baseline62', source: 'baseline-62', count: 62, sequence: 100, expanded: false, manifest: '4dac3598d340d87d0690112e20b41b986f6039910c8efee0b6b835241dad1812' },
  { name: 'packageA', source: 'package-a-test-view', count: 62, sequence: 101, expanded: false, manifest: 'da31d9a3206f70836d9c207a13c27a2880de91fb47ba3c828b197703425b7b9b' },
  { name: 'synthetic104', source: 'synthetic-104', count: 104, sequence: 102, expanded: true, manifest: '6606022609b65f1d6eab10b147b9c590448ff5926cbb29c595b397b4925d255d' },
  { name: 'synthetic366', source: 'synthetic-366', count: 366, sequence: 103, expanded: true, manifest: 'c043f0bf2ab9ec4045375e6d92af9f06907bdb30737142ece839e15f2e89e0a6' },
];
export const IDS = { library: 'library-annual-2026-r1', cycles: 'daily-cycles-r1', calendar: 'calendar-2026-r1', saints: 'saints-v1', catalog: 'liturgical-catalog-v1', browser: 'calendar-browser-v1' };
export const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
export const WARNING = 'TEST_ONLY_LOCAL_RSA_PSS_NOT_PRODUCTION_TRUST_NOT_CONTENT_APPROVAL_NEVER_PUBLISH';

export async function writeNew(outputs) {
  for (const path of outputs.keys()) {
    assert.ok(resolve(HERE, path).startsWith(`${HERE}/`));
    await access(resolve(HERE, path)).then(() => assert.fail(`Refusing overwrite: ${path}`), error => { if (error.code !== 'ENOENT') throw error; });
  }
  for (const [path, bytes] of outputs) {
    const target = resolve(HERE, path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
}

export async function generate() {
  const inputs = new Map();
  const get = async (path, expected) => {
    const bytes = await readFile(resolve(ROOT, path));
    if (expected) assert.equal(hash(bytes), expected, path);
    inputs.set(path, record(path, bytes)); return bytes;
  };
  const release = JSON.parse(await get(RELEASE, '78142e24f74812be9859b88163203de23517a9ed40a16c0f5ee085e25354255d'));
  await get('../svetlost33-github/docs/contracts/calendar-saints-expansion-2026-10-06/capacity-decision-r1.json', '5452b8728adad35a1fc300ec04967a3b70d3cac3a175b06136c9aff39b0c781b');
  const sourceModules = new Map();
  for (const id of Object.values(IDS)) {
    const entry = release.modules.find(item => item.module_id === id); assert.ok(entry);
    const manifestPath = `${BASE}/${entry.manifest_path}`;
    const manifest = JSON.parse(await get(manifestPath, entry.manifest_sha256));
    const files = new Map();
    for (const file of manifest.files) {
      const raw = await get(`${dirname(manifestPath)}/${file.path}`, file.sha256);
      assert.equal(raw.length, file.bytes); files.set(file.path, raw);
    }
    sourceModules.set(id, { entry, manifest, files });
  }
  // No production key file is opened. KeyObjects cannot accidentally be included in JSON receipts.
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }));
  const signature = bytes => Buffer.from(sign('sha256', bytes, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64') + '\n');
  const outputs = new Map([['trusted-public-key.pem', publicPem]]), datasets = [];
  for (const set of SETS) {
    const corpusManifest = JSON.parse(await get(`${CORPUS}/${set.source}/manifest.json`, set.manifest));
    const raw = {};
    for (const kind of ['saints', 'catalog', 'browser']) {
      const basename = `${IDS[kind]}.json`, path = `${CORPUS}/${set.source}/${basename}`;
      const pin = corpusManifest.files.find(file => file.path === `${set.source}/${basename}`); assert.ok(pin);
      raw[kind] = await get(path, pin.sha256); assert.equal(raw[kind].length, pin.bytes);
    }
    const modules = new Map(), tree = new Map(), deltas = [];
    const emitModule = (id, payloads, changes = {}) => {
      const source = sourceModules.get(id), manifest = { ...structuredClone(source.manifest), key_id: KEY_ID, ...changes };
      manifest.files = [...payloads].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes), content_type: 'application/json', encoding: 'utf-8' }));
      const manifestBytes = json(manifest), prefix = `modules/${id}`;
      tree.set(`${prefix}/manifest.json`, manifestBytes); tree.set(`${prefix}/manifest.sig`, signature(manifestBytes));
      for (const [path, bytes] of payloads) tree.set(`${prefix}/${path}`, bytes);
      const entry = { module_id: id, module_type: manifest.module_type, version: manifest.version, required: source.entry.required,
        manifest_path: `${prefix}/manifest.json`, manifest_bytes: manifestBytes.length, manifest_sha256: hash(manifestBytes), signature_path: `${prefix}/manifest.sig` };
      modules.set(id, { entry, manifest });
      return { entry, manifest };
    };
    for (const id of [IDS.library, IDS.cycles, IDS.calendar]) emitModule(id, sourceModules.get(id).files);
    const saints = JSON.parse(raw.saints), catalog = JSON.parse(raw.catalog), browser = JSON.parse(raw.browser);
    assert.equal(saints.articles.length, set.count);
    emitModule(IDS.saints, new Map([['data/saints-v1.json', raw.saints]]), { version: saints.version, revision: saints.revision,
      dependencies: [{ module_id: saints.calendar_binding.module_id, version: saints.calendar_binding.version }] });
    const dependencies = new Map();
    for (const binding of [...catalog.calendar_bindings, ...catalog.article_bindings]) {
      if (dependencies.has(binding.module_id)) assert.equal(dependencies.get(binding.module_id), binding.version);
      dependencies.set(binding.module_id, binding.version);
    }
    emitModule(IDS.catalog, new Map([['data/liturgical-catalog-v1.json', raw.catalog]]), { version: catalog.version, revision: catalog.revision,
      dependencies: [...dependencies].sort(([a], [b]) => a.localeCompare(b)).map(([module_id, version]) => ({ module_id, version })) });
    browser.archive_bindings.forEach((binding, i) => {
      for (const field of ['library_binding', 'cycles_binding']) {
        const target = modules.get(binding[field].module_id); assert.ok(target);
        assert.equal(binding[field].version, target.manifest.version); assert.equal(binding[field].revision, target.manifest.revision);
        const before = binding[field].manifest_sha256, after = target.entry.manifest_sha256;
        assert.equal(before, sourceModules.get(binding[field].module_id).entry.manifest_sha256);
        binding[field].manifest_sha256 = after;
        deltas.push({ json_pointer: `/archive_bindings/${i}/${field}/manifest_sha256`, before, after,
          reason: 'New test-only key_id changes signed core manifest bytes; bind archive to the actual test-signed manifest.' });
      }
    });
    const browserRaw = json(browser);
    emitModule(IDS.browser, new Map([['data/calendar-browser-v1.json', browserRaw]]), { version: browser.version, revision: browser.revision });
    const releaseId = `test-ks01-${set.name.toLowerCase()}-${set.sequence}`;
    const releaseBytes = json({ schema_version: 'svetlost33-release-set-2', release_set_id: releaseId, sequence: set.sequence,
      channel: 'production', key_id: KEY_ID, approved_platforms: ['android', 'ios'],
      min_clients: set.expanded ? CLIENTS.expanded : CLIENTS.old, modules: [...modules.values()].map(value => value.entry) });
    tree.set('release-set.json', releaseBytes); tree.set('release-set.sig', signature(releaseBytes));
    const indexBytes = json({ schema_version: 'svetlost33-m0-index-2', sequence: set.sequence, issued_at: '2026-10-06T00:00:00Z',
      expires_at: '2026-10-07T00:00:00Z', key_id: KEY_ID, channels: { production: { release_set_id: releaseId, path: 'release-set.json',
        bytes: releaseBytes.length, sha256: hash(releaseBytes), signature_path: 'release-set.sig' } } });
    tree.set('index.json', indexBytes); tree.set('index.sig', signature(indexBytes));
    for (const [path, bytes] of tree) outputs.set(`${set.name}/${path}`, bytes);
    datasets.push({ name: set.name, source_dataset: set.source, articles: set.count, sequence: set.sequence, release_set_id: releaseId,
      min_clients: set.expanded ? CLIENTS.expanded : CLIENTS.old, source_manifest_sha256: set.manifest,
      index_sha256: hash(indexBytes), release_sha256: hash(releaseBytes),
      modules: [...modules.values()].map(({ entry, manifest }) => ({ ...entry, revision: manifest.revision, payloads: manifest.files })),
      browser_derivative: { source_sha256: hash(raw.browser), output_sha256: hash(browserRaw), changes: deltas,
        archive_days_unchanged: true, feast_memberships_unchanged: true, catalog_binding_unchanged: true },
      files: [...tree].map(([path, bytes]) => record(path, bytes)) });
  }
  const marker = { warning: WARNING, publishable: false, production_signature: false, owner_approval: false,
    local_test_signature: 'RSA-PSS SHA-256, 2048-bit, saltLength 32; fresh ephemeral private KeyObject never serialized',
    key_id: KEY_ID, fixed_test_time: TEST_NOW, channel: 'production',
    channel_note: 'Native wire-compatible channel name only. This directory is not a production endpoint.',
    clients: CLIENTS, sequences: SETS.map(({ name, sequence }) => ({ name, sequence })),
    inputs_note: 'Approved core payload bytes and historical evidence are reused unchanged; they do not approve synthetic content or this test release.' };
  outputs.set('TEST-ONLY.json', json(marker));
  const sourceHashes = Object.fromEntries(await Promise.all(['generate.mjs', 'verify.mjs', 'README.md'].map(async path => [path, hash(await readFile(resolve(HERE, path)))])));
  outputs.set('handoff.json', json({ schema_version: 'svetlost33-ks01-signed-transport-1', status: 'GENERATED_TEST_ONLY_VERIFY_BEFORE_NATIVE_USE',
    warning: WARNING, key_id: KEY_ID, trusted_public_key_sha256: hash(publicPem), fixed_test_time: TEST_NOW, channel: 'production',
    clients: CLIENTS, datasets, inputs: [...inputs.values()], generator_sources: sourceHashes,
    transport_format: 'Each dataset directory is an independent flat relative-path -> raw bytes map for ModularSignedPackage(files:) or an Android HTTP-map downloader; use the common external public key and fixed clock.',
    excluded: ['contexts.json', 'production private keys', 'production endpoint writes', 'new owner approval', 'native code/build/test execution'],
    native_gates: ['Real native signature/fetch/install/project/repository acceptance', 'old-client whole-release rejection and compatible generation/preferences retention', 'restart/offline/interrupted-update', 'native performance gates'],
    derivative_rule: 'Only browser archive library/cycles manifest_sha256 values differ from each pinned capacity corpus. Core payloads, saints and catalog bytes remain exact. Core manifests use test key_id; expanded manifest version/revision/dependencies/file records follow exact payload bindings.',
    no_private_key_saved: true, publication_authorized: false }));
  for (const input of inputs.values()) assert.equal(hash(await readFile(resolve(ROOT, input.path))), input.sha256);
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--write-new'], 'Usage: generate.mjs --write-new (refuses overwrite; signatures intentionally nondeterministic)');
  await access(resolve(HERE, 'handoff.json')).then(() => assert.fail('Frozen handoff exists; use verify.mjs --check, not regeneration.'), error => { if (error.code !== 'ENOENT') throw error; });
  const outputs = await generate(); await writeNew(outputs);
  console.log(JSON.stringify({ status: 'GENERATED_TEST_ONLY', files: outputs.size, handoff_sha256: hash(outputs.get('handoff.json')), private_key_saved: false }));
}
