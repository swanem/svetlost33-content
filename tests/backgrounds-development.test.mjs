import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { DEVELOPMENT_BACKGROUNDS_KEY_ID, generateDevelopmentBackgrounds } from '../scripts/generate-development-backgrounds-v1.mjs';
import { ValidationError, validateRelease } from '../scripts/validate-m0-v2.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, '../svetlost33-github');
const approvalID = 'shared-backgrounds-v1-2026-09-16';
const approvalDirectory = `approvals/${approvalID}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJSON = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const evidenceSources = new Map([
  ['evidence/owner-approval.json', `${approvalDirectory}/approval.json`],
  ['evidence/source-manifest.json', `${approvalDirectory}/source-manifest.json`],
  ['evidence/approved-catalog.json', `${approvalDirectory}/catalog.json`],
  ['evidence/rights.json', 'licenses/backgrounds-v1.json']
]);
const client = (out, platform = 'android', capabilities = ['background-catalog-v1']) => ({
  publicKeyPath: resolve(out, 'trusted-public-key.pem'),
  trustedKeyId: DEVELOPMENT_BACKGROUNDS_KEY_ID,
  platform, clientVersion: platform === 'android' ? 10 : '0.1.0',
  clientCapabilities: capabilities, channel: 'development', now: '2026-09-16T12:00:00Z'
});
const walkFiles = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
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
const mirrorEvidence = async directory => {
  for (const relative of evidenceSources.values()) {
    const target = resolve(directory, relative);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, relative), target);
  }
};

test('development backgrounds fixture preserves approved content and validates for both clients', async t => {
  const temp = await realpath(await mkdtemp(resolve(tmpdir(), 'svetlost33-backgrounds-development-')));
  const out = resolve(temp, 'first');
  const production = resolve(root, 'releases/v2/production');
  const productionBefore = await treeDigest(production);
  try {
    await generateDevelopmentBackgrounds({ sourceRoot, contentRoot: root, out });
    const index = await readJSON(resolve(out, 'index.json'));
    assert.deepEqual(Object.keys(index.channels), ['development']);
    assert.equal(index.key_id, DEVELOPMENT_BACKGROUNDS_KEY_ID);
    const release = await readJSON(resolve(out, index.channels.development.path));
    assert.equal(release.channel, 'development');
    assert.deepEqual(release.approved_platforms, ['android', 'ios']);
    assert.deepEqual(release.min_clients, { android: 10, ios: '0.1.0' });
    assert.equal(release.modules.length, 1);
    const entry = release.modules[0];
    assert.deepEqual({ id: entry.module_id, type: entry.module_type, version: entry.version, required: entry.required },
      { id: 'backgrounds-v1', type: 'backgrounds', version: '1.0.0', required: false });
    const moduleRoot = dirname(resolve(out, entry.manifest_path));
    const manifest = await readJSON(resolve(out, entry.manifest_path));
    assert.deepEqual(manifest.capabilities, ['background-catalog-v1']);
    assert.deepEqual(manifest.dependencies, []);
    assert.equal(manifest.files.length, 42);
    const files = new Map(manifest.files.map(file => [file.path, file]));
    assert.equal(files.size, 42);
    const approved = await readJSON(resolve(root, approvalDirectory, 'source-manifest.json'));
    const sourceCatalog = await readJSON(resolve(root, approvalDirectory, 'catalog.json'));

    await t.test('originals, localized catalog, and approval evidence retain their identity', async () => {
      const catalog = await readJSON(resolve(moduleRoot, 'data/catalog-v1.json'));
      assert.equal(catalog.schemaVersion, 1);
      assert.equal(catalog.version, '1');
      assert.deepEqual(catalog.defaultIDs, sourceCatalog.defaultIds);
      assert.deepEqual(catalog.items.map(item => item.id), sourceCatalog.items.map(item => item.id));
      assert.equal(catalog.items.length, 18);
      const sourceCatalogHash = sha256(await readFile(resolve(root, approvalDirectory, 'catalog.json')));
      assert.deepEqual(catalog.provenance, {
        androidCatalog: { path: 'shared/background-catalog.json', sha256: sourceCatalogHash },
        canonicalCatalog: { path: 'evidence/approved-catalog.json', sha256: sourceCatalogHash },
        sourceCatalog: { path: 'evidence/source-manifest.json',
          sha256: sha256(await readFile(resolve(root, approvalDirectory, 'source-manifest.json'))) },
        generator: 'scripts/generate-development-backgrounds-v1.mjs'
      });
      for (const sourceItem of sourceCatalog.items) {
        const item = catalog.items.find(value => value.id === sourceItem.id);
        const original = approved.assets.find(value => value.id === item.id);
        assert.deepEqual(item, {
          id: sourceItem.id, assetPath: sourceItem.assetPath,
          titleLatn: sourceItem.titleLatn, titleCyrl: sourceItem.titleCyrl,
          captionLatn: sourceItem.saintLatn ?? null, captionCyrl: sourceItem.saintCyrl ?? null,
          isDark: sourceItem.dark ?? false, feastMonthDay: sourceItem.feastMonthDay ?? null,
          width: original.width, height: original.height, sha256: original.sha256
        });
        const imagePath = `media/${item.assetPath}`;
        const image = await readFile(resolve(moduleRoot, imagePath));
        assert.equal(image.length, original.bytes, item.id);
        assert.equal(sha256(image), original.sha256, item.id);
        assert.ok(image.equals(await readFile(resolve(sourceRoot, original.source_path))), item.id);
        assert.deepEqual(files.get(imagePath), { path: imagePath, bytes: original.bytes,
          sha256: original.sha256, content_type: 'image/png', image: { width: 941, height: 1672 } });
      }
      for (const [destination, source] of evidenceSources) {
        assert.ok(files.has(destination), destination);
        assert.ok((await readFile(resolve(moduleRoot, destination))).equals(await readFile(resolve(root, source))), destination);
      }
    });

    await t.test('all thumbnails are decoded JPEGs with bounded dimensions and original-hash names', async () => {
      assert.equal([...files.values()].filter(file => file.content_type === 'image/png').length, 18);
      assert.equal([...files.values()].filter(file => file.content_type === 'image/jpeg').length, 18);
      for (const original of approved.assets) {
        const thumbnailPath = `thumbnails/${original.id}-${original.sha256}.jpg`;
        const record = files.get(thumbnailPath);
        assert.ok(record, original.id);
        assert.equal(record.content_type, 'image/jpeg');
        assert.deepEqual(record.image, { width: 480, height: 853 });
        const bytes = await readFile(resolve(moduleRoot, thumbnailPath));
        assert.equal(bytes.length, record.bytes);
        assert.equal(sha256(bytes), record.sha256);
        const metadata = await sharp(bytes).metadata();
        assert.equal(metadata.format, 'jpeg');
        assert.equal(metadata.chromaSubsampling, '4:2:0');
        assert.equal(metadata.isProgressive, true);
        const decoded = await sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual({ width: decoded.info.width, height: decoded.info.height }, record.image);
      }
      assert.ok(files.has('evidence/derivations.json'));
      const derivations = await readJSON(resolve(moduleRoot, 'evidence/derivations.json'));
      assert.equal(derivations.schema_version, 'svetlost33-background-derivations-1');
      assert.equal(derivations.package_id, 'backgrounds-v1');
      assert.equal(derivations.approval_id, approvalID);
      assert.equal(derivations.source_catalog_sha256,
        sha256(await readFile(resolve(root, approvalDirectory, 'catalog.json'))));
      assert.deepEqual(derivations.transformation, {
        width: 480, height: 853, fit: 'fill', without_enlargement: true,
        kernel: 'lanczos3', format: 'jpeg', quality: 80, chroma_subsampling: '4:2:0',
        progressive: true, optimize_coding: true, metadata: 'stripped'
      });
      assert.deepEqual(derivations.encoder, {
        sharp: sharp.versions.sharp, vips: sharp.versions.vips, mozjpeg: sharp.versions.mozjpeg
      });
      assert.equal(derivations.items.length, 18);
      assert.deepEqual(derivations.items.map(item => item.id), approved.assets.map(item => item.id));
      for (const item of derivations.items) {
        const original = approved.assets.find(value => value.id === item.id);
        const artwork = sourceCatalog.items.find(value => value.id === item.id);
        const thumbnailPath = `thumbnails/${original.id}-${original.sha256}.jpg`;
        const thumbnail = files.get(thumbnailPath);
        assert.deepEqual(item, {
          id: original.id, source_path: original.source_path, source_sha256: original.sha256,
          original_path: `media/${artwork.assetPath}`, thumbnail_path: thumbnailPath,
          thumbnail_sha256: thumbnail.sha256, bytes: thumbnail.bytes, width: 480, height: 853
        });
      }
    });

    await t.test('Android and iOS validate the same development release with no private key', async () => {
      const provenance = await readJSON(resolve(out, 'development-provenance.json'));
      assert.equal(provenance.production_release, false);
      assert.equal(provenance.publication_or_installation_performed, false);
      assert.equal(provenance.approval_id, approvalID);
      assert.deepEqual(provenance.modules, ['backgrounds-v1']);
      const androidResult = await validateRelease(out, client(out));
      const iosResult = await validateRelease(out, client(out, 'ios'));
      assert.deepEqual(iosResult, androidResult);
      assert.equal(androidResult.modules, 1);
      assert.equal(androidResult.verifiedModules, 1);
      assert.deepEqual(androidResult.skippedOptionalModules, []);
      await assert.rejects(validateRelease(out, { ...client(out), channel: 'production' }),
        error => error instanceof ValidationError && error.code === 'CHANNEL');
      await assert.rejects(validateRelease(out, { ...client(out, 'ios'), clientVersion: '0.0.9' }),
        error => error instanceof ValidationError && error.code === 'CLIENT_VERSION');
      for (const file of await walkFiles(out)) {
        assert.doesNotMatch(file.slice(out.length + 1), /private|\.key$/i);
        if (/\.(json|pem|sig)$/.test(file)) assert.doesNotMatch(await readFile(file, 'utf8'), /BEGIN (?:RSA )?PRIVATE KEY/);
      }
    });

    await t.test('unsupported optional backgrounds skip missing or corrupt payload while supported clients reject it', async () => {
      const target = resolve(moduleRoot, `media/${sourceCatalog.items[0].assetPath}`);
      const saved = resolve(temp, 'saved-original.png');
      await rename(target, saved);
      try {
        await assert.rejects(validateRelease(out, client(out)), error => error instanceof ValidationError && error.code === 'MISSING');
        const skipped = await validateRelease(out, client(out, 'ios', []));
        assert.equal(skipped.modules, 0);
        assert.equal(skipped.verifiedModules, 1);
        assert.deepEqual(skipped.skippedOptionalModules, ['backgrounds-v1']);
        const corrupt = Buffer.from(await readFile(saved));
        corrupt[100] ^= 0xff;
        await writeFile(target, corrupt);
        await assert.rejects(validateRelease(out, client(out)), error => error instanceof ValidationError && error.code === 'HASH');
        assert.deepEqual((await validateRelease(out, client(out, 'ios', []))).skippedOptionalModules, ['backgrounds-v1']);
      } finally {
        await rm(target, { force: true });
        await rename(saved, target);
      }
    });

    await t.test('payload and metadata are reproducible independently of ephemeral signing material', async () => {
      const second = resolve(temp, 'second');
      await generateDevelopmentBackgrounds({ sourceRoot, contentRoot: root, out: second });
      const comparable = (await walkFiles(out)).map(file => file.slice(out.length + 1))
        .filter(file => !file.endsWith('.sig') && file !== 'trusted-public-key.pem');
      assert.deepEqual((await walkFiles(second)).map(file => file.slice(second.length + 1))
        .filter(file => !file.endsWith('.sig') && file !== 'trusted-public-key.pem'), comparable);
      for (const file of comparable) assert.ok((await readFile(resolve(out, file))).equals(await readFile(resolve(second, file))), file);
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
    assert.equal(await treeDigest(production), productionBefore, 'production release bytes must remain unchanged');
  }
});

test('development generator rejects altered approval, catalog, rights, and source inputs before export', async t => {
  const temp = await realpath(await mkdtemp(resolve(tmpdir(), 'svetlost33-backgrounds-rejections-')));
  try {
    const cases = [
      ['rights hash mismatch', 'licenses/backgrounds-v1.json', value => { value.items[0].sha256 = '0'.repeat(64); }],
      ['new public license claim', 'licenses/backgrounds-v1.json', value => { value.basis.public_license_asserted = true; }],
      ['duplicate rights identity', 'licenses/backgrounds-v1.json', value => { value.items[1].id = value.items[0].id; }],
      ['changed approved catalog', `${approvalDirectory}/catalog.json`, value => { value.items[0].titleLatn += ' changed'; }],
      ['changed source manifest', `${approvalDirectory}/source-manifest.json`, value => { value.assets[0].width += 1; }],
      ['changed approved platforms', `${approvalDirectory}/approval.json`, value => { value.consumer_platforms = ['ios']; }]
    ];
    for (const [label, file, change] of cases) await t.test(label, async () => {
      const caseRoot = resolve(temp, label.replaceAll(' ', '-'));
      const contentRoot = resolve(caseRoot, 'content');
      await mirrorEvidence(contentRoot);
      const target = resolve(contentRoot, file);
      const document = await readJSON(target); change(document); await writeJSON(target, document);
      const out = resolve(caseRoot, 'rejected');
      await assert.rejects(generateDevelopmentBackgrounds({ sourceRoot, contentRoot, out }), /Frozen evidence hash mismatch/);
      await assert.rejects(readFile(resolve(out, 'index.json')), { code: 'ENOENT' });
    });

    await t.test('changed source catalog cannot reuse the frozen catalog approval', async () => {
      const sourceMirror = resolve(temp, 'changed-catalog-source');
      const target = resolve(sourceMirror, 'shared/background-catalog.json');
      await mkdir(dirname(target), { recursive: true });
      const catalog = await readJSON(resolve(root, approvalDirectory, 'catalog.json'));
      catalog.items[0].titleLatn += ' changed';
      await writeJSON(target, catalog);
      const out = resolve(temp, 'changed-catalog-output');
      await assert.rejects(generateDevelopmentBackgrounds({ sourceRoot: sourceMirror, contentRoot: root, out }), /source catalog/i);
      await assert.rejects(readFile(resolve(out, 'index.json')), { code: 'ENOENT' });
    });

    await t.test('changed PNG cannot reuse the approval', async () => {
      const sourceMirror = resolve(temp, 'source-mirror');
      const sourceManifest = await readJSON(resolve(root, approvalDirectory, 'source-manifest.json'));
      for (const relative of [sourceManifest.catalog.source_path, ...sourceManifest.assets.map(item => item.source_path)]) {
        const target = resolve(sourceMirror, relative);
        await mkdir(dirname(target), { recursive: true });
        await link(resolve(sourceRoot, relative), target);
      }
      const asset = sourceManifest.assets[0];
      const target = resolve(sourceMirror, asset.source_path);
      const changed = Buffer.from(await readFile(target)); changed[100] ^= 0xff;
      // Remove the shared inode before writing: the approved source remains untouched.
      await rm(target); await writeFile(target, changed);
      const out = resolve(temp, 'changed-source-output');
      await assert.rejects(generateDevelopmentBackgrounds({ sourceRoot: sourceMirror, contentRoot: root, out }), /image|hash/i);
      assert.equal(sha256(await readFile(resolve(sourceRoot, asset.source_path))), asset.sha256);
      await assert.rejects(readFile(resolve(out, 'index.json')), { code: 'ENOENT' });
    });

    await t.test('existing output is preserved and protected production destinations are refused', async () => {
      const existing = resolve(temp, 'existing'); await mkdir(existing);
      const sentinel = resolve(existing, 'keep.txt'); await writeFile(sentinel, 'keep me');
      await assert.rejects(generateDevelopmentBackgrounds({ sourceRoot, contentRoot: root, out: existing }));
      assert.equal(await readFile(sentinel, 'utf8'), 'keep me');
      const contentRoot = resolve(temp, 'protected-content'); await mirrorEvidence(contentRoot);
      const protectedOut = resolve(contentRoot, 'releases/v2/production/new-fixture');
      await assert.rejects(generateDevelopmentBackgrounds({ sourceRoot, contentRoot, out: protectedOut }));
      await assert.rejects(readFile(resolve(protectedOut, 'index.json')), { code: 'ENOENT' });
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
