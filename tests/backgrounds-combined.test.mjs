import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { DEVELOPMENT_COMBINED_KEY_ID, generateDevelopmentCombined } from '../scripts/generate-development-combined.mjs';
import { ValidationError, validateRelease } from '../scripts/validate-m0-v2.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, '../svetlost33-github');
const legacy = resolve(root, 'releases/legacy/annual-2026-r1');
const approvalRoot = resolve(root, 'approvals/shared-backgrounds-v1-2026-09-16');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const coreCapabilities = ['library-v1', 'sr-Cyrl', 'sr-Latn', 'cycle-v1', 'calendar-v1', 'explicit-unknown'];
const client = (out, platform = 'android', supportsBackgrounds = true) => ({
  publicKeyPath: resolve(out, 'trusted-public-key.pem'),
  trustedKeyId: DEVELOPMENT_COMBINED_KEY_ID,
  platform, clientVersion: platform === 'android' ? 10 : '0.1.0',
  clientCapabilities: supportsBackgrounds ? [...coreCapabilities, 'background-catalog-v1'] : coreCapabilities,
  channel: 'development', now: '2026-09-16T12:00:00Z'
});
const walkFiles = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files.sort();
};
const treeDigest = async directory => {
  const hash = createHash('sha256');
  for (const file of await walkFiles(directory)) {
    hash.update(file.slice(directory.length + 1)); hash.update('\0');
    hash.update(sha256(await readFile(file))); hash.update('\n');
  }
  return hash.digest('hex');
};

test('combined development release preserves annual r1 and optional approved backgrounds under one key', async t => {
  const temp = await realpath(await mkdtemp(resolve(tmpdir(), 'svetlost33-backgrounds-combined-')));
  const out = resolve(temp, 'release');
  const production = resolve(root, 'releases/v2/production');
  const productionBefore = await treeDigest(production);
  try {
    await generateDevelopmentCombined({ sourceRoot, contentRoot: root, out });
    const index = await readJSON(resolve(out, 'index.json'));
    assert.deepEqual(Object.keys(index.channels), ['development']);
    assert.equal(index.key_id, DEVELOPMENT_COMBINED_KEY_ID);
    assert.equal(index.sequence, 1);
    const release = await readJSON(resolve(out, index.channels.development.path));
    assert.equal(release.channel, 'development');
    assert.equal(release.sequence, 1);
    assert.equal(release.key_id, DEVELOPMENT_COMBINED_KEY_ID);
    assert.deepEqual(release.approved_platforms, ['android', 'ios']);
    assert.deepEqual(release.min_clients, { android: 10, ios: '0.1.0' });
    assert.deepEqual(release.modules.map(module => [module.module_id, module.module_type, module.required]), [
      ['library-core', 'library', true], ['daily-cycles', 'cycles', true],
      ['calendar-2026', 'calendar', true], ['backgrounds-v1', 'backgrounds', false]
    ]);
    const modules = new Map();
    for (const entry of release.modules) {
      const manifest = await readJSON(resolve(out, entry.manifest_path));
      assert.equal(manifest.key_id, DEVELOPMENT_COMBINED_KEY_ID, entry.module_id);
      modules.set(entry.module_id, { manifest, directory: dirname(resolve(out, entry.manifest_path)) });
    }
    const backgrounds = modules.get('backgrounds-v1');

    await t.test('all 13 annual payload files remain byte-identical to their approved source', async () => {
      const sourceManifest = await readJSON(resolve(legacy, 'manifest.json'));
      const sourceRecords = new Map(sourceManifest.files.map(file => [file.path, file]));
      const copied = [];
      for (const [id, { manifest, directory }] of modules) {
        if (id === 'backgrounds-v1') continue;
        for (const file of manifest.files) {
          assert.ok(file.path.startsWith('data/'), file.path);
          const sourcePath = file.path.slice('data/'.length);
          const approved = sourceRecords.get(sourcePath);
          assert.ok(approved, file.path);
          const bytes = await readFile(resolve(directory, file.path));
          assert.equal(bytes.length, approved.bytes, sourcePath);
          assert.equal(sha256(bytes), approved.sha256, sourcePath);
          assert.ok(bytes.equals(await readFile(resolve(legacy, 'payload', sourcePath))), sourcePath);
          copied.push(sourcePath);
        }
      }
      assert.equal(copied.length, 13);
      assert.deepEqual(copied.sort(), [...sourceRecords.keys()].sort());
    });

    await t.test('background catalog and evidence retain the exact approved artwork identities', async () => {
      assert.equal(backgrounds.manifest.version, '1.0.0');
      assert.deepEqual(backgrounds.manifest.dependencies, []);
      assert.deepEqual(backgrounds.manifest.capabilities, ['background-catalog-v1']);
      assert.equal(backgrounds.manifest.files.length, 42);
      const files = new Map(backgrounds.manifest.files.map(file => [file.path, file]));
      const catalog = await readJSON(resolve(backgrounds.directory, 'data/catalog-v1.json'));
      const sourceCatalog = await readJSON(resolve(approvalRoot, 'catalog.json'));
      const sourceManifest = await readJSON(resolve(approvalRoot, 'source-manifest.json'));
      assert.deepEqual(catalog.defaultIDs, sourceCatalog.defaultIds);
      assert.deepEqual(catalog.items.map(item => item.id), sourceCatalog.items.map(item => item.id));
      assert.equal(catalog.provenance.canonicalCatalog.sha256,
        sha256(await readFile(resolve(approvalRoot, 'catalog.json'))));
      for (const item of catalog.items) {
        const approved = sourceManifest.assets.find(asset => asset.id === item.id);
        const original = files.get(`media/${item.assetPath}`);
        assert.ok(original, item.id);
        assert.equal(item.sha256, approved.sha256, item.id);
        assert.equal(original.sha256, approved.sha256, item.id);
        assert.equal(original.bytes, approved.bytes, item.id);
      }
      for (const [destination, source] of [
        ['evidence/owner-approval.json', resolve(approvalRoot, 'approval.json')],
        ['evidence/source-manifest.json', resolve(approvalRoot, 'source-manifest.json')],
        ['evidence/approved-catalog.json', resolve(approvalRoot, 'catalog.json')],
        ['evidence/rights.json', resolve(root, 'licenses/backgrounds-v1.json')]
      ]) {
        assert.ok(files.has(destination), destination);
        assert.ok((await readFile(resolve(backgrounds.directory, destination))).equals(await readFile(source)), destination);
      }
    });

    await t.test('both platforms accept four supported modules or three modules without background support', async () => {
      const androidResult = await validateRelease(out, client(out));
      const iosResult = await validateRelease(out, client(out, 'ios'));
      assert.deepEqual(iosResult, androidResult);
      assert.equal(androidResult.modules, 4);
      assert.equal(androidResult.verifiedModules, 4);
      assert.deepEqual(androidResult.skippedOptionalModules, []);
      for (const platform of ['android', 'ios']) {
        const result = await validateRelease(out, client(out, platform, false));
        assert.equal(result.modules, 3);
        assert.equal(result.verifiedModules, 4);
        assert.deepEqual(result.skippedOptionalModules, ['backgrounds-v1']);
      }
    });

    await t.test('a corrupt unsupported background does not block the three required modules', async () => {
      const original = backgrounds.manifest.files.find(file => file.content_type === 'image/png');
      const target = resolve(backgrounds.directory, original.path);
      const saved = resolve(temp, 'saved-background.png');
      await rename(target, saved);
      try {
        const corrupt = Buffer.from(await readFile(saved)); corrupt[100] ^= 0xff;
        await writeFile(target, corrupt);
        for (const platform of ['android', 'ios']) {
          const result = await validateRelease(out, client(out, platform, false));
          assert.equal(result.modules, 3);
          assert.deepEqual(result.skippedOptionalModules, ['backgrounds-v1']);
          await assert.rejects(validateRelease(out, client(out, platform)),
            error => error instanceof ValidationError && error.code === 'HASH');
        }
      } finally {
        await rm(target, { force: true });
        await rename(saved, target);
      }
    });

    await t.test('the output has one public key, no private key, and refuses an existing destination', async () => {
      const files = await walkFiles(out);
      assert.deepEqual(files.filter(file => file.endsWith('.pem')).map(file => file.slice(out.length + 1)), ['trusted-public-key.pem']);
      for (const file of files) {
        assert.doesNotMatch(file.slice(out.length + 1), /private|\.key$/i);
        if (/\.(json|pem|sig)$/.test(file)) assert.doesNotMatch(await readFile(file, 'utf8'), /BEGIN (?:RSA )?PRIVATE KEY/);
      }
      const existing = resolve(temp, 'existing'); await mkdir(existing);
      const sentinel = resolve(existing, 'keep.txt'); await writeFile(sentinel, 'keep me');
      await assert.rejects(generateDevelopmentCombined({ sourceRoot, contentRoot: root, out: existing }));
      assert.equal(await readFile(sentinel, 'utf8'), 'keep me');
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
    assert.equal(await treeDigest(production), productionBefore, 'production release bytes must remain unchanged');
  }
});
