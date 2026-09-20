#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { SAINTS_CAPABILITIES } from './prepare-saints-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';
import { CATALOG_MODULE, catalogDependencies, evaluateCatalog, searchCatalog, validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';

export const CATALOG_RELEASE_ID = 'shared-liturgical-catalog-2026-09-20-m0v2-s7';
export const CATALOG_SEQUENCE = 7;
export const CATALOG_CAPABILITIES = [...SAINTS_CAPABILITIES, 'liturgical-catalog-v1'];
export const S6_INDEX_SHA256 = 'fa4a38a4c97f7634fe7554a03d94438b5a9486d1fcf89446bdd21abbaa2fd3fc';
export const S6_RELEASE_SHA256 = '3e9b1ef707ebb4e0cd71fa5c59f1ee1df1cb99bb0572d1729e29cadeacde8e28';
export const S6_ARCHIVE = 'discovery-archive/shared-saints-2026-09-19-m0v2-s6';
export const FROZEN_CANDIDATE_PATH = 'fixtures/liturgical-catalog-v1/catalog-candidate.json';
export const FROZEN_CANDIDATE_SHA256 = '3722e9fbbf53bbd75b1a76289b59965f6ae929d693e0f700cdf1a6d6ff48015b';
export const CATALOG_APPROVAL_PATH = 'approvals/liturgical-catalog-2026-09-20/owner-publication-approval.json';
export const CATALOG_APPROVAL_ID = 'liturgical-catalog-2026-09-20-owner-r2';
export const CATALOG_APPROVAL_SHA256 = 'abc161c755997f3db2203d3687cd1aa6245715b766b665be94ed10d7398642e4';
export const CATALOG_PAYLOAD_PATH = 'modules/liturgical-catalog-v1/2026.9.20-r2/data/liturgical-catalog-v1.json';
export const REVIEWED_ARRAYS = ['sources', 'subjects', 'observances', 'occurrences', 'article_links'];
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

// Pure deterministic transformation; caller must separately verify exact owner
// approval, provenance and transport. This never modifies the frozen fixture.
export function transformApprovedCatalog(candidate) {
  const payload = structuredClone(candidate);
  payload.revision = 2; payload.review_status = 'approved'; payload.approval_id = CATALOG_APPROVAL_ID;
  for (const key of REVIEWED_ARRAYS) for (const item of payload[key]) item.review_status = 'reviewed';
  // Rights, source dates/authors, all content/bindings, undated observations,
  // 2027 coverage and pending legacy migration links deliberately stay intact.
  return payload;
}

export async function loadApprovedCatalog() {
  const candidateBytes = await readFile(resolve(ROOT, FROZEN_CANDIDATE_PATH));
  assert.equal(sha256(candidateBytes), FROZEN_CANDIDATE_SHA256, 'Frozen pending candidate');
  const approvalBytes = await readFile(resolve(ROOT, CATALOG_APPROVAL_PATH));
  assert.equal(sha256(approvalBytes), CATALOG_APPROVAL_SHA256, 'Exact owner publication approval');
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.approval_id, CATALOG_APPROVAL_ID);
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.equal(approval.approver_role, 'project_owner');
  assert.equal(approval.statement, 'Da, objavi i taj katalog');
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.equal(approval.source.commit, 'b755d06be30905d531c0e34477b50cd978607824');
  assert.equal(approval.source.candidate_sha256, FROZEN_CANDIDATE_SHA256);
  assert.equal(sha256(await readFile(resolve(ROOT, approval.source.source_review_path))), approval.source.source_review_sha256);
  assert.equal(sha256(await readFile(resolve(ROOT, approval.source.contract_path))), approval.source.contract_sha256);
  assert.equal(sha256(await readFile(resolve(ROOT, approval.source.schema_path))), approval.source.schema_sha256);
  assert.equal(approval.publication.release_set_id, CATALOG_RELEASE_ID); assert.equal(approval.publication.sequence, 7);
  assert.equal(approval.publication.base_index_sha256, S6_INDEX_SHA256);
  assert.equal(approval.publication.base_release_sha256, S6_RELEASE_SHA256);
  assert.deepEqual(approval.scope, { subjects: 12, observances: 15, occurrences_2026: 13, article_links: 2,
    undated_observances: ['obs-stefan-decanski', 'obs-nektarios-aegina'], occurrences_2027: 0,
    complete_saint_list: false, legacy_slava_migration_authorized: false, new_religious_texts: false });
  assert.deepEqual(approval.transformation.reviewed_arrays, REVIEWED_ARRAYS);
  assert.equal(approval.transformation.preserve_rights_status, true);
  assert.equal(approval.transformation.preserve_source_checked_dates, true);
  assert.equal(approval.transformation.preserve_legacy_link_pending_status, true);
  const payload = transformApprovedCatalog(JSON.parse(candidateBytes)), bytes = json(payload);
  assert.deepEqual(validateCatalogPayload(payload), { valid: true, reason: null });
  assert.equal(approval.payload.path, CATALOG_PAYLOAD_PATH); assert.equal(approval.payload.version, payload.version);
  assert.equal(approval.payload.revision, payload.revision); assert.equal(approval.payload.bytes, bytes.length);
  assert.equal(approval.payload.sha256, sha256(bytes));
  assert.deepEqual(payload.legacy_slava_links.map(item => item.review_status), Array(10).fill('pending'));
  return { payload, bytes, approval, approvalBytes };
}

export async function loadCatalogS6Base({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const tree = await readTree(sourceDirectory);
  const indexPath = tree.has(`${S6_ARCHIVE}/index.json`) ? `${S6_ARCHIVE}/index.json` : 'index.json';
  const signaturePath = tree.has(`${S6_ARCHIVE}/index.sig`) ? `${S6_ARCHIVE}/index.sig` : 'index.sig';
  const indexBytes = tree.get(indexPath);
  assert.equal(sha256(indexBytes), S6_INDEX_SHA256, 'Pinned S6 source index');
  assert.equal(sha256(tree.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  const index = JSON.parse(indexBytes);
  assert.equal(index.sequence, 6); assert.equal(index.channels.production.sha256, S6_RELEASE_SHA256);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) await validateRelease(sourceDirectory, {
    now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: SAINTS_CAPABILITIES,
    indexPath, indexSignaturePath: signaturePath });
  const set = JSON.parse(tree.get(index.channels.production.path));
  assert.deepEqual(set.modules.map(item => [item.module_id, item.version]), [
    ['library-annual-2026-r1', '2026.1.1'], ['daily-cycles-r1', '2026.1.2'], ['calendar-2026-r1', '2026.1.1'], ['organizations-v1', '2026.9.18'], ['saints-v1', '2026.9.19']
  ]);
  const files = new Map([['trusted-public-key.pem', tree.get('trusted-public-key.pem')],
    [`${S6_ARCHIVE}/index.json`, indexBytes], [`${S6_ARCHIVE}/index.sig`, tree.get(signaturePath)],
    [index.channels.production.path, tree.get(index.channels.production.path)],
    [index.channels.production.signature_path, tree.get(index.channels.production.signature_path)]]);
  for (const entry of set.modules) {
    files.set(entry.manifest_path, tree.get(entry.manifest_path)); files.set(entry.signature_path, tree.get(entry.signature_path));
    for (const record of JSON.parse(tree.get(entry.manifest_path)).files) {
      const path = `${dirname(entry.manifest_path)}/${record.path}`; files.set(path, tree.get(path));
    }
  }
  return { files, index, set };
}

// Editorial preflight of bytes already transport-verified in the source graph.
// The caller's actual runtime generation still comes from native M0 verification.
export function catalogPreflight(payload, files, set, indexBytes) {
  const generation = { id: set.release_set_id, sequence: set.sequence, decision_sha256: sha256(indexBytes) };
  const contexts = bindings => bindings.map(binding => {
    const entry = set.modules.find(item => item.module_id === binding.module_id);
    assert.ok(entry, 'Bound module present');
    const manifest = JSON.parse(files.get(entry.manifest_path));
    const record = manifest.files.find(item => item.path === binding.path);
    assert.ok(record, 'Bound payload present');
    const bytes = files.get(`${dirname(entry.manifest_path)}/${binding.path}`);
    const actual = { module_id: entry.module_id, version: entry.version, revision: manifest.revision, path: record.path, sha256: sha256(bytes) };
    for (const key of ['module_id', 'version', 'revision', 'path', 'sha256']) assert.equal(actual[key], binding[key], `Exact binding ${key}`);
    return { ...actual, generation: { ...generation }, authenticated: true, payload: JSON.parse(bytes) };
  });
  const calendarContexts = contexts(payload.calendar_bindings).map(host => ({ ...host, year: host.payload.civil_year, days: host.payload.days }));
  const articleContexts = contexts(payload.article_bindings).map(host => ({ ...host, review_status: host.payload.review_status, calendar_binding: host.payload.calendar_binding, articles: host.payload.articles.map(article => ({ id: article.id, type: article.type })) }));
  const host = { generation, contentAuthenticated: true, moduleContext: { ...CATALOG_MODULE, version: payload.version, revision: payload.revision, generation: { ...generation }, dependencies: catalogDependencies(payload) }, calendarContexts, articleContexts };
  assert.deepEqual(evaluateCatalog(payload, host), { eligible: true, reason: null });
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    for (const observance of payload.observances) {
      const result = searchCatalog(payload, host, { query: observance.name[locale], locale, year: 2026, calendar_profile_id: payload.calendar_profiles[0].id });
      assert.ok(result.results.some(item => item.observance_id === observance.id), `Searchable ${observance.id}`);
    }
    const result = searchCatalog(payload, host, { query: 'Мала Госпојина', locale, year: 2027, calendar_profile_id: payload.calendar_profiles[0].id });
    assert.deepEqual(result.results[0].dates, []); assert.deepEqual(result.results[0].article_ids, ['nativity-theotokos']);
  }
  return host;
}

export async function createCatalogReleasePlan({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  const approved = await loadApprovedCatalog(), base = await loadCatalogS6Base({ sourceDirectory, now });
  assert.deepEqual(await readFile(resolve(ROOT, CATALOG_PAYLOAD_PATH)), approved.bytes, 'Exact canonical approved payload');
  const files = new Map(base.files), prefix = `releases/${CATALOG_RELEASE_ID}`;
  const moduleRoot = `${prefix}/modules/liturgical-catalog-v1-${approved.payload.version}-r${approved.payload.revision}`;
  files.set(`${moduleRoot}/${CATALOG_MODULE.payload_path}`, approved.bytes);
  files.set(`${prefix}/evidence/owner-publication-approval.json`, approved.approvalBytes);
  files.set(`${prefix}/evidence/source-review.md`, await readFile(resolve(ROOT, approved.approval.source.source_review_path)));
  const manifestBytes = json({ schema_version: 'svetlost33-module-manifest-2', module_id: CATALOG_MODULE.module_id, module_type: CATALOG_MODULE.module_type,
    version: approved.payload.version, revision: approved.payload.revision, key_id: KEY_ID, capabilities: CATALOG_MODULE.capabilities,
    dependencies: catalogDependencies(approved.payload), files: [record(CATALOG_MODULE.payload_path, approved.bytes)] });
  const manifestPath = `${moduleRoot}/manifest.json`; files.set(manifestPath, manifestBytes);
  const entry = { module_id: CATALOG_MODULE.module_id, module_type: CATALOG_MODULE.module_type, version: approved.payload.version, required: false,
    manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: `${moduleRoot}/manifest.sig` };
  const set = { ...base.set, release_set_id: CATALOG_RELEASE_ID, sequence: CATALOG_SEQUENCE, modules: [...base.set.modules, entry] };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set); files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...base.index, sequence: CATALOG_SEQUENCE, issued_at: approved.approval.recorded_at,
    channels: { production: { release_set_id: CATALOG_RELEASE_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes);
  catalogPreflight(approved.payload, files, set, indexBytes);
  const request = { schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: CATALOG_RELEASE_ID,
    sequence: CATALOG_SEQUENCE, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256, source_index_sha256: S6_INDEX_SHA256,
    source_release_sha256: S6_RELEASE_SHA256, owner_approval_sha256: sha256(approved.approvalBytes), payload_sha256: sha256(approved.bytes),
    publication_authorized_by_approval: true, preserved_module_ids: base.set.modules.map(item => item.module_id),
    excluded_candidate: 'shared-charity-details-2026-09-19-m0v2-s5', minimum_clients: base.set.min_clients,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: [[manifestPath, entry.signature_path], [releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']]
      .map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  files.set('signing-request.json', json(request));
  return { files, request };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--export-approved-payload') {
    const approved = await loadApprovedCatalog();
    await writeNewTree(resolve(ROOT, 'modules/liturgical-catalog-v1/2026.9.20-r2'), new Map([['data/liturgical-catalog-v1.json', approved.bytes]]));
    console.log(JSON.stringify({ path: CATALOG_PAYLOAD_PATH, bytes: approved.bytes.length, sha256: sha256(approved.bytes) }));
  } else {
    if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: --out <new-staging-directory> or --export-approved-payload');
    const plan = await createCatalogReleasePlan(); await writeNewTree(args[1], plan.files); console.log(JSON.stringify(plan.request, null, 2));
  }
}
