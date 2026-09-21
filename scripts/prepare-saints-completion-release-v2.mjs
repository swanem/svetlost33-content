#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { SAINTS_CAPABILITIES } from './prepare-saints-release-v2.mjs';
import { CATALOG_CAPABILITIES, catalogPreflight } from './prepare-liturgical-catalog-release-v2.mjs';
import { buildSaintsCompletion, COMPLETION_APPROVAL_PATH, COMPLETION_APPROVAL_SHA256, COMPLETION_INPUTS } from './export-saints-completion-v1.mjs';
import { SAINTS_MODULE, evaluateSaintsDay } from './validate-saints-v1.mjs';
import { catalogDependencies } from './validate-liturgical-catalog-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export const COMPLETION_RELEASE_ID = 'shared-saints-completion-2026-09-21-m0v2-s9';
export const COMPLETION_SEQUENCE = 9;
export const S8_INDEX_SHA256 = '33309c9f1a8474a04971c01734cfaa647ffe3589ecb15b936adf41de21fc7674';
export const S8_RELEASE_SHA256 = '32a819ed12cb883bc4d7ba6213c1be5f379c7bf8107d3faece7330113f2601bd';
export const S8_ARCHIVE = 'discovery-archive/shared-saints-expansion-2026-09-21-m0v2-s8';
export const COMPLETION_PROFILES = [
  { id: 'catalog_and_saints', capabilities: CATALOG_CAPABILITIES, modules: 6, skipped: [] },
  { id: 'saints_without_catalog', capabilities: SAINTS_CAPABILITIES, modules: 5, skipped: ['liturgical-catalog-v1'] },
  { id: 'without_saints_or_catalog', capabilities: CAPABILITIES, modules: 4, skipped: ['saints-v1', 'liturgical-catalog-v1'] },
  { id: 'required_base_only', capabilities: CAPABILITIES.filter(cap => cap !== 'organizations-v1'), modules: 3, skipped: ['organizations-v1', 'saints-v1', 'liturgical-catalog-v1'] }
];
const preservedIds = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1'];
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

// Reject symlinks in ancestors as well as the selected tree. Missing output
// tails are allowed only for a new tree; existing ancestors remain checked.
export async function assertNoSymlinkPath(path, { allowMissing = false } = {}) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  const parts = absolute.slice(root.length).split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    const stat = await lstat(current).catch(error => {
      if (allowMissing && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) return absolute;
    assert.equal(stat.isSymbolicLink(), false, `Symlink path rejected: ${current}`);
    if (index < parts.length - 1) assert.equal(stat.isDirectory(), true, `Non-directory ancestor: ${current}`);
  }
  return absolute;
}

export async function loadCompletionS8Base({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  await assertNoSymlinkPath(sourceDirectory);
  const source = await readTree(sourceDirectory);
  const indexPath = source.has(`${S8_ARCHIVE}/index.json`) ? `${S8_ARCHIVE}/index.json` : 'index.json';
  const signaturePath = indexPath.replace(/index\.json$/u, 'index.sig');
  const indexBytes = source.get(indexPath);
  assert.equal(sha256(indexBytes), S8_INDEX_SHA256, 'Pinned S8 source index');
  assert.equal(sha256(source.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  // Authenticate the actual captured bytes that will be copied. The platform
  // validator below reads the filesystem again and alone cannot authenticate
  // an earlier snapshot if files change between those reads.
  const key = createPublicKey(source.get('trusted-public-key.pem'));
  const signedSnapshot = (path, signature) => {
    const bytes = source.get(path), signatureText = source.get(signature)?.toString('ascii');
    assert.ok(bytes, `Missing source document: ${path}`);
    assert.match(signatureText ?? '', /^[A-Za-z0-9+/]+={0,2}\n$/u);
    assert.equal(verify('sha256', bytes, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(signatureText.trim(), 'base64')), true, `Source snapshot signature: ${path}`);
    return JSON.parse(bytes);
  };
  signedSnapshot(indexPath, signaturePath);
  const index = JSON.parse(indexBytes);
  assert.equal(index.sequence, 8); assert.equal(index.channels.production.sha256, S8_RELEASE_SHA256);
  const pointer = index.channels.production;
  assert.equal(source.get(pointer.path)?.length, pointer.bytes);
  assert.equal(sha256(source.get(pointer.path)), S8_RELEASE_SHA256);
  const set = signedSnapshot(pointer.path, pointer.signature_path);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) await validateRelease(sourceDirectory, {
    now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: CATALOG_CAPABILITIES, indexPath, indexSignaturePath: signaturePath });
  assert.deepEqual(set.modules.map(item => item.module_id), [...preservedIds, 'saints-v1', 'liturgical-catalog-v1']);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  assert.equal(index.expires_at, '2027-02-01T00:00:00Z');
  const files = new Map([['trusted-public-key.pem', source.get('trusted-public-key.pem')],
    [`${S8_ARCHIVE}/index.json`, indexBytes], [`${S8_ARCHIVE}/index.sig`, source.get(signaturePath)],
    [index.channels.production.path, source.get(index.channels.production.path)],
    [index.channels.production.signature_path, source.get(index.channels.production.signature_path)]]);
  for (const entry of set.modules) {
    assert.equal(source.get(entry.manifest_path)?.length, entry.manifest_bytes);
    assert.equal(sha256(source.get(entry.manifest_path)), entry.manifest_sha256);
    const manifest = signedSnapshot(entry.manifest_path, entry.signature_path);
    files.set(entry.manifest_path, source.get(entry.manifest_path)); files.set(entry.signature_path, source.get(entry.signature_path));
    for (const item of manifest.files) {
      const path = `${dirname(entry.manifest_path)}/${item.path}`;
      assert.equal(source.get(path)?.length, item.bytes, `Source snapshot length: ${path}`);
      assert.equal(sha256(source.get(path)), item.sha256, `Source snapshot hash: ${path}`);
      files.set(path, source.get(path));
    }
  }
  return { files, index, set };
}

// Unsigned structural capability/dependency check, not a substitute for M0
// signature verification. The real signed validator runs after coordinator GO.
export function completionCompatibility(files, set, capabilities) {
  const active = new Map(), skipped = [];
  for (const entry of set.modules) {
    const manifest = JSON.parse(files.get(entry.manifest_path));
    if (manifest.capabilities.some(cap => !capabilities.includes(cap))) {
      assert.equal(entry.required, false, `Required capability: ${entry.module_id}`);
      skipped.push(entry.module_id); continue;
    }
    active.set(entry.module_id, manifest);
  }
  for (const manifest of active.values()) for (const dep of manifest.dependencies)
    assert.equal(active.get(dep.module_id)?.version, dep.version, `Missing or mismatched dependency: ${manifest.module_id}/${dep.module_id}`);
  return { modules: active.size, skipped };
}

export async function createSaintsCompletionReleasePlan({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  // Authenticate pinned source bytes before deriving any new candidate.
  const base = await loadCompletionS8Base({ sourceDirectory, now });
  for (const record of Object.values(COMPLETION_INPUTS)) await assertNoSymlinkPath(resolve(ROOT, record.path));
  await assertNoSymlinkPath(resolve(ROOT, COMPLETION_APPROVAL_PATH));
  const completed = await buildSaintsCompletion();
  const { approval } = completed;
  assert.equal(approval.publication.release_set_id, COMPLETION_RELEASE_ID);
  assert.equal(approval.publication.sequence, COMPLETION_SEQUENCE);
  assert.equal(approval.publication.base_index_sha256, S8_INDEX_SHA256);
  assert.equal(approval.publication.base_release_sha256, S8_RELEASE_SHA256);
  assert.ok(Date.parse(approval.recorded_at) <= Date.parse(now), 'Approval is not in the future');
  assert.ok(Date.parse(base.index.expires_at) > Date.parse(now), 'Inherited expiry is still valid');
  const files = new Map(base.files), prefix = `releases/${COMPLETION_RELEASE_ID}`;
  const replacements = new Map(), documents = [];
  for (const [moduleId, payloadPath, payload, bytes, dependencies] of [
    ['saints-v1', 'data/saints-v1.json', completed.payload, completed.bytes, [{ module_id: completed.payload.calendar_binding.module_id, version: completed.payload.calendar_binding.version }]],
    ['liturgical-catalog-v1', 'data/liturgical-catalog-v1.json', completed.catalog, completed.catalogBytes, catalogDependencies(completed.catalog)]
  ]) {
    const moduleRoot = `${prefix}/modules/${moduleId}-${payload.version}-r${payload.revision}`;
    files.set(`${moduleRoot}/${payloadPath}`, bytes);
    const manifestBytes = json({ schema_version: 'svetlost33-module-manifest-2', module_id: moduleId, module_type: 'library',
      version: payload.version, revision: payload.revision, key_id: KEY_ID, capabilities: [moduleId], dependencies, files: [record(payloadPath, bytes)] });
    const manifestPath = `${moduleRoot}/manifest.json`, signaturePath = `${moduleRoot}/manifest.sig`;
    files.set(manifestPath, manifestBytes);
    replacements.set(moduleId, { module_id: moduleId, module_type: 'library', version: payload.version, required: false,
      manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: signaturePath });
    documents.push([manifestPath, signaturePath]);
  }
  // Evidence stays outside both single-payload manifests and outside the annual
  // library. It cannot be counted as annual library provenance by a projector.
  files.set(`${prefix}/evidence/owner-publication-approval.json`, completed.approvalBytes);
  for (const key of ['manuscript', 'metadata', 'sources', 'coverage', 'draft']) {
    const bytes = await readFile(resolve(ROOT, COMPLETION_INPUTS[key].path));
    assert.equal(sha256(bytes), COMPLETION_INPUTS[key].sha256, `Exact copied evidence: ${key}`);
    files.set(`${prefix}/evidence/${key === 'manuscript' ? 'TEKSTOVI.md' : `${key}.json`}`, bytes);
  }
  const set = { ...base.set, release_set_id: COMPLETION_RELEASE_ID, sequence: COMPLETION_SEQUENCE,
    modules: base.set.modules.map(entry => replacements.get(entry.module_id) ?? entry) };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set);
  files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...base.index, sequence: COMPLETION_SEQUENCE, issued_at: approval.recorded_at,
    channels: { production: { release_set_id: COMPLETION_RELEASE_ID, path: releasePath, bytes: releaseBytes.length,
      sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes);
  const calendarEntry = set.modules.find(entry => entry.module_id === 'calendar-2026-r1');
  const calendar = JSON.parse(files.get(`${dirname(calendarEntry.manifest_path)}/${completed.payload.calendar_binding.path}`));
  for (const day of completed.payload.days) assert.equal(evaluateSaintsDay(completed.payload, { contentAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: completed.payload.version, revision: completed.payload.revision }, calendarAuthenticated: true,
    calendarContext: { ...completed.payload.calendar_binding, days: calendar.days }, date: day.date }).eligible, true, `Editorial calendar preflight: ${day.date}`);
  catalogPreflight(completed.catalog, files, set, indexBytes); // In-memory editorial check, not runtime authentication.
  const compatibility = COMPLETION_PROFILES.map(profile => {
    const result = completionCompatibility(files, set, profile.capabilities);
    assert.deepEqual(result, { modules: profile.modules, skipped: profile.skipped });
    return { profile: profile.id, ...result, signature_verification: 'pending_separate_signing_GO' };
  });
  documents.push([releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']);
  const request = { schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: COMPLETION_RELEASE_ID,
    sequence: COMPLETION_SEQUENCE, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: S8_INDEX_SHA256, source_release_sha256: S8_RELEASE_SHA256,
    owner_approval_path: COMPLETION_APPROVAL_PATH, owner_approval_sha256: COMPLETION_APPROVAL_SHA256,
    saints_payload_sha256: sha256(completed.bytes), catalog_payload_sha256: sha256(completed.catalogBytes),
    publication_authorized_by_approval: true, signing_and_activation_require_separate_coordinator_GO: true,
    preserved_module_ids: preservedIds, replaced_module_ids: [...replacements.keys()],
    excluded_candidate: 'shared-charity-details-2026-09-19-m0v2-s5', minimum_clients: base.set.min_clients,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: documents.map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    compatibility_preflight: compatibility,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  files.set('signing-request.json', json(request));
  return { files, request, completed, set };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/prepare-saints-completion-release-v2.mjs --out <new-unsigned-staging-directory>');
  const plan = await createSaintsCompletionReleasePlan();
  await assertNoSymlinkPath(args[1], { allowMissing: true });
  await writeNewTree(args[1], plan.files);
  console.log(JSON.stringify(plan.request, null, 2));
}
