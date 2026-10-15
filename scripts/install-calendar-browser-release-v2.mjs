#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants as cryptoConstants, createHash, createPublicKey, verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, json, readTree, sha256 } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { createCalendarBrowserReleasePlan, CALENDAR_BROWSER_RELEASE_ID, CALENDAR_BROWSER_SEQUENCE,
  CALENDAR_BROWSER_CAPABILITIES, S9_ARCHIVE } from './prepare-calendar-browser-release-v2.mjs';
import { assertCalendarMutationDeadline, validateCalendarBrowserSignedRelease } from './sign-calendar-browser-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

const pairPaths = ['index.json', 'index.sig'];
const actualNow = () => new Date(Date.now()).toISOString();
const unchanged = (actual, expected, message) => assert.ok(actual?.equals(expected), message);
const parseJSON = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const absent = error => { if (error.code === 'ENOENT') return null; throw error; };

async function readRegular(path, limit = 256 * 1024) {
  await assertNoSymlinkPath(path);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= limit, `Regular bounded evidence required: ${path}`);
    const bytes = await handle.readFile();
    assert.ok(bytes.length > 0 && bytes.length <= limit, `Evidence byte limit: ${path}`);
    return bytes;
  } finally { await handle.close(); }
}

// Build artifacts are hashed through a handle without loading large binaries
// into memory. No private key is needed anywhere in this installer.
export async function verifyCalendarNativeArtifact(record) {
  assert.ok(record && typeof record.path === 'string' && record.path.length, 'Explicit native artifact path');
  assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0 && record.bytes <= 1024 * 1024 * 1024, 'Bounded native artifact length');
  assert.match(record.sha256 ?? '', /^[0-9a-f]{64}$/u);
  const path = resolve(ROOT, record.path);
  await assertNoSymlinkPath(path);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile(), 'Native artifact is a regular file');
    assert.equal(stat.size, record.bytes, `Native artifact length: ${record.path}`);
    const hash = createHash('sha256'); let length = 0;
    for await (const bytes of handle.createReadStream({ autoClose: false })) { hash.update(bytes); length += bytes.length; }
    assert.equal(length, record.bytes, `Captured native artifact length: ${record.path}`);
    assert.equal(hash.digest('hex'), record.sha256, `Native artifact hash: ${record.path}`);
  } finally { await handle.close(); }
}

export async function inspectCalendarNativeGo({ nativeGoPaths = {}, indexSha256, releaseSha256, now = actualNow() } = {}) {
  const checks = [], blockers = [];
  for (const platform of ['android', 'ios']) {
    const path = nativeGoPaths[platform];
    if (!path) { blockers.push(`${platform}_native_GO_missing`); continue; }
    const bytes = await readRegular(resolve(path)), proof = parseJSON(bytes);
    assert.equal(proof.schema_version, 'svetlost33-native-calendar-release-go-1');
    assert.equal(proof.platform, platform, 'Native GO platform');
    assert.equal(proof.release_set_id, CALENDAR_BROWSER_RELEASE_ID); assert.equal(proof.sequence, CALENDAR_BROWSER_SEQUENCE);
    assert.equal(proof.index_sha256, indexSha256, 'Native GO exact signed index');
    assert.equal(proof.release_sha256, releaseSha256, 'Native GO exact signed release');
    assert.ok(Number.isFinite(Date.parse(proof.recorded_at)) && Date.parse(proof.recorded_at) <= Date.parse(now), 'Native GO is dated and not from the future');
    if (proof.status !== 'GO_FOR_S10_ACTIVATION') { blockers.push(`${platform}_native_GO_not_granted`); continue; }
    assert.ok(Array.isArray(proof.artifacts) && proof.artifacts.length > 0 && proof.artifacts.length <= 32, 'Native GO requires actual hashed status/build artifacts');
    assert.equal(new Set(proof.artifacts.map(item => item.path)).size, proof.artifacts.length, 'Unique native artifacts');
    for (const artifact of proof.artifacts) await verifyCalendarNativeArtifact(artifact);
    checks.push({ platform, path: resolve(path), bytes: bytes.length, sha256: sha256(bytes), status: proof.status,
      recorded_at: proof.recorded_at, artifacts: proof.artifacts });
  }
  return { checks, blockers };
}

// Pure classification enables controlled retries after immutable copying. A
// discovery pair with mixed or unknown bytes is never repaired automatically.
export function calendarInstallationDiff(existing, signed, expectedS9) {
  const exactPair = pair => pairPaths.every(path => existing.get(path)?.equals(pair.get(path)));
  const mode = exactPair(signed) ? 'already_installed' : exactPair(expectedS9) ? 's9_to_s10' : null;
  assert.ok(mode, 'Discovery pair is neither exact S9 nor this signed S10; coordinator review required');
  const missing = [];
  for (const [path, bytes] of signed) {
    if (pairPaths.includes(path)) continue;
    if (existing.has(path)) unchanged(existing.get(path), bytes, `Immutable collision: ${path}`);
    else missing.push(path);
  }
  missing.sort();
  if (mode === 'already_installed') assert.deepEqual(missing, [], 'Live S10 has incomplete immutable files; coordinator review required');
  return { mode, missing };
}

async function captureInstallPlan({ signedDirectory, productionDirectory = BASE, catalogPath, browserPath, evidencePath,
  nativeGoPaths = {}, coordinatorActivationGo = false, now = actualNow() } = {}) {
  assert.ok(typeof signedDirectory === 'string' && signedDirectory.length, 'Explicit signed stage required');
  await assertNoSymlinkPath(signedDirectory); await assertNoSymlinkPath(productionDirectory);
  assert.notEqual(resolve(signedDirectory), resolve(productionDirectory), 'Signed stage and production directory must differ');
  // The signed stage contains pinned archived S9, so a later live channel never
  // becomes the historical reconstruction authority.
  const options = { sourceDirectory: signedDirectory, catalogPath, browserPath, evidencePath, now };
  const plan = await createCalendarBrowserReleasePlan(options);
  const validation = await validateCalendarBrowserSignedRelease(signedDirectory, options);
  const signed = await readTree(signedDirectory), expected = new Map(plan.files);
  expected.delete('signing-request.json');
  const signaturePaths = plan.request.documents_to_sign.map(item => item.signature_path);
  assert.deepEqual([...signed.keys()].sort(), [...expected.keys(), ...signaturePaths].sort(), 'Exact signed installation inventory');
  for (const [path, bytes] of expected) unchanged(signed.get(path), bytes, `Exact signed installation bytes: ${path}`);
  const key = createPublicKey(plan.files.get('trusted-public-key.pem'));
  for (const document of plan.request.documents_to_sign) {
    const signature = signed.get(document.signature_path);
    assert.ok(signature.every(byte => byte < 128), 'ASCII captured installation signature');
    const encoded = signature.toString('ascii');
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\n$/u);
    assert.equal(Buffer.from(encoded.trim(), 'base64').toString('base64'), encoded.trim());
    assert.equal(verify('sha256', signed.get(document.path), { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(encoded.trim(), 'base64')), true, `Captured installation signature: ${document.path}`);
  }
  const expectedS9 = new Map(pairPaths.map(path => [path, plan.files.get(`${S9_ARCHIVE}/${path}`)]));
  const existing = await readTree(productionDirectory), diff = calendarInstallationDiff(existing, signed, expectedS9);
  const native = await inspectCalendarNativeGo({ nativeGoPaths, now, indexSha256: validation.index_sha256, releaseSha256: validation.release_sha256 });
  const blockers = [...native.blockers];
  if (coordinatorActivationGo !== true) blockers.unshift('coordinator_activation_GO_missing');
  try { assertCalendarMutationDeadline(plan.request); } catch { blockers.push('actual_publication_deadline_passed'); }
  const lockPath = resolve(productionDirectory, '.calendar-browser-s10-install.lock');
  if (await lstat(lockPath).catch(absent)) blockers.push('installation_lock_requires_coordinator_review');
  const report = { state: 'DRY_RUN_NO_WRITES', ready_to_install: blockers.length === 0, blockers,
    release_set_id: CALENDAR_BROWSER_RELEASE_ID, sequence: CALENDAR_BROWSER_SEQUENCE,
    index_sha256: validation.index_sha256, release_sha256: validation.release_sha256,
    mode: diff.mode, immutable_files_to_copy: diff.missing, signed_file_count: signed.size,
    signature_and_compatibility_checks: validation.checks.length, native_GO: native.checks,
    prospective_publication_plan: plan.request.prospective_publication_plan,
    public_publication_performed: false, production_discovery_changed: false };
  return { report, signed, expectedS9, plan, lockPath };
}

export async function inspectCalendarBrowserInstallation(options = {}) {
  return (await captureInstallPlan(options)).report;
}

async function assertDiscoveryPair(directory, expected, label) {
  for (const path of pairPaths) {
    await assertNoSymlinkPath(resolve(directory, path));
    unchanged(await readFile(resolve(directory, path)), expected.get(path), `${label}: ${path}`);
  }
}

async function verifyInstalledModules(directory, captured, now) {
  for (const [path, bytes] of captured.signed) {
    if (pairPaths.includes(path)) continue;
    await assertNoSymlinkPath(resolve(directory, path));
    unchanged(await readFile(resolve(directory, path)), bytes, `Installed immutable readback: ${path}`);
  }
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) checks.push(await validateRelease(directory,
    { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: CALENDAR_BROWSER_SEQUENCE, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES }));
  return checks;
}

/** Default is read-only. Local repository installation is not public publication. */
export async function installCalendarBrowserRelease(options = {}) {
  const { dryRun = true, coordinatorActivationGo = false, productionDirectory = BASE, nativeGoPaths = {} } = options;
  assert.equal(typeof dryRun, 'boolean', 'Explicit boolean dryRun');
  if (dryRun) return inspectCalendarBrowserInstallation(options);
  assert.equal(coordinatorActivationGo, true, 'Explicit coordinator activation GO required');
  // Caller-supplied `now` is solely a read-only facility. Mutation always uses
  // actual wall time for reconstruction, native approvals and the deadline.
  const captured = await captureInstallPlan({ ...options, now: actualNow() });
  assert.deepEqual(captured.report.blockers, [], 'Native/coordinator activation requirements are incomplete');
  assertCalendarMutationDeadline(captured.plan.request);
  if (captured.report.mode === 'already_installed') {
    await assertDiscoveryPair(productionDirectory, captured.signed, 'Exact already-installed discovery');
    await verifyInstalledModules(productionDirectory, captured, actualNow());
    return { ...captured.report, state: 'ALREADY_INSTALLED_NO_WRITES' };
  }
  await assertNoSymlinkPath(productionDirectory);
  const lock = await open(captured.lockPath, 'wx');
  const lockBytes = json({ release_set_id: CALENDAR_BROWSER_RELEASE_ID, index_sha256: captured.report.index_sha256, acquired_at: actualNow(), pid: process.pid });
  let temporaryDirectory;
  try {
    await lock.writeFile(lockBytes); await lock.sync();
    // First compare-and-swap boundary, before any immutable content copying.
    await assertDiscoveryPair(productionDirectory, captured.expectedS9, 'S9 changed before immutable copy');
    assertCalendarMutationDeadline(captured.plan.request);
    for (const [path, bytes] of captured.signed) {
      if (pairPaths.includes(path)) continue;
      const target = resolve(productionDirectory, path);
      await assertNoSymlinkPath(target, { allowMissing: true });
      const stat = await lstat(target).catch(absent);
      if (stat) { unchanged(await readRegular(target, 20 * 1024 * 1024), bytes, `Immutable collision during install: ${path}`); continue; }
      await mkdir(dirname(target), { recursive: true });
      await assertNoSymlinkPath(dirname(target));
      await writeFile(target, bytes, { flag: 'wx' });
      unchanged(await readFile(target), bytes, `New immutable readback: ${path}`);
    }
    temporaryDirectory = await mkdtemp(resolve(productionDirectory, '.calendar-browser-s10-discovery-'));
    for (const path of pairPaths) await writeFile(resolve(temporaryDirectory, path), captured.signed.get(path), { flag: 'wx' });
    const nativeAgain = await inspectCalendarNativeGo({ nativeGoPaths, now: actualNow(), indexSha256: captured.report.index_sha256, releaseSha256: captured.report.release_sha256 });
    assert.deepEqual(nativeAgain.blockers, []); assert.deepEqual(nativeAgain.checks, captured.report.native_GO, 'Native GO records changed during installation');
    // Second CAS is immediately before the discovery switch. Both exact S9
    // bytes must still be present, even after all immutable copies succeeded.
    assertCalendarMutationDeadline(captured.plan.request);
    await assertDiscoveryPair(productionDirectory, captured.expectedS9, 'S9 changed before final discovery switch');
    await rename(resolve(temporaryDirectory, 'index.sig'), resolve(productionDirectory, 'index.sig'));
    await rename(resolve(temporaryDirectory, 'index.json'), resolve(productionDirectory, 'index.json'));
    await assertDiscoveryPair(productionDirectory, captured.signed, 'Installed S10 discovery readback');
    const installedChecks = await verifyInstalledModules(productionDirectory, captured, actualNow());
    return { ...captured.report, state: 'INSTALLED_LOCALLY_NOT_PUBLISHED', production_discovery_changed: true,
      installed_at: actualNow(), installed_checks: installedChecks };
  } finally {
    await lock.close();
    if (temporaryDirectory) {
      for (const path of pairPaths) await unlink(resolve(temporaryDirectory, path)).catch(absent);
      await rmdir(temporaryDirectory);
    }
    // Remove only this invocation's lock; an unexpected replacement is left for
    // inspection. A crash/mixed discovery pair is never automatically repaired.
    if ((await readFile(captured.lockPath).catch(absent))?.equals(lockBytes)) await unlink(captured.lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { nativeGoPaths: {} };
  const flags = { '--signed': 'signedDirectory', '--production': 'productionDirectory', '--catalog': 'catalogPath', '--browser': 'browserPath', '--evidence': 'evidencePath', '--now': 'now' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--install') { assert.equal(options.dryRun, undefined); options.dryRun = false; continue; }
    if (flag === '--coordinator-activation-go') { assert.equal(options.coordinatorActivationGo, undefined); options.coordinatorActivationGo = true; continue; }
    if (flag === '--android-go' || flag === '--ios-go') {
      const platform = flag.slice(2, -3); assert.ok(args[index + 1] && !options.nativeGoPaths[platform]); options.nativeGoPaths[platform] = args[++index]; continue;
    }
    assert.ok(flags[flag] && args[index + 1] && options[flags[flag]] === undefined, 'Explicit installer arguments required');
    options[flags[flag]] = args[++index];
  }
  if (options.dryRun === false) assert.equal(options.now, undefined, '--now is permitted only for read-only installation inspection');
  console.log(JSON.stringify(await installCalendarBrowserRelease(options), null, 2));
}
