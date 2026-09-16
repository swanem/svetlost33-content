#!/usr/bin/env node
// Four-module integration fixture. No production keys, release edits, or network.
import { execFile } from 'node:child_process';
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assertDevelopmentOutput, generateDevelopmentBackgrounds } from './generate-development-backgrounds-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const run = promisify(execFile);
export const DEVELOPMENT_COMBINED_KEY_ID = 'svetlost33-development-key-1';
const RELEASE_ID = 'development-annual-2026-r1-backgrounds-v1';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

export async function generateDevelopmentCombined({
  sourceRoot = resolve(ROOT, '../svetlost33-github'), contentRoot = ROOT,
  out = resolve(ROOT, 'build/development-combined'),
} = {}) {
  sourceRoot = await realpath(resolve(sourceRoot));
  contentRoot = await realpath(resolve(contentRoot));
  out = await assertDevelopmentOutput(out, sourceRoot, contentRoot);
  await mkdir(dirname(out), { recursive: true });
  const scratch = await mkdtemp(resolve(dirname(out), '.combined-development-staging-'));
  try {
    const annualRoot = resolve(scratch, 'annual');
    const backgroundsRoot = resolve(scratch, 'backgrounds');
    const combined = resolve(scratch, 'combined');
    // Use exactly the same approved background builder as the isolated fixture.
    await generateDevelopmentBackgrounds({ sourceRoot, contentRoot, out: backgroundsRoot });
    await run(process.execPath, [resolve(ROOT, 'scripts/generate-development-rc.mjs'),
      '--source', resolve(contentRoot, 'releases/legacy/annual-2026-r1'), '--out', annualRoot]);
    const annualSet = await readJSON(resolve(annualRoot, 'release-set.json'));
    const backgroundSet = await readJSON(resolve(backgroundsRoot, 'release-set.json'));
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signature = bytes => Buffer.from(`${sign('sha256', bytes, {
      key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }).toString('base64')}\n`, 'ascii');
    const put = async (path, bytes) => {
      const target = resolve(combined, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
    };
    await put('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }), 'ascii'));
    const entries = [];
    for (const [source, set] of [[annualRoot, annualSet], [backgroundsRoot, backgroundSet]]) {
      for (const entry of set.modules) {
        const manifest = await readJSON(resolve(source, entry.manifest_path));
        const moduleRoot = dirname(entry.manifest_path);
        for (const file of manifest.files) {
          const bytes = await readFile(resolve(source, moduleRoot, file.path));
          if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) {
            throw new Error(`Generated payload changed before combination: ${entry.module_id}/${file.path}`);
          }
          await put(`${moduleRoot}/${file.path}`, bytes);
        }
        const manifestBytes = json({ ...manifest, key_id: DEVELOPMENT_COMBINED_KEY_ID });
        await put(entry.manifest_path, manifestBytes);
        await put(entry.signature_path, signature(manifestBytes));
        entries.push({ ...entry, manifest_bytes: manifestBytes.length, manifest_sha256: hash(manifestBytes) });
      }
    }
    const setBytes = json({ schema_version: 'svetlost33-release-set-2', release_set_id: RELEASE_ID,
      sequence: 1, channel: 'development', key_id: DEVELOPMENT_COMBINED_KEY_ID,
      approved_platforms: ['android', 'ios'], min_clients: { android: 10, ios: '0.1.0' }, modules: entries });
    await put('release-set.json', setBytes);
    await put('release-set.sig', signature(setBytes));
    const index = json({ schema_version: 'svetlost33-m0-index-2', sequence: 1,
      issued_at: '2026-09-16T00:00:00Z', expires_at: '2099-09-16T00:00:00Z',
      key_id: DEVELOPMENT_COMBINED_KEY_ID, channels: { development: {
        release_set_id: RELEASE_ID, path: 'release-set.json', bytes: setBytes.length,
        sha256: hash(setBytes), signature_path: 'release-set.sig',
      } } });
    await put('index.json', index);
    await put('index.sig', signature(index));
    const annualProvenance = await readJSON(resolve(annualRoot, 'development-provenance.json'));
    await put('development-provenance.json', json({
      schema_version: 'svetlost33-development-provenance-1', production_release: false,
      source_package_id: annualProvenance.source_package_id,
      source_manifest_sha256: annualProvenance.source_manifest_sha256, source_payload_files: 13,
      background_approval_id: 'shared-backgrounds-v1-2026-09-16',
      modules: entries.map(entry => entry.module_id), excluded_modules: ['organizations'],
      original_images: 18, generated_thumbnails: 18,
      signing: 'single ephemeral test key; private key is never written',
      compatibility: 'development fixture minima only; production client QA is separate',
      publication_or_installation_performed: false,
    }));
    const context = { channel: 'development', trustedKeyId: DEVELOPMENT_COMBINED_KEY_ID,
      now: '2026-09-16T12:00:00Z', clientCapabilities: [
        'library-v1', 'sr-Cyrl', 'sr-Latn', 'cycle-v1', 'calendar-v1', 'explicit-unknown', 'background-catalog-v1',
      ] };
    const result = await validateRelease(combined, { ...context, platform: 'android', clientVersion: 10 });
    await validateRelease(combined, { ...context, platform: 'ios', clientVersion: '0.1.0' });
    await assertDevelopmentOutput(out, sourceRoot, contentRoot);
    await rename(combined, out);
    return { out, modules: result.modules, totalBytes: result.totalBytes };
  } finally {
    // Only this fresh staging directory is removed; no caller-selected output is deleted.
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const flag = args.shift();
      if (flag === '--help') {
        console.log('Usage: generate-development-combined.mjs [--source SOURCE_REPOSITORY] [--out NEW_DIRECTORY]');
        process.exit(0);
      }
      if ((flag !== '--source' && flag !== '--out') || !args.length) throw new Error(`Unknown/incomplete argument: ${flag}`);
      options[flag === '--source' ? 'sourceRoot' : 'out'] = args.shift();
    }
    const result = await generateDevelopmentCombined(options);
    console.log(`Generated ${result.modules}-module development fixture at ${result.out}: ${result.totalBytes} validated bytes; production unchanged.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
