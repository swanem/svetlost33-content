#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { buildSaintsPilot, CALENDAR_BINDING } from './export-saints-pilot-v1.mjs';
import { evaluateSaintsDay, SAINTS_MODULE } from './validate-saints-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export const SAINTS_RELEASE_ID = 'shared-saints-2026-09-19-m0v2-s6';
export const SAINTS_SEQUENCE = 6;
export const SAINTS_CAPABILITIES = [...CAPABILITIES, 'saints-v1'];
export const SAINTS_PAYLOAD_SHA256 = 'ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000';
export const S4_INDEX_SHA256 = 'c7e327ed6e7108a6c33a4df525934d85a945fd2baeccce0eccee161311d685e6';
export const S4_RELEASE_SHA256 = '6524151c4a249c85ad58bcb2ab475104a898ade76acefb417edb8561361e09c4';
export const S4_ARCHIVE = 'discovery-archive/shared-widget-excerpts-2026-09-18-m0v2-s4';
export const CONTINUATION_PATH = 'approvals/saints-pilot-2026-09-19/publication-continuation-approval.json';
export const CONTINUATION_SHA256 = 'a2e0a4e5944374624be7d0f42d84ace44eafd9fe5ebc57667c2d45edbd71f1e5';
const OWNER_APPROVAL_PATH = 'approvals/saints-pilot-2026-09-19/owner-approval.json';
const OWNER_APPROVAL_SHA256 = '78e8b1b490f1f312eefa7217d02bbdeb79141652c4f324cea379703dab8141c2';
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

// Select only the exact active S4 graph. Never copy a pending S5 candidate or
// infer authorization from a later discovery pointer. Archived S4 supports
// byte-identical reconstruction after this publication advances discovery.
export async function loadSaintsS4Base({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const source = await readTree(sourceDirectory);
  const indexPath = source.has(`${S4_ARCHIVE}/index.json`) ? `${S4_ARCHIVE}/index.json` : 'index.json';
  const signaturePath = source.has(`${S4_ARCHIVE}/index.sig`) ? `${S4_ARCHIVE}/index.sig` : 'index.sig';
  const indexBytes = source.get(indexPath);
  assert.equal(sha256(indexBytes), S4_INDEX_SHA256, 'Pinned S4 source index');
  assert.equal(sha256(source.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production public key');
  const index = JSON.parse(indexBytes);
  assert.equal(index.sequence, 4);
  assert.equal(index.channels.production.sha256, S4_RELEASE_SHA256);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      clientCapabilities: CAPABILITIES, indexPath, indexSignaturePath: signaturePath });
  }
  const set = JSON.parse(source.get(index.channels.production.path));
  assert.deepEqual(set.modules.map(module => [module.module_id, module.version]), [
    ['library-annual-2026-r1', '2026.1.1'], ['daily-cycles-r1', '2026.1.2'],
    ['calendar-2026-r1', '2026.1.1'], ['organizations-v1', '2026.9.18']
  ]);
  const files = new Map([
    ['trusted-public-key.pem', source.get('trusted-public-key.pem')],
    [`${S4_ARCHIVE}/index.json`, indexBytes], [`${S4_ARCHIVE}/index.sig`, source.get(signaturePath)],
    [index.channels.production.path, source.get(index.channels.production.path)],
    [index.channels.production.signature_path, source.get(index.channels.production.signature_path)]
  ]);
  for (const entry of set.modules) {
    files.set(entry.manifest_path, source.get(entry.manifest_path));
    files.set(entry.signature_path, source.get(entry.signature_path));
    const manifest = JSON.parse(source.get(entry.manifest_path));
    for (const file of manifest.files) {
      const path = `${dirname(entry.manifest_path)}/${file.path}`;
      files.set(path, source.get(path));
    }
  }
  return { index, set, files };
}

export async function createSaintsReleasePlan({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const base = await loadSaintsS4Base({ sourceDirectory, now });
  const approvalBytes = await readFile(resolve(ROOT, CONTINUATION_PATH));
  const ownerBytes = await readFile(resolve(ROOT, OWNER_APPROVAL_PATH));
  assert.equal(sha256(approvalBytes), CONTINUATION_SHA256, 'Exact publication continuation approval');
  assert.equal(sha256(ownerBytes), OWNER_APPROVAL_SHA256, 'Unchanged original manuscript approval');
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.equal(approval.publication.release_set_id, SAINTS_RELEASE_ID);
  assert.equal(approval.publication.sequence, SAINTS_SEQUENCE);
  const pilot = await buildSaintsPilot();
  assert.equal(sha256(pilot.bytes), SAINTS_PAYLOAD_SHA256);
  assert.equal(pilot.bytes.length, 30924);
  const calendarEntry = base.set.modules.find(module => module.module_id === CALENDAR_BINDING.module_id);
  const calendarManifest = JSON.parse(base.files.get(calendarEntry.manifest_path));
  assert.equal(calendarManifest.revision, CALENDAR_BINDING.revision);
  const calendarRecord = calendarManifest.files.find(file => file.path === CALENDAR_BINDING.path);
  assert.equal(calendarRecord.sha256, CALENDAR_BINDING.sha256);
  const calendar = JSON.parse(base.files.get(`${dirname(calendarEntry.manifest_path)}/${calendarRecord.path}`));
  for (const day of pilot.payload.days) {
    assert.equal(evaluateSaintsDay(pilot.payload, { contentAuthenticated: true,
      moduleContext: { ...SAINTS_MODULE, version: pilot.payload.version, revision: pilot.payload.revision },
      calendarAuthenticated: true, calendarContext: { ...CALENDAR_BINDING, days: calendar.days }, date: day.date }).eligible, true);
  }
  // Above is editorial preflight of exact planned bytes, not runtime authentication.
  const files = new Map(base.files);
  const prefix = `releases/${SAINTS_RELEASE_ID}`;
  const moduleRoot = `${prefix}/modules/saints-v1-${pilot.payload.version}-r${pilot.payload.revision}`;
  files.set(`${moduleRoot}/data/saints-v1.json`, pilot.bytes);
  // Native v1 expects exactly one manifest.files entry. Editorial evidence is
  // retained separately at release level and never mistaken for runtime data.
  files.set(`${prefix}/evidence/publication-continuation-approval.json`, approvalBytes);
  files.set(`${prefix}/evidence/original-owner-approval.json`, ownerBytes);
  const manifestBytes = json({ schema_version: 'svetlost33-module-manifest-2', module_id: 'saints-v1', module_type: 'library',
    version: pilot.payload.version, revision: pilot.payload.revision, key_id: KEY_ID, capabilities: ['saints-v1'],
    dependencies: [{ module_id: CALENDAR_BINDING.module_id, version: CALENDAR_BINDING.version }],
    files: [record('data/saints-v1.json', pilot.bytes)] });
  const manifestPath = `${moduleRoot}/manifest.json`;
  files.set(manifestPath, manifestBytes);
  const entry = { module_id: 'saints-v1', module_type: 'library', version: pilot.payload.version, required: false,
    manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: `${moduleRoot}/manifest.sig` };
  const releasePath = `${prefix}/release-set.json`;
  const releaseBytes = json({ ...base.set, release_set_id: SAINTS_RELEASE_ID, sequence: SAINTS_SEQUENCE, modules: [...base.set.modules, entry] });
  files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...base.index, sequence: SAINTS_SEQUENCE, issued_at: approval.recorded_at,
    channels: { production: { release_set_id: SAINTS_RELEASE_ID, path: releasePath, bytes: releaseBytes.length,
      sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes);
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: SAINTS_RELEASE_ID,
    sequence: SAINTS_SEQUENCE, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: S4_INDEX_SHA256, source_release_sha256: S4_RELEASE_SHA256,
    publication_approval_sha256: CONTINUATION_SHA256, original_approval_sha256: OWNER_APPROVAL_SHA256,
    payload_sha256: SAINTS_PAYLOAD_SHA256, publication_authorized_by_approval: true,
    preserved_module_ids: base.set.modules.map(module => module.module_id),
    excluded_candidate: 'shared-charity-details-2026-09-19-m0v2-s5', minimum_clients: base.set.min_clients,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: [[manifestPath, entry.signature_path], [releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']]
      .map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
  files.set('signing-request.json', json(request));
  return { files, request };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/prepare-saints-release-v2.mjs --out <new-candidate-directory>');
  const plan = await createSaintsReleasePlan();
  await writeNewTree(args[1], plan.files);
  console.log(JSON.stringify({ release_set_id: SAINTS_RELEASE_ID, sequence: SAINTS_SEQUENCE, state: 'UNSIGNED_CANDIDATE', preserved_modules: plan.request.preserved_module_ids, payload_sha256: SAINTS_PAYLOAD_SHA256 }, null, 2));
}
