#!/usr/bin/env node
// Local-only S12 signer/validator. No network, installer, activation or publication.
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, KEY_ID, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { readRefreshInput } from './prepare-shared-refresh-release-v2.mjs';
import { assertRefreshExternalKey, captureRefreshTree } from './sign-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from './prepare-calendar-browser-release-v2.mjs';
import { createCalendarSaintsWindowPlan, assertWindowApproval, WINDOW_RELEASE_ID, WINDOW_SEQUENCE,
  S11_ARCHIVE, S11_INDEX_SHA256 } from './prepare-calendar-saints-window-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

const actualNow = () => new Date().toISOString();
const equal = (actual, expected, label) => assert.ok(actual?.equals(expected), label);
const absent = error => { if (error.code === 'ENOENT') return null; throw error; };

export async function assertWindowUnsignedCandidate(candidate, plan) {
  const files = await captureRefreshTree(resolve(candidate));
  assert.deepEqual([...files.keys()].sort(), [...plan.files.keys()].sort(), 'Exact unsigned candidate file set');
  for (const [path, bytes] of plan.files) equal(files.get(path), bytes, `Unsigned approved-plan mismatch: ${path}`);
}

async function assertLiveS11(sourceDirectory, plan) {
  assert.equal(sha256(await readRefreshInput(resolve(sourceDirectory, 'index.json'))), S11_INDEX_SHA256,
    'S11 live discovery advanced: replan before key access or mutation');
  equal(await readRefreshInput(resolve(sourceDirectory, 'index.sig')), plan.files.get(`${S11_ARCHIVE}/index.sig`), 'Live source signature changed');
}

/** Reconstruct from authenticated preserved S11; compare complete new stage then verify all 24 profiles. */
export async function validateCalendarSaintsWindowSigned(directory, { now = actualNow() } = {}) {
  const plan = await createCalendarSaintsWindowPlan({ sourceDirectory: directory, archived: true, now });
  const files = await captureRefreshTree(directory);
  const unsigned = [...plan.files.keys()].filter(path => path !== 'signing-request.json');
  const signatures = plan.request.documents_to_sign.map(item => item.signature_path);
  assert.deepEqual([...files.keys()].sort(), [...unsigned, ...signatures].sort(), 'Exact signed file set without private review or signing request');
  for (const path of unsigned) equal(files.get(path), plan.files.get(path), `Signed approved-plan mismatch: ${path}`);
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(directory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      minimumSequence: WINDOW_SEQUENCE, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, WINDOW_RELEASE_ID); assert.equal(result.sequence, WINDOW_SEQUENCE);
    assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7);
    assert.deepEqual(result.skippedOptionalModules, profile.skipped);
    checks.push({ platform, profile: profile.id, ...result });
  }
  return { status: 'SIGNED_LOCAL_S12_VALID_NOT_PUBLISHED', release_set_id: WINDOW_RELEASE_ID, sequence: WINDOW_SEQUENCE,
    index_sha256: sha256(files.get('index.json')), release_sha256: plan.report.release_sha256,
    catalog_sha256: plan.report.catalog_sha256, browser_sha256: plan.report.browser_sha256, checks,
    public_files: plan.request.publication_allowlist.map(path => ({ path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    native_acceptance_required_before_activation: true, production_activated: false, published: false };
}

export async function signCalendarSaintsWindow({ candidate, out, privateKeyPath, coordinatorGo = false, sourceDirectory = BASE } = {}) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator signing GO required');
  assert.ok(candidate && out && privateKeyPath, 'Explicit candidate, new output and external key paths required');
  await assertWindowApproval();
  assertRefreshExternalKey(privateKeyPath, [sourceDirectory, candidate, out]);
  const plan = await createCalendarSaintsWindowPlan({ sourceDirectory, now: actualNow() });
  await assertWindowUnsignedCandidate(candidate, plan);
  await assertNoSymlinkPath(out, { allowMissing: true });
  assert.equal(await lstat(resolve(out)).catch(absent), null, 'New signed output directory required');
  await assertLiveS11(sourceDirectory, plan);
  await createCalendarSaintsWindowPlan({ sourceDirectory, now: actualNow() });
  // No key bytes are accessed until exact authorization, plan, base and output checks pass.
  const privateBytes = await readRefreshInput(resolve(privateKeyPath), 64 * 1024);
  let key;
  try { key = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const expected = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  equal(createPublicKey(key).export({ type: 'spki', format: 'der' }), expected, 'Existing production signing key required; no key rotation');
  const signed = new Map(plan.files); signed.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) signed.set(document.signature_path,
    Buffer.from(`${sign('sha256', signed.get(document.path), { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await assertLiveS11(sourceDirectory, plan);
  await assertWindowUnsignedCandidate(candidate, plan);
  await createCalendarSaintsWindowPlan({ sourceDirectory, now: actualNow() });
  await writeNewTree(out, signed);
  return validateCalendarSaintsWindowSigned(out);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), coordinatorGo = args.includes('--coordinator-go');
  const rest = args.filter(item => item !== '--coordinator-go'), values = new Map();
  for (let n = 0; n < rest.length; n += 2) {
    assert.ok(['--candidate', '--out', '--private-key', '--source', '--validate-signed'].includes(rest[n]) && rest[n + 1] && !values.has(rest[n]), 'Invalid or duplicate argument');
    values.set(rest[n], rest[n + 1]);
  }
  let result;
  if (values.has('--validate-signed')) {
    assert.equal(values.size, 1); assert.equal(coordinatorGo, false);
    result = await validateCalendarSaintsWindowSigned(values.get('--validate-signed'));
  } else {
    assert.equal(values.size, 4);
    result = await signCalendarSaintsWindow({ candidate: values.get('--candidate'), out: values.get('--out'),
      privateKeyPath: values.get('--private-key'), sourceDirectory: values.get('--source'), coordinatorGo });
  }
  console.log(JSON.stringify(result, null, 2));
}
