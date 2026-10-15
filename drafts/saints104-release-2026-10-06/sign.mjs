#!/usr/bin/env node
// LOCAL-ONLY S13 signing. No installer, activation, git, upload or key discovery.
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, PUBLIC_KEY_SHA256, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from '../../scripts/prepare-saints-completion-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { assertRefreshExternalKey, captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from '../../scripts/prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { fetchExactPublicFile } from '../../scripts/verify-public-shared-refresh-v2.mjs';
import { createPlan, approvedInputs, RELEASE_ID, SEQUENCE, S12_INDEX_SHA, S12_ARCHIVE, PUBLIC_COMMIT } from './prepare.mjs';

const actualNow = () => new Date().toISOString();
const equal = (a, b, label) => assert.ok(a?.equals(b), label);
const absent = error => { if (error.code === 'ENOENT') return null; throw error; };
const within = (root, path) => { const r = relative(resolve(root), resolve(path)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

export async function assertUnsignedCandidate(candidate, plan) {
  const files = await captureRefreshTree(resolve(candidate));
  assert.deepEqual([...files.keys()].sort(), [...plan.files.keys()].sort(), 'Exact unsigned file set');
  for (const [path, bytes] of plan.files) equal(files.get(path), bytes, `Unsigned approved-plan mismatch: ${path}`);
}

export async function assertLiveS12(sourceDirectory, plan) {
  assert.equal(sha256(await readRefreshInput(resolve(sourceDirectory, 'index.json'))), S12_INDEX_SHA, 'S12 source advanced: replan before key access or output');
  equal(await readRefreshInput(resolve(sourceDirectory, 'index.sig')), plan.files.get(`${S12_ARCHIVE}/index.sig`), 'S12 source signature changed');
}

export async function assertFreshPublicS12(plan) {
  for (const path of ['index.json', 'index.sig']) await fetchExactPublicFile(path, plan.files.get(`${S12_ARCHIVE}/${path}`), globalThis.fetch);
}

export async function assertNewOutput(out, { sourceDirectory, candidate }) {
  for (const root of [resolve(ROOT, 'releases'), sourceDirectory, candidate]) {
    assert.equal(within(root, out) || within(out, root), false, 'Output must be disjoint from production/source/candidate trees');
  }
  await assertNoSymlinkPath(out, { allowMissing: true });
  assert.equal(await lstat(resolve(out)).catch(absent), null, 'New immutable signed output directory required');
}

/** Pure signing primitive used by production wrapper and isolated ephemeral tests. No filesystem access. */
export function signDocuments(files, documents, key) {
  const result = new Map(files);
  for (const item of documents) {
    const bytes = result.get(item.path); assert.ok(bytes);
    assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256, 'Exact document before signing');
    assert.equal(result.has(item.signature_path), false, 'Never overwrite an existing signature');
    result.set(item.signature_path, Buffer.from(`${sign('sha256', bytes, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  }
  return result;
}

export function assertProductionKey(key, publicBytes) {
  assert.equal(sha256(publicBytes), PUBLIC_KEY_SHA256, 'Pinned production trust anchor');
  const expected = createPublicKey(publicBytes).export({ type: 'spki', format: 'der' });
  equal(createPublicKey(key).export({ type: 'spki', format: 'der' }), expected, 'Existing production signing key required; no rotation');
}

/** Read-only publication guard for the coordinator's fresh clone; this is NOT a publisher. */
export async function assertPublicationTarget(target, plan, signedFiles, observedHead) {
  assert.equal(observedHead, PUBLIC_COMMIT, 'Public HEAD advanced: compare-and-swap/replan required');
  await assertLiveS12(target, plan);
  const expected = [...plan.request.publication_allowlist].sort();
  assert.equal(expected.length, 15); assert.equal(new Set(expected).size, 15);
  for (const path of expected) {
    assert.ok(signedFiles.has(path), `Signed publication path: ${path}`);
    if (path === 'index.json' || path === 'index.sig') continue;
    const absolute = resolve(target, path);
    await assertNoSymlinkPath(absolute, { allowMissing: true });
    if (await lstat(absolute).catch(absent)) equal(await readRefreshInput(absolute), signedFiles.get(path), `Immutable publication path conflict: ${path}`);
  }
  return { status: 'READ_ONLY_PUBLICATION_GUARDS_PASS', expected_head: PUBLIC_COMMIT, allowlist: expected,
    atomic_git_compare_and_swap_still_required: true, native_acceptance_still_required: true, published: false };
}

export async function validateSigned(directory, { now = actualNow() } = {}) {
  const plan = await createPlan({ sourceDirectory: directory, archived: true, now });
  const files = await captureRefreshTree(directory), paths = [...plan.files.keys()].filter(p => p !== 'signing-request.json');
  const signatures = plan.request.documents_to_sign.map(x => x.signature_path);
  assert.deepEqual([...files.keys()].sort(), [...paths, ...signatures].sort(), 'Exact signed stage; no private approval/signing notes');
  for (const path of paths) equal(files.get(path), plan.files.get(path), `Signed approved-plan mismatch: ${path}`);
  assert.equal(sha256(files.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256);
  const checks = [];
  for (const [platform, clientVersion] of [['android', 66], ['ios', '0.1.14']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(directory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      minimumSequence: SEQUENCE, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, RELEASE_ID); assert.equal(result.sequence, SEQUENCE);
    assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7); assert.deepEqual(result.skippedOptionalModules, profile.skipped);
    checks.push({ platform, profile: profile.id, ...result });
  }
  return { status: 'SIGNED_LOCAL_S13_VALID_NOT_PUBLISHED', release_set_id: RELEASE_ID, sequence: SEQUENCE,
    index_sha256: sha256(files.get('index.json')), release_sha256: plan.report.release_sha256, checks,
    public_files: plan.request.publication_allowlist.map(path => ({ path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    native_exact_generation_acceptance_required: true, published: false };
}

export async function signS13({ candidate, out, privateKeyPath, coordinatorGo = false, sourceDirectory = BASE } = {}) {
  assert.equal(coordinatorGo, true, 'Separate explicit coordinator signing GO required');
  assert.ok(candidate && out && privateKeyPath, 'Explicit candidate, new output and external existing key required');
  await approvedInputs();
  assertRefreshExternalKey(privateKeyPath, [sourceDirectory, candidate, out]);
  const plan = await createPlan({ sourceDirectory, now: actualNow() });
  await assertUnsignedCandidate(candidate, plan); await assertNewOutput(out, { sourceDirectory, candidate });
  await assertLiveS12(sourceDirectory, plan); await assertFreshPublicS12(plan);
  await createPlan({ sourceDirectory, now: actualNow() });
  // All authorization, exact bytes, source freshness and output guards precede key access.
  const privateBytes = await readRefreshInput(resolve(privateKeyPath), 64 * 1024);
  let key; try { key = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  assertProductionKey(key, plan.files.get('trusted-public-key.pem'));
  const unsigned = new Map(plan.files); unsigned.delete('signing-request.json');
  const signed = signDocuments(unsigned, plan.request.documents_to_sign, key);
  await assertLiveS12(sourceDirectory, plan); await assertFreshPublicS12(plan);
  await assertUnsignedCandidate(candidate, plan); await createPlan({ sourceDirectory, now: actualNow() });
  await assertNewOutput(out, { sourceDirectory, candidate });
  await writeNewTree(out, signed);
  return validateSigned(out);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), coordinatorGo = args.includes('--coordinator-go'), rest = args.filter(x => x !== '--coordinator-go'), values = new Map();
  assert.equal(args.filter(x => x === '--coordinator-go').length <= 1, true);
  for (let n = 0; n < rest.length; n += 2) {
    assert.ok(['--candidate', '--out', '--private-key', '--source', '--validate-signed'].includes(rest[n]) && rest[n + 1] && !values.has(rest[n]), 'Invalid/duplicate argument'); values.set(rest[n], rest[n + 1]);
  }
  let result;
  if (values.has('--validate-signed')) { assert.equal(values.size, 1); assert.equal(coordinatorGo, false); result = await validateSigned(values.get('--validate-signed')); }
  else { assert.equal(values.size, 4); result = await signS13({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key'), sourceDirectory: values.get('--source'), coordinatorGo }); }
  console.log(JSON.stringify(result, null, 2));
}
