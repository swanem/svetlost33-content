#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, CAPABILITIES, KEY_ID, readTree, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { createSaintsReleasePlan, SAINTS_CAPABILITIES, SAINTS_RELEASE_ID, SAINTS_SEQUENCE, S4_INDEX_SHA256 } from './prepare-saints-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export async function validateSaintsRelease(directory, now = new Date().toISOString(), discovery = {}) {
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    const options = { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: SAINTS_SEQUENCE,
      indexPath: discovery.indexPath, indexSignaturePath: discovery.indexSignaturePath };
    const current = await validateRelease(directory, { ...options, clientCapabilities: SAINTS_CAPABILITIES });
    assert.equal(current.releaseSetId, SAINTS_RELEASE_ID);
    assert.equal(current.modules, 5); assert.equal(current.verifiedModules, 5);
    assert.deepEqual(current.skippedOptionalModules, []);
    const older = await validateRelease(directory, { ...options, clientCapabilities: CAPABILITIES });
    assert.equal(older.modules, 4); assert.deepEqual(older.skippedOptionalModules, ['saints-v1']);
    const oldest = await validateRelease(directory, { ...options, clientCapabilities: CAPABILITIES.filter(cap => cap !== 'organizations-v1') });
    assert.equal(oldest.modules, 3); assert.deepEqual(oldest.skippedOptionalModules, ['organizations-v1', 'saints-v1']);
    checks.push({ platform, current, previous_capabilities: older, without_optional_capabilities: oldest });
  }
  return checks;
}

export async function signSaintsRelease({ candidate, out, privateKeyPath, sourceDirectory = BASE, now = new Date().toISOString() }) {
  if (!candidate || !out || !privateKeyPath) throw new Error('Explicit candidate, new output and external existing private-key paths required');
  // Reconstruct the approved graph before accessing private key material.
  const plan = await createSaintsReleasePlan({ sourceDirectory, now });
  const candidateFiles = await readTree(resolve(candidate));
  assert.equal(candidateFiles.size, plan.files.size, 'Candidate file set');
  for (const [path, bytes] of plan.files) assert.ok(candidateFiles.get(path)?.equals(bytes), `Candidate mismatch: ${path}`);
  const present = await lstat(resolve(out)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (present) throw new Error('Output exists; refusing overwrite');
  const keyStat = await lstat(resolve(privateKeyPath));
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('Selected key must be a regular non-symlink file');
  const privateBytes = await readFile(resolve(privateKeyPath));
  let privateKey;
  try { privateKey = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const expected = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(expected)) throw new Error('Selected key differs from existing production trust anchor');
  const files = new Map(plan.files); files.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) files.set(document.signature_path,
    Buffer.from(`${sign('sha256', files.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await writeNewTree(out, files);
  return validateSaintsRelease(out, now);
}

// Installs generated, validated artifacts into the repository only. A normal
// reviewed Git commit/push is still the separate public activation boundary.
// Existing immutable files are compared, never overwritten; discovery's S4
// hash is an explicit compare-and-swap precondition. No S5 tree is selected.
export async function installSaintsSignedRelease({ signedDirectory, productionDirectory = BASE, now = new Date().toISOString() }) {
  const plan = await createSaintsReleasePlan({ sourceDirectory: productionDirectory, now });
  const signed = await readTree(resolve(signedDirectory));
  const signaturePaths = new Set(plan.request.documents_to_sign.map(document => document.signature_path));
  const expectedPaths = [...plan.files.keys()].filter(path => path !== 'signing-request.json');
  assert.deepEqual([...signed.keys()].sort(), [...expectedPaths, ...signaturePaths].sort(), 'Signed output file set');
  for (const path of expectedPaths) assert.ok(signed.get(path)?.equals(plan.files.get(path)), `Signed output mismatch: ${path}`);
  await validateSaintsRelease(signedDirectory, now);
  const existing = await readTree(productionDirectory);
  assert.equal(sha256(existing.get('index.json')), S4_INDEX_SHA256, 'Live repository source advanced; replan rather than overwrite');
  for (const [path, bytes] of signed) {
    if (path === 'index.json' || path === 'index.sig') continue;
    if (existing.has(path)) assert.ok(existing.get(path).equals(bytes), `Immutable output collision: ${path}`);
  }
  for (const [path, bytes] of signed) {
    if (path === 'index.json' || path === 'index.sig' || existing.has(path)) continue;
    const target = resolve(productionDirectory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  await writeFile(resolve(productionDirectory, 'index.json'), signed.get('index.json'));
  await writeFile(resolve(productionDirectory, 'index.sig'), signed.get('index.sig'));
  return validateSaintsRelease(productionDirectory, now);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--install-signed') {
    console.log(JSON.stringify(await installSaintsSignedRelease({ signedDirectory: args[1] }), null, 2));
  } else {
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--candidate', '--out', '--private-key'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: --candidate <dir> --out <new-dir> --private-key <existing-external-key>, or --install-signed <validated-dir>');
      values.set(args[i], args[i + 1]);
    }
    console.log(JSON.stringify(await signSaintsRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key') }), null, 2));
  }
}
