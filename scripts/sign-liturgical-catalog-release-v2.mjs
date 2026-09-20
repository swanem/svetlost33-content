#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, CAPABILITIES, KEY_ID, readTree, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { SAINTS_CAPABILITIES } from './prepare-saints-release-v2.mjs';
import { CATALOG_CAPABILITIES, CATALOG_RELEASE_ID, CATALOG_SEQUENCE, S6_INDEX_SHA256, createCatalogReleasePlan, catalogPreflight } from './prepare-liturgical-catalog-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export async function validateCatalogRelease(directory, now = new Date().toISOString()) {
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    const options = { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: CATALOG_SEQUENCE };
    const current = await validateRelease(directory, { ...options, clientCapabilities: CATALOG_CAPABILITIES });
    assert.equal(current.releaseSetId, CATALOG_RELEASE_ID); assert.equal(current.modules, 6); assert.deepEqual(current.skippedOptionalModules, []);
    const saints = await validateRelease(directory, { ...options, clientCapabilities: SAINTS_CAPABILITIES });
    assert.equal(saints.modules, 5); assert.deepEqual(saints.skippedOptionalModules, ['liturgical-catalog-v1']);
    const previous = await validateRelease(directory, { ...options, clientCapabilities: CAPABILITIES });
    assert.equal(previous.modules, 4); assert.deepEqual(previous.skippedOptionalModules, ['saints-v1', 'liturgical-catalog-v1']);
    const oldest = await validateRelease(directory, { ...options, clientCapabilities: CAPABILITIES.filter(cap => cap !== 'organizations-v1') });
    assert.equal(oldest.modules, 3); assert.deepEqual(oldest.skippedOptionalModules, ['organizations-v1', 'saints-v1', 'liturgical-catalog-v1']);
    checks.push({ platform, current, saints_capabilities: saints, previous_capabilities: previous, no_optional_capabilities: oldest });
  }
  const files = await readTree(directory), indexBytes = files.get('index.json'), index = JSON.parse(indexBytes);
  const set = JSON.parse(files.get(index.channels.production.path));
  const entry = set.modules.find(item => item.module_id === 'liturgical-catalog-v1');
  catalogPreflight(JSON.parse(files.get(`${dirname(entry.manifest_path)}/data/liturgical-catalog-v1.json`)), files, set, indexBytes);
  return checks;
}

export async function signCatalogRelease({ candidate, out, privateKeyPath, sourceDirectory = BASE, now = new Date().toISOString() }) {
  if (!candidate || !out || !privateKeyPath) throw new Error('Explicit candidate, new output and existing external private-key paths required');
  const plan = await createCatalogReleasePlan({ sourceDirectory, now });
  const actual = await readTree(resolve(candidate));
  assert.equal(actual.size, plan.files.size, 'Candidate file set');
  for (const [path, bytes] of plan.files) assert.ok(actual.get(path)?.equals(bytes), `Candidate mismatch: ${path}`);
  if (await lstat(resolve(out)).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Output exists; refusing overwrite');
  const keyStat = await lstat(resolve(privateKeyPath));
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('Key must be an existing regular non-symlink file');
  const privateBytes = await readFile(resolve(privateKeyPath));
  let privateKey;
  try { privateKey = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const trustedPublicDer = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(trustedPublicDer)) throw new Error('Selected key differs from existing production trust anchor');
  const files = new Map(plan.files); files.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) files.set(document.signature_path,
    Buffer.from(`${sign('sha256', files.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await writeNewTree(out, files);
  return validateCatalogRelease(out, now);
}

// Separate activation step. Never called by preparation/signing. Execution
// requires the release coordinator's explicit GO after both native QA checks.
export async function installCatalogSignedRelease({ signedDirectory, productionDirectory = BASE, now = new Date().toISOString() }) {
  const plan = await createCatalogReleasePlan({ sourceDirectory: productionDirectory, now });
  const signed = await readTree(resolve(signedDirectory));
  const signatures = plan.request.documents_to_sign.map(item => item.signature_path);
  const paths = [...plan.files.keys()].filter(path => path !== 'signing-request.json');
  assert.deepEqual([...signed.keys()].sort(), [...paths, ...signatures].sort(), 'Signed file set');
  for (const path of paths) assert.ok(signed.get(path)?.equals(plan.files.get(path)), `Signed bytes mismatch: ${path}`);
  await validateCatalogRelease(signedDirectory, now);
  const existing = await readTree(productionDirectory);
  assert.equal(sha256(existing.get('index.json')), S6_INDEX_SHA256, 'Production advanced; replan instead of overwriting');
  for (const [path, bytes] of signed) if (!['index.json', 'index.sig'].includes(path) && existing.has(path)) assert.ok(existing.get(path).equals(bytes), `Immutable collision: ${path}`);
  for (const [path, bytes] of signed) {
    if (['index.json', 'index.sig'].includes(path) || existing.has(path)) continue;
    const target = resolve(productionDirectory, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
  }
  await writeFile(resolve(productionDirectory, 'index.json'), signed.get('index.json'));
  await writeFile(resolve(productionDirectory, 'index.sig'), signed.get('index.sig'));
  return validateCatalogRelease(productionDirectory, now);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--install-signed') console.log(JSON.stringify(await installCatalogSignedRelease({ signedDirectory: args[1] }), null, 2));
  else {
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--candidate', '--out', '--private-key'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: --candidate <dir> --out <new-dir> --private-key <existing-key>, or --install-signed <dir> after coordinator GO');
      values.set(args[i], args[i + 1]);
    }
    console.log(JSON.stringify(await signCatalogRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key') }), null, 2));
  }
}
