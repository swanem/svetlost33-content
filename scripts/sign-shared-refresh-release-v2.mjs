#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, json, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from './prepare-calendar-browser-release-v2.mjs';
import { verifyCalendarNativeArtifact } from './install-calendar-browser-release-v2.mjs';
import { createSharedRefreshPlan, REFRESH_ID, REFRESH_SEQUENCE, S10_ARCHIVE, S10_INDEX_SHA256, readRefreshInput } from './prepare-shared-refresh-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

const actualNow = () => new Date().toISOString();
const absent = error => { if (error.code === 'ENOENT') return null; throw error; };
const equal = (a, b, label) => assert.ok(a?.equals(b), label);
const publicPaths = plan => [...plan.files.keys()].filter(path => path !== 'signing-request.json');
const within = (root, path) => { const rel = relative(resolve(root), resolve(path)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };

export function assertRefreshExternalKey(privateKeyPath, roots) {
  assert.ok(![ROOT, BASE, ...roots].some(root => within(root, privateKeyPath)), 'Private key must stay outside the repository and all public candidate/source/output trees');
}

/** Bound every captured file through O_NOFOLLOW, including all ancestors. */
export async function captureRefreshTree(directory) {
  const files = new Map(); let total = 0;
  const walk = async (path, prefix = '') => {
    await assertNoSymlinkPath(path); assert.ok((await lstat(path)).isDirectory());
    for (const item of await readdir(path, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${item.name}` : item.name, target = resolve(path, item.name);
      assert.equal(item.isSymbolicLink(), false, `Symlink tree entry: ${name}`);
      if (item.isDirectory()) await walk(target, name);
      else {
        assert.ok(item.isFile(), `Regular tree entry: ${name}`);
        const bytes = await readRefreshInput(target); total += bytes.length;
        assert.ok(files.size < 10000 && total <= 256 * 1024 * 1024, 'Bounded release tree'); files.set(name, bytes);
      }
    }
  };
  await walk(resolve(directory)); return files;
}

export async function assertRefreshPublicationAuthorization() {
  const bytes = await readRefreshInput(resolve(ROOT, 'approvals/new-content-2026-09-30/publication-authorization.json'));
  assert.equal(sha256(bytes), 'ef7f9c4f96f8e19eea128a67977826a5d8f7213f21673afad45c8da27ff7ee32');
  const proof = JSON.parse(bytes);
  assert.equal(proof.editorial_approval_sha256, '549e767f5734030b8c36d7b05c1b7eefc02583a4b6b14f4313e8721594002290');
  assert.equal(proof.authorized.local_signing_of_reviewed_candidate, true);
  assert.equal(proof.authorized.shared_content_publication_after_native_acceptance, true);
}

async function assertLiveS10(sourceDirectory, plan) {
  assert.equal(sha256(await readRefreshInput(resolve(sourceDirectory, 'index.json'))), S10_INDEX_SHA256, 'Live discovery advanced; replan before mutation');
  equal(await readRefreshInput(resolve(sourceDirectory, 'index.sig')), plan.files.get(`${S10_ARCHIVE}/index.sig`), 'Live discovery signature changed');
}

export async function validateSharedRefreshSignedRelease(directory, { now = actualNow() } = {}) {
  const plan = await createSharedRefreshPlan({ sourceDirectory: directory, archived: true, now });
  const files = await captureRefreshTree(directory);
  const paths = publicPaths(plan), signatures = plan.request.documents_to_sign.map(x => x.signature_path);
  assert.deepEqual([...files.keys()].sort(), [...paths, ...signatures].sort(), 'Exact signed stage file set, without private notes');
  for (const path of paths) equal(files.get(path), plan.files.get(path), `Signed approved-plan mismatch: ${path}`);
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(directory, { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: REFRESH_SEQUENCE, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, REFRESH_ID); assert.equal(result.sequence, REFRESH_SEQUENCE);
    assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7);
    assert.deepEqual(result.skippedOptionalModules, profile.skipped);
    checks.push({ platform, profile: profile.id, ...result });
  }
  return { status: 'SIGNED_STAGE_VALID_NOT_PUBLISHED', release_set_id: REFRESH_ID, sequence: REFRESH_SEQUENCE,
    index_sha256: sha256(files.get('index.json')), release_sha256: plan.request.documents_to_sign.find(x => x.path.endsWith('/release-set.json')).sha256,
    checks, preflight: plan.request.preflight };
}

export async function signSharedRefreshRelease({ candidate, out, privateKeyPath, coordinatorGo = false, sourceDirectory = BASE } = {}) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator signing GO required');
  assert.ok(candidate && out && privateKeyPath, 'Explicit candidate, new output and external key paths required');
  await assertRefreshPublicationAuthorization();
  assertRefreshExternalKey(privateKeyPath, [sourceDirectory, candidate, out]);
  const plan = await createSharedRefreshPlan({ sourceDirectory, now: actualNow() });
  const files = await captureRefreshTree(resolve(candidate));
  assert.equal(files.size, plan.files.size, 'Exact unsigned candidate files');
  for (const [path, bytes] of plan.files) equal(files.get(path), bytes, `Unsigned candidate mismatch: ${path}`);
  await assertNoSymlinkPath(out, { allowMissing: true });
  assert.equal(await lstat(resolve(out)).catch(absent), null, 'New output directory required');
  await assertLiveS10(sourceDirectory, plan);
  // Validate exact approved inputs and current time before touching the key.
  await createSharedRefreshPlan({ sourceDirectory, now: actualNow() });
  const privateBytes = await readRefreshInput(resolve(privateKeyPath), 64 * 1024);
  let key;
  try { key = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const publicDer = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  equal(createPublicKey(key).export({ type: 'spki', format: 'der' }), publicDer, 'Existing production key required; no key rotation');
  const output = new Map(plan.files); output.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) output.set(document.signature_path,
    Buffer.from(`${sign('sha256', output.get(document.path), { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await assertLiveS10(sourceDirectory, plan);
  await createSharedRefreshPlan({ sourceDirectory, now: actualNow() });
  await writeNewTree(out, output);
  return validateSharedRefreshSignedRelease(out);
}

/** Both exact native acceptances are a publication gate, not new content approval. */
export async function inspectSharedRefreshNativeGo({ paths = {}, indexSha256, releaseSha256, now = actualNow() } = {}) {
  const checks = [];
  for (const platform of ['android', 'ios']) {
    assert.ok(paths[platform], `${platform} native GO required`);
    const bytes = await readRefreshInput(resolve(paths[platform]), 256 * 1024), proof = JSON.parse(bytes);
    assert.equal(proof.schema_version, 'svetlost33-native-shared-refresh-go-1');
    assert.equal(proof.platform, platform); assert.equal(proof.status, 'GO_FOR_S11_ACTIVATION');
    assert.equal(proof.release_set_id, REFRESH_ID); assert.equal(proof.sequence, REFRESH_SEQUENCE);
    assert.equal(proof.index_sha256, indexSha256); assert.equal(proof.release_sha256, releaseSha256);
    assert.ok(Number.isFinite(Date.parse(proof.recorded_at)) && Date.parse(proof.recorded_at) <= Date.parse(now));
    assert.ok(Array.isArray(proof.artifacts) && proof.artifacts.length > 0 && proof.artifacts.length <= 32);
    assert.equal(new Set(proof.artifacts.map(x => x.path)).size, proof.artifacts.length);
    for (const artifact of proof.artifacts) await verifyCalendarNativeArtifact(artifact);
    checks.push({ platform, proof_path: resolve(paths[platform]), sha256: sha256(bytes), artifacts: proof.artifacts });
  }
  return checks;
}

/** Copies only validated public bytes into an explicit local production tree.
 * No Git action occurs. Root publishes immutable files before the discovery pair.
 */
export async function installSharedRefreshRelease({ signedDirectory, productionDirectory = BASE, nativeGoPaths = {}, coordinatorGo = false } = {}) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator activation GO required');
  assert.ok(signedDirectory); assert.notEqual(resolve(signedDirectory), resolve(productionDirectory));
  await assertRefreshPublicationAuthorization();
  const validation = await validateSharedRefreshSignedRelease(signedDirectory);
  const native = await inspectSharedRefreshNativeGo({ paths: nativeGoPaths, indexSha256: validation.index_sha256, releaseSha256: validation.release_sha256 });
  const plan = await createSharedRefreshPlan({ sourceDirectory: productionDirectory, now: actualNow() });
  const signed = await captureRefreshTree(signedDirectory), existing = await captureRefreshTree(productionDirectory);
  await assertLiveS10(productionDirectory, plan);
  for (const [path, bytes] of signed) if (!['index.json', 'index.sig'].includes(path) && existing.has(path)) equal(existing.get(path), bytes, `Immutable collision: ${path}`);
  const lockPath = resolve(productionDirectory, '.shared-refresh-s11-install.lock');
  await assertNoSymlinkPath(lockPath, { allowMissing: true });
  const lock = await open(lockPath, 'wx');
  const lockBytes = json({ release_set_id: REFRESH_ID, index_sha256: validation.index_sha256, acquired_at: actualNow(), pid: process.pid });
  let staging, switchedSignature = false, switchedIndex = false;
  try {
    await lock.writeFile(lockBytes); await lock.sync();
    await assertLiveS10(productionDirectory, plan);
    for (const [path, bytes] of signed) {
      if (['index.json', 'index.sig'].includes(path)) continue;
      const target = resolve(productionDirectory, path);
      await assertNoSymlinkPath(target, { allowMissing: true });
      if (await lstat(target).catch(absent)) { equal(await readRefreshInput(target), bytes, `Immutable collision during copy: ${path}`); continue; }
      await mkdir(dirname(target), { recursive: true }); await assertNoSymlinkPath(dirname(target)); await writeFile(target, bytes, { flag: 'wx' });
    }
    await createSharedRefreshPlan({ sourceDirectory: productionDirectory, now: actualNow() });
    await validateSharedRefreshSignedRelease(signedDirectory);
    for (const [path, bytes] of signed) if (!['index.json', 'index.sig'].includes(path)) equal(await readRefreshInput(resolve(productionDirectory, path)), bytes, `Copied immutable verification: ${path}`);
    staging = await mkdtemp(resolve(productionDirectory, '.s11-index-'));
    for (const path of ['index.json', 'index.sig']) await writeFile(resolve(staging, path), signed.get(path), { flag: 'wx' });
    const nativeAgain = await inspectSharedRefreshNativeGo({ paths: nativeGoPaths, indexSha256: validation.index_sha256, releaseSha256: validation.release_sha256 });
    assert.deepEqual(nativeAgain, native, 'Native GO evidence changed during installation');
    await assertRefreshPublicationAuthorization();
    await createSharedRefreshPlan({ sourceDirectory: productionDirectory, now: actualNow() });
    await assertLiveS10(productionDirectory, plan);
    // Local filesystem cannot atomically rename two files. Each rename is
    // atomic, but a crash between them is fail-closed and needs review. The
    // actual public Git commit MUST publish the discovery pair together.
    await rename(resolve(staging, 'index.sig'), resolve(productionDirectory, 'index.sig')); switchedSignature = true;
    await rename(resolve(staging, 'index.json'), resolve(productionDirectory, 'index.json')); switchedIndex = true;
    for (const path of ['index.json', 'index.sig']) equal(await readRefreshInput(resolve(productionDirectory, path)), signed.get(path), `Installed discovery: ${path}`);
    return { ...validation, status: 'LOCAL_INSTALLED_NOT_PUBLICLY_VERIFIED', native, public_commit_and_https_readback_required: true };
  } catch (cause) {
    if (switchedSignature && !switchedIndex) {
      const error = new Error('S11_DISCOVERY_PARTIAL_SWITCH: mixed local discovery pair; retained lock/staging require coordinator review. No automatic retry, repair, publication or rollback.', { cause });
      error.code = 'S11_DISCOVERY_PARTIAL_SWITCH'; throw error;
    }
    throw cause;
  } finally {
    await lock.close();
    if (!(switchedSignature && !switchedIndex)) {
      if (staging) { for (const path of ['index.json', 'index.sig']) await unlink(resolve(staging, path)).catch(absent); await rmdir(staging); }
      const actualLock = await readRefreshInput(lockPath).catch(absent);
      if (actualLock?.equals(lockBytes)) await unlink(lockPath);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), gate = args.includes('--coordinator-go'), rest = args.filter(x => x !== '--coordinator-go');
  const values = new Map();
  for (let n = 0; n < rest.length; n += 2) {
    assert.ok(['--candidate', '--out', '--private-key', '--validate-signed', '--install-signed', '--android-go', '--ios-go'].includes(rest[n]) && rest[n + 1] && !values.has(rest[n]), 'Invalid or duplicate argument');
    values.set(rest[n], rest[n + 1]);
  }
  let result;
  if (values.has('--validate-signed')) { assert.equal(values.size, 1); result = await validateSharedRefreshSignedRelease(values.get('--validate-signed')); }
  else if (values.has('--install-signed')) { assert.equal(values.size, 3); result = await installSharedRefreshRelease({ signedDirectory: values.get('--install-signed'), nativeGoPaths: { android: values.get('--android-go'), ios: values.get('--ios-go') }, coordinatorGo: gate }); }
  else { assert.equal(values.size, 3); result = await signSharedRefreshRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key'), coordinatorGo: gate }); }
  console.log(JSON.stringify(result, null, 2));
}
