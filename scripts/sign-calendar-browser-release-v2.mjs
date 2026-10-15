#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants as cryptoConstants, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, readTree, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { createCalendarBrowserReleasePlan, CALENDAR_BROWSER_RELEASE_ID, CALENDAR_BROWSER_SEQUENCE,
  CALENDAR_BROWSER_PROFILES, S9_ARCHIVE, S9_INDEX_SHA256 } from './prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

const within = (parent, child) => { const path = relative(resolve(parent), resolve(child)); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)); };
const unchanged = (actual, expected, label) => assert.ok(actual?.equals(expected), label);

export function assertCalendarPublicationDeadline(request, now = new Date().toISOString()) {
  const plan = request.prospective_publication_plan;
  assert.ok(Number.isFinite(Date.parse(now)), 'Valid signing time');
  if (!plan) return;
  assert.equal(plan.status, 'PLANNED_NOT_PUBLISHED');
  const deadline = Date.parse(plan.publish_before_utc), earliestStart = Date.parse(`${plan.start_date}T00:00:00Z`) - 14 * 60 * 60 * 1000;
  assert.ok(Number.isFinite(deadline) && Date.parse(now) < deadline && deadline <= earliestStart,
    'Prospective publication deadline passed or invalid; rebuild with a later start');
}

// Mutating operations always consult the real clock independently of any
// historical `now` used by read-only reconstruction. There is no CLI override.
export function assertCalendarMutationDeadline(request) {
  assertCalendarPublicationDeadline(request, new Date(Date.now()).toISOString());
}

// A PEM encoding difference does not imply a different key. Compare actual SPKI
// public-key bytes, and never replace the pinned trust anchor with the key input.
export function assertCalendarSigningKey(publicKey, trustedPem) {
  const trusted = createPublicKey(trustedPem).export({ type: 'spki', format: 'der' });
  assert.ok(publicKey.export({ type: 'spki', format: 'der' }).equals(trusted), 'Selected key differs from existing production trust anchor');
}

async function assertLiveS9(sourceDirectory, plan) {
  for (const path of ['index.json', 'index.sig']) await assertNoSymlinkPath(resolve(sourceDirectory, path));
  assert.equal(sha256(await readFile(resolve(sourceDirectory, 'index.json'))), S9_INDEX_SHA256,
    'Signing source discovery advanced; replan before key access or output');
  unchanged(await readFile(resolve(sourceDirectory, 'index.sig')), plan.files.get(`${S9_ARCHIVE}/index.sig`), 'Signing source discovery signature changed');
}

async function validateSignedSnapshot(directory, plan, now) {
  await assertNoSymlinkPath(directory);
  const actual = await readTree(directory), documents = plan.request.documents_to_sign;
  const expected = [...plan.files.keys()].filter(path => path !== 'signing-request.json');
  assert.deepEqual([...actual.keys()].sort(), [...expected, ...documents.map(item => item.signature_path)].sort(), 'Exact signed candidate file set');
  for (const path of expected) unchanged(actual.get(path), plan.files.get(path), `Signed candidate bytes: ${path}`);
  const key = createPublicKey(plan.files.get('trusted-public-key.pem'));
  // Authenticate the same captured bytes used in the exact-plan comparison;
  // filesystem validation below additionally checks both complete client graphs.
  for (const document of documents) {
    const raw = actual.get(document.signature_path);
    assert.ok(raw.every(byte => byte < 128), 'ASCII detached signature');
    const encoded = raw.toString('ascii');
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\n$/u);
    assert.equal(Buffer.from(encoded.trim(), 'base64').toString('base64'), encoded.trim());
    assert.equal(verify('sha256', actual.get(document.path), { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(encoded.trim(), 'base64')), true, `Signed candidate signature: ${document.path}`);
  }
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(directory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      minimumSequence: CALENDAR_BROWSER_SEQUENCE, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, CALENDAR_BROWSER_RELEASE_ID); assert.equal(result.sequence, CALENDAR_BROWSER_SEQUENCE);
    assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7);
    assert.deepEqual(result.skippedOptionalModules, profile.skipped);
    checks.push({ platform, profile: profile.id, ...result });
  }
  return { state: 'SIGNED_LOCAL_STAGE_NOT_PUBLISHED', release_set_id: CALENDAR_BROWSER_RELEASE_ID,
    sequence: CALENDAR_BROWSER_SEQUENCE, index_sha256: sha256(actual.get('index.json')),
    release_sha256: plan.index.channels.production.sha256, publication_authorized: false, production_activated: false,
    native_platform_release_GO_required_before_activation: true,
    prospective_publication_plan: plan.request.prospective_publication_plan, checks };
}

/** Read-only validation against explicit reviewed inputs and pinned current/archived S9. */
export async function validateCalendarBrowserSignedRelease(directory, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const plan = await createCalendarBrowserReleasePlan({ ...options, now });
  return validateSignedSnapshot(resolve(directory), plan, now);
}

/** Local signing only. This utility has no installer, network access or activation path. */
export async function signCalendarBrowserRelease({ candidate, out, privateKeyPath, coordinatorGo = false,
  sourceDirectory = BASE, catalogPath, browserPath, evidencePath, now = new Date().toISOString() } = {}) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator signing GO required');
  for (const [label, path] of Object.entries({ candidate, out, privateKeyPath })) assert.ok(typeof path === 'string' && path.length, `Explicit ${label} required`);
  const started = Date.now(), currentTime = () => new Date(Date.parse(now) + Date.now() - started).toISOString();
  // Derive the plan again from independently authenticated S9 and the exact
  // local review. Candidate/request booleans can never authorize themselves.
  const plan = await createCalendarBrowserReleasePlan({ sourceDirectory, catalogPath, browserPath, evidencePath, now });
  await assertNoSymlinkPath(candidate);
  const actual = await readTree(resolve(candidate));
  assert.equal(actual.size, plan.files.size, 'Exact unsigned candidate file set');
  for (const [path, bytes] of plan.files) unchanged(actual.get(path), bytes, `Unsigned candidate bytes: ${path}`);
  assert.ok(!within(resolve(ROOT, 'releases'), out) && !within(sourceDirectory, out), 'Signed stage must be outside releases and production source');
  await assertNoSymlinkPath(out, { allowMissing: true });
  assert.equal(await lstat(resolve(out)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false, 'Output exists; refusing overwrite');
  assert.ok(![ROOT, sourceDirectory, candidate, out].some(path => within(path, privateKeyPath)), 'Private key must remain outside the repository and public content trees');
  assertCalendarPublicationDeadline(plan.request, currentTime());
  assertCalendarMutationDeadline(plan.request);
  await assertLiveS9(sourceDirectory, plan);
  // No private-key path is inspected before every input, inventory and gate passes.
  await assertNoSymlinkPath(privateKeyPath);
  const handle = await open(resolve(privateKeyPath), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let privateKey;
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= 65536, 'Existing regular bounded private key required');
    const bytes = await handle.readFile();
    try { privateKey = createPrivateKey(bytes); } finally { bytes.fill(0); }
  } finally { await handle.close(); }
  assertCalendarSigningKey(createPublicKey(privateKey), plan.files.get('trusted-public-key.pem'));
  const signed = new Map(plan.files); signed.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) signed.set(document.signature_path,
    Buffer.from(`${sign('sha256', signed.get(document.path), { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  assertCalendarPublicationDeadline(plan.request, currentTime());
  assertCalendarMutationDeadline(plan.request);
  await assertLiveS9(sourceDirectory, plan);
  await assertNoSymlinkPath(out, { allowMissing: true });
  await writeNewTree(out, signed);
  return validateSignedSnapshot(resolve(out), plan, currentTime());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {}, flags = { '--candidate': 'candidate', '--out': 'out', '--private-key': 'privateKeyPath',
    '--catalog': 'catalogPath', '--browser': 'browserPath', '--evidence': 'evidencePath', '--now': 'now', '--validate-signed': 'signedDirectory' };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--coordinator-go') { assert.equal(options.coordinatorGo, undefined); options.coordinatorGo = true; continue; }
    assert.ok(flags[args[index]] && args[index + 1] && options[flags[args[index]]] === undefined, 'Explicit signing or validation arguments required');
    options[flags[args[index]]] = args[++index];
  }
  if (options.signedDirectory) console.log(JSON.stringify(await validateCalendarBrowserSignedRelease(options.signedDirectory, options), null, 2));
  else {
    assert.equal(options.now, undefined, '--now is permitted only for read-only signed validation');
    console.log(JSON.stringify(await signCalendarBrowserRelease(options), null, 2));
  }
}
