#!/usr/bin/env node
// Approved original bytes + technical thumbnails, for local client integration only.
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { validateRelease } from './validate-m0-v2.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const APPROVAL_ID = 'shared-backgrounds-v1-2026-09-16';
const APPROVAL_ROOT = `approvals/${APPROVAL_ID}`;
export const DEVELOPMENT_BACKGROUNDS_KEY_ID = 'svetlost33-development-backgrounds-key-1';
const MODULE_ID = 'backgrounds-v1';
const VERSION = '1.0.0';
const RELEASE_ID = 'development-backgrounds-v1';
const SOURCE_COMMIT = '95addbb3b6076324cdbb3e2e4ee9525c0432207a';
const LIMITS = { file: 20 * 1024 * 1024, total: 100 * 1024 * 1024, pixels: 16_000_000, side: 4096 };

// This generator is intentionally for one immutable approved revision. A changed
// catalog, original, or rights record requires a new shared approval and generator.
const EVIDENCE = [
  { source: `${APPROVAL_ROOT}/approval.json`, output: 'evidence/owner-approval.json',
    sha256: '43cc4bda3835376e8d6e20d91f29df64784d2100ff085961fbfa945009d8c020' },
  { source: `${APPROVAL_ROOT}/source-manifest.json`, output: 'evidence/source-manifest.json',
    sha256: '6b8102f428daf16d361aa87d686eb444e8ed1ef4ba94ed241cafc44a8a7c15b4' },
  { source: `${APPROVAL_ROOT}/catalog.json`, output: 'evidence/approved-catalog.json',
    sha256: '9895ddbeee59b2fc1203ffae21c727121ad6474a267bfb1b013c79a554ae4894' },
  { source: 'licenses/backgrounds-v1.json', output: 'evidence/rights.json',
    sha256: '5d5996e2f4f033e33949b8e3d80aa3ffba4c1d9fff85e6359275962f4822e2af' },
];
const TRANSFORMATION = Object.freeze({
  width: 480, height: 853, fit: 'fill', without_enlargement: true, kernel: 'lanczos3',
  format: 'jpeg', quality: 80, chroma_subsampling: '4:2:0', progressive: true,
  optimize_coding: true, metadata: 'stripped',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const requireValue = (condition, message) => { if (!condition) throw new Error(`[backgrounds-v1] ${message}`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const inside = (root, target) => {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
};
const safeRelativePath = path => typeof path === 'string' && path.length <= 160
  && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every(part => part && part !== '.' && part !== '..');

async function regularBytes(root, path) {
  requireValue(safeRelativePath(path), `Unsafe source path: ${path}`);
  const target = resolve(root, path);
  const stat = await lstat(target);
  requireValue(stat.isFile() && !stat.isSymbolicLink(), `Source is not a regular file: ${path}`);
  requireValue(inside(await realpath(root), await realpath(target)), `Source path escapes its root: ${path}`);
  requireValue(stat.size > 0 && stat.size <= LIMITS.file, `Source size outside M0 limits: ${path}`);
  return readFile(target);
}

async function inputData(sourceRoot, contentRoot) {
  const evidence = [];
  for (const record of EVIDENCE) {
    const bytes = await regularBytes(contentRoot, record.source);
    requireValue(hash(bytes) === record.sha256, `Frozen evidence hash mismatch: ${record.source}`);
    evidence.push({ ...record, bytes, document: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) });
  }
  const [approval, manifest, catalog, rights] = evidence.map(item => item.document);
  requireValue(approval.approval_id === APPROVAL_ID && rights.approval_id === APPROVAL_ID,
    'Approval and rights identities differ');
  requireValue(approval.source.package_id === MODULE_ID && manifest.package_id === MODULE_ID
    && rights.package_id === MODULE_ID && approval.source.commit === SOURCE_COMMIT
    && manifest.source_commit === SOURCE_COMMIT, 'Unexpected approved source revision');
  requireValue(same(approval.consumer_platforms, ['android', 'ios'])
    && same(rights.scope.consumer_platforms, approval.consumer_platforms)
    && same(approval.territories, ['RS', 'BA']) && same(rights.scope.territories, approval.territories),
  'Approval or rights scope changed');
  requireValue(approval.source.manifest_sha256 === hash(evidence[1].bytes)
    && approval.source.catalog_sha256 === hash(evidence[2].bytes)
    && manifest.catalog.sha256 === hash(evidence[2].bytes)
    && manifest.catalog.bytes === evidence[2].bytes.length, 'Evidence hash bindings differ');
  requireValue(catalog.schemaVersion === 1 && catalog.version === '1'
    && same(catalog.defaultIds, Array.from({ length: 7 }, (_, i) => `day${i + 1}`)), 'Unexpected catalog identity/defaults');
  const ids = catalog.items.map(item => item.id);
  requireValue(ids.length === 18 && new Set(ids).size === 18 && manifest.asset_count === 18
    && same(ids, approval.authorized_content.stable_ids) && same(manifest.default_ids, catalog.defaultIds)
    && same(ids, manifest.assets.map(item => item.id)) && same(ids, rights.items.map(item => item.id)),
  'Approved catalog, image, and rights ID sets differ');
  requireValue(manifest.assets.reduce((total, item) => total + item.bytes, 0) === manifest.total_asset_bytes,
    'Source inventory total differs');
  const currentCatalog = await regularBytes(sourceRoot, manifest.catalog.source_path);
  requireValue(currentCatalog.equals(evidence[2].bytes), 'Source catalog differs from approved catalog');
  const originals = [];
  for (const [index, item] of catalog.items.entries()) {
    const asset = manifest.assets[index], authorization = rights.items[index];
    requireValue(/^[a-z0-9][a-z0-9-]*$/.test(item.id) && safeRelativePath(item.assetPath)
      && item.assetPath === `backgrounds/${item.feastMonthDay ? 'saints/' : ''}${item.id}.png`
      && asset.source_path === `app/src/main/assets/${item.assetPath}`
      && authorization.source_path === asset.source_path && authorization.sha256 === asset.sha256
      && authorization.approval_id === APPROVAL_ID && authorization.authorization === 'EXACT_ASSET_BYTES_ONLY'
      && asset.content_type === 'image/png' && asset.feast_month_day === (item.feastMonthDay ?? null),
    `Catalog/rights/source identity mismatch: ${item.id}`);
    const bytes = await regularBytes(sourceRoot, asset.source_path);
    requireValue(bytes.length === asset.bytes && hash(bytes) === asset.sha256,
      `Source image byte/hash mismatch: ${item.id}`);
    const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: LIMITS.pixels }).metadata();
    // Decode all pixels, not just a header, before accepting the approved source.
    const decoded = await sharp(bytes, { failOn: 'error', limitInputPixels: LIMITS.pixels, sequentialRead: true })
      .raw().toBuffer({ resolveWithObject: true });
    requireValue(metadata.format === 'png' && (metadata.pages ?? 1) === 1 && !metadata.hasAlpha
      && decoded.info.width === asset.width && decoded.info.height === asset.height
      && asset.width <= LIMITS.side && asset.height <= LIMITS.side
      && asset.width * asset.height <= LIMITS.pixels, `Source image format/dimensions mismatch: ${item.id}`);
    originals.push({ item, asset, bytes });
  }
  return { evidence, catalog, originals };
}

export async function assertDevelopmentOutput(out, sourceRoot, contentRoot = ROOT) {
  out = resolve(out);
  let parent = dirname(out), suffix = [];
  while (true) {
    try { parent = resolve(await realpath(parent), ...suffix.reverse()); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      suffix.push(relative(dirname(parent), parent)); parent = dirname(parent);
    }
  }
  out = resolve(parent, relative(dirname(out), out));
  // Never overwrite releases, approvals, sources, or any pre-existing output.
  // Repository-local generated artifacts belong only under ignored build/.
  for (const protectedRoot of [ROOT, contentRoot]) {
    requireValue(!inside(out, protectedRoot), 'Output cannot contain the content repository');
    requireValue(!inside(protectedRoot, out) || inside(resolve(protectedRoot, 'build'), out),
      'Repository output must be inside build; signed releases and evidence are immutable');
  }
  requireValue(!inside(out, sourceRoot) && !inside(sourceRoot, out), 'Output cannot overlap source images');
  const existing = await lstat(out).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  requireValue(!existing, 'Output already exists; choose a new development output directory');
  return out;
}

/** Create a fresh, ephemeral-key development fixture; never accepts a signing key. */
export async function generateDevelopmentBackgrounds({
  sourceRoot = resolve(ROOT, '../svetlost33-github'), contentRoot = ROOT,
  out = resolve(ROOT, 'build/development-backgrounds-v1'),
} = {}) {
  sourceRoot = await realpath(resolve(sourceRoot));
  contentRoot = await realpath(resolve(contentRoot));
  out = await assertDevelopmentOutput(out, sourceRoot, contentRoot);
  const { evidence, catalog, originals } = await inputData(sourceRoot, contentRoot);
  await mkdir(dirname(out), { recursive: true });
  const staging = await mkdtemp(resolve(dirname(out), '.backgrounds-v1-staging-'));
  try {
    const moduleRoot = `modules/${MODULE_ID}`;
    const files = [];
    const put = async (path, bytes) => {
      requireValue(safeRelativePath(path), `Unsafe generated path: ${path}`);
      const target = resolve(staging, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    };
    const payload = async (path, bytes, contentType, image) => {
      requireValue(bytes.length > 0 && bytes.length <= LIMITS.file, `Generated file exceeds M0 limit: ${path}`);
      await put(`${moduleRoot}/${path}`, bytes);
      files.push({ path, bytes: bytes.length, sha256: hash(bytes), content_type: contentType,
        ...(contentType === 'application/json' ? { encoding: 'utf-8' } : { image }) });
    };
    for (const record of evidence) await payload(record.output, record.bytes, 'application/json');
    const derivedItems = [];
    for (const { item, asset, bytes } of originals) {
      const originalPath = `media/${item.assetPath}`;
      await payload(originalPath, bytes, 'image/png', { width: asset.width, height: asset.height });
      const thumbnailPath = `thumbnails/${item.id}-${asset.sha256}.jpg`;
      const thumbnail = await sharp(bytes, { failOn: 'error', limitInputPixels: LIMITS.pixels, sequentialRead: true })
        .resize({ width: TRANSFORMATION.width, height: TRANSFORMATION.height, fit: 'fill',
          withoutEnlargement: true, kernel: 'lanczos3' })
        .jpeg({ quality: TRANSFORMATION.quality, chromaSubsampling: TRANSFORMATION.chroma_subsampling,
          progressive: true, optimiseCoding: true, mozjpeg: false }).toBuffer({ resolveWithObject: true });
      requireValue(thumbnail.info.width === 480 && thumbnail.info.height === 853
        && thumbnail.data.length < 250_000, `Thumbnail exceeds the native preview contract: ${item.id}`);
      await payload(thumbnailPath, thumbnail.data, 'image/jpeg',
        { width: thumbnail.info.width, height: thumbnail.info.height });
      derivedItems.push({ id: item.id, source_path: asset.source_path, source_sha256: asset.sha256,
        original_path: originalPath, thumbnail_path: thumbnailPath, thumbnail_sha256: hash(thumbnail.data),
        bytes: thumbnail.data.length, width: thumbnail.info.width, height: thumbnail.info.height });
    }
    const nativeCatalog = {
      schemaVersion: 1, version: catalog.version,
      provenance: {
        androidCatalog: { path: 'shared/background-catalog.json', sha256: EVIDENCE[2].sha256 },
        canonicalCatalog: { path: 'evidence/approved-catalog.json', sha256: EVIDENCE[2].sha256 },
        sourceCatalog: { path: 'evidence/source-manifest.json', sha256: EVIDENCE[1].sha256 },
        generator: 'scripts/generate-development-backgrounds-v1.mjs',
      },
      defaultIDs: catalog.defaultIds,
      items: originals.map(({ item, asset }) => ({
        id: item.id, assetPath: item.assetPath, titleLatn: item.titleLatn, titleCyrl: item.titleCyrl,
        captionLatn: item.saintLatn ?? null, captionCyrl: item.saintCyrl ?? null,
        isDark: item.dark, feastMonthDay: item.feastMonthDay ?? null,
        width: asset.width, height: asset.height, sha256: asset.sha256,
      })),
    };
    await payload('data/catalog-v1.json', json(nativeCatalog), 'application/json');
    await payload('evidence/derivations.json', json({
      schema_version: 'svetlost33-background-derivations-1', package_id: MODULE_ID,
      approval_id: APPROVAL_ID, source_catalog_sha256: EVIDENCE[2].sha256,
      transformation: TRANSFORMATION,
      encoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, mozjpeg: sharp.versions.mozjpeg },
      items: derivedItems,
    }), 'application/json');
    files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    requireValue(files.length === 42 && new Set(files.map(file => file.path)).size === 42,
      'Expected 42 unique background module payload files');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const detached = bytes => Buffer.from(`${sign('sha256', bytes, {
      key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }).toString('base64')}\n`, 'ascii');
    await put('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }), 'ascii'));
    const manifest = json({ schema_version: 'svetlost33-module-manifest-2', module_id: MODULE_ID,
      module_type: 'backgrounds', version: VERSION, revision: 1, key_id: DEVELOPMENT_BACKGROUNDS_KEY_ID,
      capabilities: ['background-catalog-v1'], dependencies: [], files });
    await put(`${moduleRoot}/manifest.json`, manifest);
    await put(`${moduleRoot}/manifest.sig`, detached(manifest));
    const releaseSet = json({ schema_version: 'svetlost33-release-set-2', release_set_id: RELEASE_ID,
      sequence: 1, channel: 'development', key_id: DEVELOPMENT_BACKGROUNDS_KEY_ID,
      approved_platforms: ['android', 'ios'], min_clients: { android: 10, ios: '0.1.0' }, modules: [{
        module_id: MODULE_ID, module_type: 'backgrounds', version: VERSION, required: false,
        manifest_path: `${moduleRoot}/manifest.json`, manifest_bytes: manifest.length, manifest_sha256: hash(manifest),
        signature_path: `${moduleRoot}/manifest.sig`,
      }] });
    await put('release-set.json', releaseSet);
    await put('release-set.sig', detached(releaseSet));
    const index = json({ schema_version: 'svetlost33-m0-index-2', sequence: 1,
      issued_at: '2026-09-16T00:00:00Z', expires_at: '2099-09-16T00:00:00Z',
      key_id: DEVELOPMENT_BACKGROUNDS_KEY_ID, channels: { development: {
        release_set_id: RELEASE_ID, path: 'release-set.json', bytes: releaseSet.length,
        sha256: hash(releaseSet), signature_path: 'release-set.sig',
      } } });
    await put('index.json', index);
    await put('index.sig', detached(index));
    await put('development-provenance.json', json({
      schema_version: 'svetlost33-development-provenance-1', production_release: false,
      package_id: MODULE_ID, approval_id: APPROVAL_ID, source_commit: SOURCE_COMMIT,
      modules: [MODULE_ID], original_images: originals.length, generated_thumbnails: derivedItems.length,
      signing: 'ephemeral test key; private key is never written',
      compatibility: 'development fixture minima only; production client QA is separate',
      publication_or_installation_performed: false,
    }));
    const context = { channel: 'development', trustedKeyId: DEVELOPMENT_BACKGROUNDS_KEY_ID,
      clientCapabilities: ['background-catalog-v1'], now: '2026-09-16T12:00:00Z' };
    const result = await validateRelease(staging, { ...context, platform: 'android', clientVersion: 10 });
    await validateRelease(staging, { ...context, platform: 'ios', clientVersion: '0.1.0' });
    requireValue(result.totalBytes <= LIMITS.total, 'Development fixture exceeds M0 aggregate limit');
    await assertDevelopmentOutput(out, sourceRoot, contentRoot);
    await rename(staging, out);
    return { out, moduleRoot: resolve(out, moduleRoot), manifest: JSON.parse(manifest), totalBytes: result.totalBytes };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const flag = args.shift();
      if (flag === '--help') {
        console.log('Usage: generate-development-backgrounds-v1.mjs [--source SOURCE_REPOSITORY] [--out NEW_DIRECTORY]');
        process.exit(0);
      }
      requireValue((flag === '--source' || flag === '--out') && args.length > 0, `Unknown/incomplete argument: ${flag}`);
      options[flag === '--source' ? 'sourceRoot' : 'out'] = args.shift();
    }
    const result = await generateDevelopmentBackgrounds(options);
    console.log(`Generated development backgrounds-v1 at ${result.out}: 18 unchanged PNGs, 18 JPEG thumbnails, ${result.totalBytes} validated bytes; no private key written.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
