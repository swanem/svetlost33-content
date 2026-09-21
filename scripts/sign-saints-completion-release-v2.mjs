#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, KEY_ID, readTree, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { createSaintsCompletionReleasePlan, COMPLETION_RELEASE_ID, COMPLETION_SEQUENCE, COMPLETION_PROFILES, S8_INDEX_SHA256, S8_ARCHIVE, assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { buildSaintsCompletion } from './export-saints-completion-v1.mjs';
import { catalogPreflight } from './prepare-liturgical-catalog-release-v2.mjs';
import { evaluateSaintsDay, SAINTS_MODULE } from './validate-saints-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export async function validateSaintsCompletionRelease(directory, now = new Date().toISOString()) {
  await assertNoSymlinkPath(directory);
  // Reconstruct the exact approved plan from its authenticated S8 archive.
  const plan = await createSaintsCompletionReleasePlan({ sourceDirectory: directory, now });
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    for (const profile of COMPLETION_PROFILES) {
      const actual = await validateRelease(directory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
        minimumSequence: COMPLETION_SEQUENCE, clientCapabilities: profile.capabilities });
      assert.equal(actual.releaseSetId, COMPLETION_RELEASE_ID); assert.equal(actual.sequence, COMPLETION_SEQUENCE);
      assert.equal(actual.modules, profile.modules); assert.equal(actual.verifiedModules, 6);
      assert.deepEqual(actual.skippedOptionalModules, profile.skipped);
      checks.push({ platform, profile: profile.id, ...actual });
    }
  }
  const files = await readTree(directory), indexBytes = files.get('index.json'), index = JSON.parse(indexBytes);
  for (const [path, bytes] of plan.files) if (path !== 'signing-request.json')
    assert.ok(files.get(path)?.equals(bytes), `Signed approved-plan mismatch: ${path}`);
  const set = JSON.parse(files.get(index.channels.production.path)), expected = await buildSaintsCompletion();
  const saintsEntry = set.modules.find(entry => entry.module_id === 'saints-v1');
  const catalogEntry = set.modules.find(entry => entry.module_id === 'liturgical-catalog-v1');
  assert.deepEqual(files.get(`${dirname(saintsEntry.manifest_path)}/data/saints-v1.json`), expected.bytes);
  assert.deepEqual(files.get(`${dirname(catalogEntry.manifest_path)}/data/liturgical-catalog-v1.json`), expected.catalogBytes);
  const calendarEntry = set.modules.find(entry => entry.module_id === 'calendar-2026-r1');
  const calendar = JSON.parse(files.get(`${dirname(calendarEntry.manifest_path)}/${expected.payload.calendar_binding.path}`));
  for (const day of expected.payload.days) assert.equal(evaluateSaintsDay(expected.payload, { contentAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: expected.payload.version, revision: expected.payload.revision }, calendarAuthenticated: true,
    calendarContext: { ...expected.payload.calendar_binding, days: calendar.days }, date: day.date }).eligible, true);
  catalogPreflight(expected.catalog, files, set, indexBytes);
  return { release_set_id: COMPLETION_RELEASE_ID, sequence: COMPLETION_SEQUENCE, checks, saints_articles: 32, saints_days: 32,
    catalog_article_links: 2, index_sha256: sha256(indexBytes), release_sha256: index.channels.production.sha256,
    saints_sha256: sha256(expected.bytes), catalog_sha256: sha256(expected.catalogBytes) };
}

export async function signSaintsCompletionRelease({ candidate, out, privateKeyPath, coordinatorGo = false, sourceDirectory = BASE, now = new Date().toISOString() }) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator signing GO required');
  if (!candidate || !out || !privateKeyPath) throw new Error('Explicit candidate, new output and existing external private-key paths required');
  // Verify all approved inputs and candidate bytes before accessing the key.
  const plan = await createSaintsCompletionReleasePlan({ sourceDirectory, now });
  await assertNoSymlinkPath(candidate);
  const actual = await readTree(resolve(candidate));
  assert.equal(actual.size, plan.files.size, 'Candidate file set');
  for (const [path, bytes] of plan.files) assert.ok(actual.get(path)?.equals(bytes), `Candidate mismatch: ${path}`);
  await assertNoSymlinkPath(out, { allowMissing: true });
  if (await lstat(resolve(out)).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Output exists; refusing overwrite');
  // An archive is enough for historical verification, never for signing against
  // a live channel that has advanced. Check both live discovery bytes before
  // even stat-ing the private key, independently of the later installer CAS.
  for (const path of ['index.json', 'index.sig']) await assertNoSymlinkPath(resolve(sourceDirectory, path));
  assert.equal(sha256(await readFile(resolve(sourceDirectory, 'index.json'))), S8_INDEX_SHA256,
    'Signing source discovery advanced; replan before key access');
  assert.ok((await readFile(resolve(sourceDirectory, 'index.sig'))).equals(plan.files.get(`${S8_ARCHIVE}/index.sig`)),
    'Signing source discovery signature changed; replan before key access');
  await assertNoSymlinkPath(privateKeyPath);
  const keyStat = await lstat(resolve(privateKeyPath));
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('Key must be an existing regular non-symlink file');
  const privateBytes = await readFile(resolve(privateKeyPath));
  let privateKey;
  try { privateKey = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const trustedDer = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(trustedDer)) throw new Error('Selected key differs from existing production trust anchor');
  const files = new Map(plan.files); files.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) files.set(document.signature_path,
    Buffer.from(`${sign('sha256', files.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await writeNewTree(out, files);
  return validateSaintsCompletionRelease(out, now);
}

// Repository installation only. A normal reviewed Git commit/push remains the
// distinct public activation boundary. CAS rejects any source discovery advance.
export async function installSaintsCompletionSignedRelease({ signedDirectory, coordinatorGo = false, productionDirectory = BASE, now = new Date().toISOString() }) {
  assert.equal(coordinatorGo, true, 'Explicit coordinator activation GO required');
  const plan = await createSaintsCompletionReleasePlan({ sourceDirectory: productionDirectory, now });
  await assertNoSymlinkPath(signedDirectory);
  const signed = await readTree(resolve(signedDirectory));
  const signatures = plan.request.documents_to_sign.map(item => item.signature_path);
  const paths = [...plan.files.keys()].filter(path => path !== 'signing-request.json');
  assert.deepEqual([...signed.keys()].sort(), [...paths, ...signatures].sort(), 'Signed file set');
  for (const path of paths) assert.ok(signed.get(path)?.equals(plan.files.get(path)), `Signed bytes mismatch: ${path}`);
  await validateSaintsCompletionRelease(signedDirectory, now);
  const existing = await readTree(productionDirectory);
  assert.equal(sha256(existing.get('index.json')), S8_INDEX_SHA256, 'Production advanced; replan instead of overwriting');
  assert.ok(existing.get('index.sig')?.equals(plan.files.get(`${S8_ARCHIVE}/index.sig`)), 'Production discovery signature changed');
  for (const [path, bytes] of signed) if (!['index.json', 'index.sig'].includes(path) && existing.has(path))
    assert.ok(existing.get(path).equals(bytes), `Immutable collision: ${path}`);
  for (const [path, bytes] of signed) {
    if (['index.json', 'index.sig'].includes(path) || existing.has(path)) continue;
    const target = resolve(productionDirectory, path);
    await assertNoSymlinkPath(target, { allowMissing: true });
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
  }
  // As in the existing M0 publication process, only the final discovery pair is
  // replaceable. No force push, rollback-policy change or other tree is touched.
  await assertNoSymlinkPath(productionDirectory);
  assert.equal(sha256(await readFile(resolve(productionDirectory, 'index.json'))), S8_INDEX_SHA256, 'Production advanced during installation');
  for (const path of ['index.json', 'index.sig']) await assertNoSymlinkPath(resolve(productionDirectory, path));
  assert.ok((await readFile(resolve(productionDirectory, 'index.sig'))).equals(plan.files.get(`${S8_ARCHIVE}/index.sig`)),
    'Production discovery signature changed during installation');
  await writeFile(resolve(productionDirectory, 'index.json'), signed.get('index.json'));
  await writeFile(resolve(productionDirectory, 'index.sig'), signed.get('index.sig'));
  return validateSaintsCompletionRelease(productionDirectory, now);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), gate = args.includes('--coordinator-go');
  const filtered = args.filter(value => value !== '--coordinator-go');
  if (filtered.length === 2 && filtered[0] === '--validate-signed') console.log(JSON.stringify(await validateSaintsCompletionRelease(filtered[1]), null, 2));
  else if (filtered.length === 2 && filtered[0] === '--install-signed') console.log(JSON.stringify(await installSaintsCompletionSignedRelease({ signedDirectory: filtered[1], coordinatorGo: gate }), null, 2));
  else {
    const values = new Map();
    for (let index = 0; index < filtered.length; index += 2) {
      if (!['--candidate', '--out', '--private-key'].includes(filtered[index]) || !filtered[index + 1] || values.has(filtered[index])) throw new Error('Usage: --candidate <dir> --out <new-dir> --private-key <existing-key> --coordinator-go; or --install-signed <dir> --coordinator-go; or --validate-signed <dir>');
      values.set(filtered[index], filtered[index + 1]);
    }
    console.log(JSON.stringify(await signSaintsCompletionRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key'), coordinatorGo: gate }), null, 2));
  }
}
