#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';
import { validateOrganizationsRegistry } from './validate-organizations-v1.mjs';

export const DETAILS_RELEASE_ID = 'shared-charity-details-2026-09-19-m0v2-s5';
export const S4_RELEASE_ID = 'shared-widget-excerpts-2026-09-18-m0v2-s4';
export const S4_INDEX_PATH = `discovery-archive/${S4_RELEASE_ID}/index.json`;
export const S4_SIGNATURE_PATH = `discovery-archive/${S4_RELEASE_ID}/index.sig`;
export const S4_INVENTORY_PATH = 'scripts/charity-details-s4-source-files.json';
export const S4_INVENTORY_SHA256 = '2f2dca16eff485ac38f72314e6fe3e39228f8ecc34733c1bff65d8555f3d85c9';
export const DETAILS_PAYLOAD_PATH = 'modules/organizations-v1/2026.9.19-r2/data/organizations-v1.json';
export const DETAILS_PAYLOAD_SHA256 = 'ad1fa507b83da7186a4bf66fdb3eb2695cbb0703e45e21d42ddfadbdcd4709a0';
export const DETAILS_APPROVAL_PATH = 'approvals/charity-details-2026-09-19/continuation-approval.json';
export const DETAILS_APPROVAL_SHA256 = '0da03231557c9afe9ec9f731034b52b9af6728235d0ea28dbb283c4f9478666b';
export const DETAILS_REVIEW_PATH = 'approvals/charity-details-2026-09-19/source-review.json';
export const DETAILS_REVIEW_SHA256 = '0ad94b28ee47d6b4de8db9a5e293928854545c1b83d2aba88de6b80259aa700c';
const same = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label} differs from the approved immutable source`); };
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

export async function loadS4Source(sourceDirectory = BASE) {
  const tree = await readTree(sourceDirectory);
  const inventoryBytes = await readFile(resolve(ROOT, S4_INVENTORY_PATH));
  same(sha256(inventoryBytes), S4_INVENTORY_SHA256, 'S4 source inventory');
  const inventory = JSON.parse(inventoryBytes);
  same(inventory.release_set_id, S4_RELEASE_ID, 'S4 inventory identity');
  same(inventory.sequence, 4, 'S4 inventory sequence');
  const hasArchive = tree.has(S4_INDEX_PATH) || tree.has(S4_SIGNATURE_PATH);
  const files = new Map();
  // Only the pinned S4 files enter this plan. Later release files cannot change
  // it; archived discovery must match the exact original S4 bytes and signature.
  for (const item of inventory.files) {
    const actual = hasArchive && item.path === 'index.json' ? S4_INDEX_PATH : hasArchive && item.path === 'index.sig' ? S4_SIGNATURE_PATH : item.path;
    const bytes = tree.get(actual);
    if (!bytes) throw new Error(`Missing frozen S4 input: ${actual}`);
    same(bytes.length, item.bytes, `S4 input length (${actual})`);
    same(sha256(bytes), item.sha256, `S4 input hash (${actual})`);
    files.set(item.path, bytes);
  }
  same(sha256(files.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production public key');
  return { files, hasArchive };
}

export async function createCharityDetailsPlan({ now = new Date().toISOString(), sourceDirectory = BASE } = {}) {
  const source = await loadS4Source(sourceDirectory);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    await validateRelease(sourceDirectory, { now, platform, clientVersion, minimumSequence: 4, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES,
      ...(source.hasArchive ? { indexPath: S4_INDEX_PATH, indexSignaturePath: S4_SIGNATURE_PATH } : {}) });
  }
  const oldIndex = JSON.parse(source.files.get('index.json'));
  same(oldIndex.sequence, 4, 'Base sequence');
  const oldSet = JSON.parse(source.files.get(oldIndex.channels.production.path));
  same(oldSet.release_set_id, S4_RELEASE_ID, 'Base release identity');
  same(JSON.stringify(oldSet.min_clients), JSON.stringify({ android: 35, ios: '0.1.0' }), 'Unchanged minimum clients');
  const oldOrganizations = oldSet.modules.find(module => module.module_id === 'organizations-v1');
  const original = JSON.parse(source.files.get(`${dirname(oldOrganizations.manifest_path)}/data/organizations-v1.json`));
  const payloadBytes = await readFile(resolve(ROOT, DETAILS_PAYLOAD_PATH));
  same(sha256(payloadBytes), DETAILS_PAYLOAD_SHA256, 'Approved organizations payload');
  same(payloadBytes.length, 11073, 'Approved organizations length');
  const payload = JSON.parse(payloadBytes);
  const approvalBytes = await readFile(resolve(ROOT, DETAILS_APPROVAL_PATH));
  same(sha256(approvalBytes), DETAILS_APPROVAL_SHA256, 'Continuation approval');
  const approval = JSON.parse(approvalBytes);
  const reviewBytes = await readFile(resolve(ROOT, DETAILS_REVIEW_PATH));
  same(sha256(reviewBytes), DETAILS_REVIEW_SHA256, 'Source review');
  const review = JSON.parse(reviewBytes);
  same(approval.approval_id, 'shared-charity-details-2026-09-19-r2', 'Approval identity');
  same(approval.decision, 'approved_for_local_signed_candidate_and_native_validation', 'Approval decision');
  same(JSON.stringify(approval.consumer_platforms), JSON.stringify(['android', 'ios']), 'Approval platforms');
  for (const binding of [approval.payload_binding, review.payload_binding]) {
    for (const [key, value] of Object.entries({ path: DETAILS_PAYLOAD_PATH, bytes: payloadBytes.length, sha256: DETAILS_PAYLOAD_SHA256, version: payload.version, revision: payload.revision })) same(binding[key], value, `Payload binding ${key}`);
  }
  same(approval.source_review_binding.path, DETAILS_REVIEW_PATH, 'Source review binding path');
  same(approval.source_review_binding.sha256, DETAILS_REVIEW_SHA256, 'Source review binding hash');
  same(payload.expires_at, original.expires_at, 'Original review expiry');
  same(payload.expires_at, approval.authorized_content.valid_until_exclusive, 'Approved expiry');
  same(JSON.stringify(payload.organizations.map(org => org.id)), JSON.stringify(approval.authorized_content.organization_ids), 'Approved organization IDs');
  // Reconstruct r1 by removing only the nine reviewed links and their three
  // sources. This also protects every original action, expiry and identity.
  const restored = structuredClone(payload);
  for (const key of ['version', 'revision', 'issued_at']) restored[key] = original[key];
  for (let index = 0; index < restored.organizations.length; index += 1) {
    const org = restored.organizations[index], before = original.organizations[index], evidence = review.organizations[index];
    same(org.id, evidence.organization_id, 'Source review organization');
    if (org.logo !== null || org.payment_rails.length !== 0 || org.links.length !== before.links.length + 3 || org.sources.length !== before.sources.length + 1) throw new Error('Details exceed the approved links-only scope');
    const additions = org.links.splice(before.links.length);
    same(JSON.stringify(additions.map(({ id, kind, url }) => ({ id, kind, url }))), JSON.stringify(evidence.added_links.map(({ id, kind, url }) => ({ id, kind, url }))), 'Exact added links');
    const [addedSource] = org.sources.splice(before.sources.length);
    same(addedSource.id, evidence.source_id, 'Added source identity');
    same(addedSource.url, evidence.publishing_page, 'Added source URL');
    if (additions.some(link => JSON.stringify(link.source_ids) !== JSON.stringify([addedSource.id]))) throw new Error('Added link source binding differs');
  }
  same(JSON.stringify(restored), JSON.stringify(original), 'Original organizations records');
  const context = { module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: payload.version, revision: payload.revision };
  // Editorial eligibility only: this does not authenticate an unsigned payload.
  const eligibility = validateOrganizationsRegistry(payload, { now, contentAuthenticated: true, paymentSessionFresh: true, clientCapabilities: ['organizations-v1'], moduleContext: context });
  if (!eligibility.registry_eligible || eligibility.organizations.some(org => org.links.some(link => !link.enabled))) throw new Error('Reviewed details are not currently eligible for preparation');
  if (Date.parse(approval.recorded_at) > Date.parse(now)) throw new Error('Continuation approval is not yet valid');

  const files = new Map(source.files);
  files.set(S4_INDEX_PATH, source.files.get('index.json'));
  files.set(S4_SIGNATURE_PATH, source.files.get('index.sig'));
  files.delete('index.sig');
  const prefix = `releases/${DETAILS_RELEASE_ID}`;
  const moduleDirectory = `${prefix}/modules/organizations-v1-${payload.version}-r${payload.revision}`;
  const moduleFiles = [['data/organizations-v1.json', payloadBytes], ['evidence/owner-approval.json', approvalBytes], ['evidence/source-review.json', reviewBytes]];
  for (const [path, bytes] of moduleFiles) files.set(`${moduleDirectory}/${path}`, bytes);
  const manifestBytes = json({ schema_version: 'svetlost33-module-manifest-2', module_id: 'organizations-v1', module_type: 'organizations', version: payload.version, revision: payload.revision, key_id: KEY_ID,
    capabilities: ['organizations-v1'], dependencies: [], files: moduleFiles.map(([path, bytes]) => record(path, bytes)) });
  const manifestPath = `${moduleDirectory}/manifest.json`;
  files.set(manifestPath, manifestBytes);
  const organizationsEntry = { ...oldOrganizations, version: payload.version, manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: `${moduleDirectory}/manifest.sig` };
  const releasePath = `${prefix}/release-set.json`, releaseSignaturePath = `${prefix}/release-set.sig`;
  const releaseBytes = json({ ...oldSet, release_set_id: DETAILS_RELEASE_ID, sequence: 5,
    modules: oldSet.modules.map(module => module.module_id === 'organizations-v1' ? organizationsEntry : module) });
  files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...oldIndex, sequence: 5, issued_at: approval.recorded_at,
    channels: { production: { release_set_id: DETAILS_RELEASE_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: releaseSignaturePath } } });
  files.set('index.json', indexBytes);
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: DETAILS_RELEASE_ID, sequence: 5,
    key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256, source_inventory_sha256: S4_INVENTORY_SHA256,
    source_index_sha256: sha256(source.files.get('index.json')), source_release_sha256: oldIndex.channels.production.sha256,
    approval_sha256: DETAILS_APPROVAL_SHA256, source_review_sha256: DETAILS_REVIEW_SHA256, payload_sha256: DETAILS_PAYLOAD_SHA256,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline', minimum_clients: oldSet.min_clients,
    documents_to_sign: [[manifestPath, organizationsEntry.signature_path], [releasePath, releaseSignaturePath], ['index.json', 'index.sig']].map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    unchanged_active_module_ids: oldSet.modules.filter(module => module.module_id !== 'organizations-v1').map(module => module.module_id),
    compatibility_note: 'Android minimum remains 35; iOS minimum remains 0.1.0. Organizations stays optional and requires only organizations-v1 because every logo is null. All S4 core module and approved widget-excerpt bytes remain unchanged.',
    publication_authorized_by_approval: false,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
  files.set('signing-request.json', json(request));
  return { files, request };
}

export async function prepareCharityDetailsRelease(out, options = {}) {
  const plan = await createCharityDetailsPlan(options);
  await writeNewTree(out, plan.files);
  return plan.request;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--out', '--source'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: node scripts/prepare-charity-details-v2.mjs --out <new-directory> [--source <signed-s4-or-later-root>]');
    values.set(args[i], args[i + 1]);
  }
  if (!values.has('--out')) throw new Error('A new output directory is required');
  const result = await prepareCharityDetailsRelease(values.get('--out'), { sourceDirectory: values.get('--source') });
  console.log(`Prepared unsigned ${result.release_set_id}; nine profile links, three new detached signatures required. No private key accessed or publication performed.`);
}
