#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { SAINTS_CAPABILITIES } from './prepare-saints-release-v2.mjs';
import { CATALOG_CAPABILITIES, catalogPreflight } from './prepare-liturgical-catalog-release-v2.mjs';
import { buildSaintsExpansion, EXPANSION_APPROVAL_PATH, EXPANSION_APPROVAL_SHA256, EXPANSION_INPUTS } from './export-saints-expansion-v1.mjs';
import { SAINTS_MODULE, evaluateSaintsDay } from './validate-saints-v1.mjs';
import { catalogDependencies } from './validate-liturgical-catalog-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export const EXPANSION_RELEASE_ID = 'shared-saints-expansion-2026-09-21-m0v2-s8';
export const EXPANSION_SEQUENCE = 8;
export const S7_INDEX_SHA256 = '955b4a8ccf3345ce8821dd2187583ae3e8604f66fc6480ecf9a410556248d144';
export const S7_RELEASE_SHA256 = '07adbbb4fe394f79d526bc1d5635d296d6e669a62c8545c81495f68164127d80';
export const S7_ARCHIVE = 'discovery-archive/shared-liturgical-catalog-2026-09-20-m0v2-s7';
export const EXPANSION_PROFILES = [
  { id: 'catalog_and_saints', capabilities: CATALOG_CAPABILITIES, modules: 6, skipped: [] },
  { id: 'saints_without_catalog', capabilities: SAINTS_CAPABILITIES, modules: 5, skipped: ['liturgical-catalog-v1'] },
  { id: 'without_saints_or_catalog', capabilities: CAPABILITIES, modules: 4, skipped: ['saints-v1', 'liturgical-catalog-v1'] },
  { id: 'required_base_only', capabilities: CAPABILITIES.filter(cap => cap !== 'organizations-v1'), modules: 3, skipped: ['organizations-v1', 'saints-v1', 'liturgical-catalog-v1'] }
];
const preservedIds = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1'];
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

export async function loadExpansionS7Base({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const source = await readTree(sourceDirectory);
  const indexPath = source.has(`${S7_ARCHIVE}/index.json`) ? `${S7_ARCHIVE}/index.json` : 'index.json';
  const signaturePath = indexPath.replace(/index\.json$/u, 'index.sig');
  const indexBytes = source.get(indexPath);
  assert.equal(sha256(indexBytes), S7_INDEX_SHA256, 'Pinned S7 source index');
  assert.equal(sha256(source.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  const index = JSON.parse(indexBytes);
  assert.equal(index.sequence, 7); assert.equal(index.channels.production.sha256, S7_RELEASE_SHA256);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) await validateRelease(sourceDirectory, {
    now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: CATALOG_CAPABILITIES, indexPath, indexSignaturePath: signaturePath });
  const set = JSON.parse(source.get(index.channels.production.path));
  assert.deepEqual(set.modules.map(item => item.module_id), [...preservedIds, 'saints-v1', 'liturgical-catalog-v1']);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  assert.equal(index.expires_at, '2027-02-01T00:00:00Z');
  const files = new Map([['trusted-public-key.pem', source.get('trusted-public-key.pem')],
    [`${S7_ARCHIVE}/index.json`, indexBytes], [`${S7_ARCHIVE}/index.sig`, source.get(signaturePath)],
    [index.channels.production.path, source.get(index.channels.production.path)],
    [index.channels.production.signature_path, source.get(index.channels.production.signature_path)]]);
  for (const entry of set.modules) {
    files.set(entry.manifest_path, source.get(entry.manifest_path)); files.set(entry.signature_path, source.get(entry.signature_path));
    for (const item of JSON.parse(source.get(entry.manifest_path)).files) {
      const path = `${dirname(entry.manifest_path)}/${item.path}`; files.set(path, source.get(path));
    }
  }
  return { files, index, set };
}

// Unsigned structural capability/dependency check, not a substitute for M0
// signature verification. The real signed validator runs after coordinator GO.
export function expansionCompatibility(files, set, capabilities) {
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

export async function createSaintsExpansionReleasePlan({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const expanded = await buildSaintsExpansion(), base = await loadExpansionS7Base({ sourceDirectory, now });
  const { approval } = expanded;
  assert.equal(approval.publication.release_set_id, EXPANSION_RELEASE_ID);
  assert.equal(approval.publication.sequence, EXPANSION_SEQUENCE);
  assert.equal(approval.publication.base_index_sha256, S7_INDEX_SHA256);
  assert.equal(approval.publication.base_release_sha256, S7_RELEASE_SHA256);
  assert.ok(Date.parse(approval.recorded_at) <= Date.parse(now), 'Approval is not in the future');
  assert.ok(Date.parse(base.index.expires_at) > Date.parse(now), 'Inherited expiry is still valid');
  const files = new Map(base.files), prefix = `releases/${EXPANSION_RELEASE_ID}`;
  const replacements = new Map(), documents = [];
  for (const [moduleId, payloadPath, payload, bytes, dependencies] of [
    ['saints-v1', 'data/saints-v1.json', expanded.payload, expanded.bytes, [{ module_id: expanded.payload.calendar_binding.module_id, version: expanded.payload.calendar_binding.version }]],
    ['liturgical-catalog-v1', 'data/liturgical-catalog-v1.json', expanded.catalog, expanded.catalogBytes, catalogDependencies(expanded.catalog)]
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
  files.set(`${prefix}/evidence/owner-publication-approval.json`, expanded.approvalBytes);
  for (const key of ['manuscript', 'metadata', 'sources', 'coverage']) {
    const bytes = await readFile(resolve(ROOT, EXPANSION_INPUTS[key].path));
    assert.equal(sha256(bytes), EXPANSION_INPUTS[key].sha256, `Exact copied evidence: ${key}`);
    files.set(`${prefix}/evidence/${key === 'manuscript' ? 'TEKSTOVI.md' : `${key}.json`}`, bytes);
  }
  const set = { ...base.set, release_set_id: EXPANSION_RELEASE_ID, sequence: EXPANSION_SEQUENCE,
    modules: base.set.modules.map(entry => replacements.get(entry.module_id) ?? entry) };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set);
  files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...base.index, sequence: EXPANSION_SEQUENCE, issued_at: approval.recorded_at,
    channels: { production: { release_set_id: EXPANSION_RELEASE_ID, path: releasePath, bytes: releaseBytes.length,
      sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes);
  const calendarEntry = set.modules.find(entry => entry.module_id === 'calendar-2026-r1');
  const calendar = JSON.parse(files.get(`${dirname(calendarEntry.manifest_path)}/${expanded.payload.calendar_binding.path}`));
  for (const day of expanded.payload.days) assert.equal(evaluateSaintsDay(expanded.payload, { contentAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: expanded.payload.version, revision: expanded.payload.revision }, calendarAuthenticated: true,
    calendarContext: { ...expanded.payload.calendar_binding, days: calendar.days }, date: day.date }).eligible, true, `Editorial calendar preflight: ${day.date}`);
  catalogPreflight(expanded.catalog, files, set, indexBytes); // In-memory editorial check, not runtime authentication.
  const compatibility = EXPANSION_PROFILES.map(profile => {
    const result = expansionCompatibility(files, set, profile.capabilities);
    assert.deepEqual(result, { modules: profile.modules, skipped: profile.skipped });
    return { profile: profile.id, ...result, signature_verification: 'pending_separate_signing_GO' };
  });
  documents.push([releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']);
  const request = { schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: EXPANSION_RELEASE_ID,
    sequence: EXPANSION_SEQUENCE, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: S7_INDEX_SHA256, source_release_sha256: S7_RELEASE_SHA256,
    owner_approval_path: EXPANSION_APPROVAL_PATH, owner_approval_sha256: EXPANSION_APPROVAL_SHA256,
    saints_payload_sha256: sha256(expanded.bytes), catalog_payload_sha256: sha256(expanded.catalogBytes),
    publication_authorized_by_approval: true, signing_and_activation_require_separate_coordinator_GO: true,
    preserved_module_ids: preservedIds, replaced_module_ids: [...replacements.keys()],
    excluded_candidate: 'shared-charity-details-2026-09-19-m0v2-s5', minimum_clients: base.set.min_clients,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: documents.map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    compatibility_preflight: compatibility,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  files.set('signing-request.json', json(request));
  return { files, request, expanded, set };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/prepare-saints-expansion-release-v2.mjs --out <new-unsigned-staging-directory>');
  const plan = await createSaintsExpansionReleasePlan();
  await writeNewTree(args[1], plan.files);
  console.log(JSON.stringify(plan.request, null, 2));
}
