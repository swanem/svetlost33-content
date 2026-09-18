#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRelease } from './validate-m0-v2.mjs';
import { validateOrganizationsRegistry } from './validate-organizations-v1.mjs';

export const ROOT = resolve(import.meta.dirname, '..');
export const BASE = resolve(ROOT, 'releases/v2/production');
export const BASE_INDEX_PATH = 'discovery-archive/shared-annual-2026-r1-m0v2-s2/index.json';
export const BASE_SIGNATURE_PATH = 'discovery-archive/shared-annual-2026-r1-m0v2-s2/index.sig';
const PRESERVED_INPUTS_SHA256 = '1a11dad6371235b5fd23ca7de92e8e926c87df0f704c36db51c35c3ed9dd975d';
export const PAYLOAD = 'modules/organizations-v1/2026.9.18-r1/data/organizations-v1.json';
export const APPROVAL = 'approvals/charity-cards-2026-09-18/payload-approval.json';
export const SOURCE_REVIEW = 'approvals/charity-cards-2026-09-18/source-review.json';
export const PAYLOAD_SHA256 = '4654b5c05b7c4e0ada963d022491c8683ac9d329c5db937a522925f6d10d89d7';
export const APPROVAL_SHA256 = '7f2aca9b0f349ee417c2dc89cc27949176c4d22f93f6788a59855a3f95b1c94d';
export const SOURCE_REVIEW_SHA256 = '5a7cec6cecdaa5fb8d2a7ee244f402167644d0b8a2e0a52e6ce5cb0a4a273c24';
export const BASE_INDEX_SHA256 = '7b94f68698796b9c2802cf7d411b391a99bd2cc246aeb16a34b18526182a592c';
export const PUBLIC_KEY_SHA256 = '9671cc745a71f3b35ac2281bfd4e8da9335db9c6a44beda0ae5cf380b292c1f6';
export const KEY_ID = 'svetlost33-content-2026-key-1';
export const RELEASE_ID = 'shared-charity-2026-09-18-m0v2-s3';
export const CAPABILITIES = ['library-v1', 'sr-Cyrl', 'sr-Latn', 'cycle-v1', 'calendar-v1', 'explicit-unknown', 'background-catalog-v1', 'organizations-v1'];
export const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const requireEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label} differs from the reviewed release`);
};
const fileRecord = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

// Reject symlinks at the selected tree root and in its descendants. All reads
// are scoped to that explicitly selected public candidate/base tree.
export async function readTree(directory, prefix = '') {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Expected a regular content directory');
  const files = new Map();
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symlinks are forbidden in content trees');
    if (entry.isDirectory()) {
      for (const [childPath, bytes] of await readTree(resolve(directory, entry.name), path)) files.set(childPath, bytes);
    } else if (entry.isFile()) files.set(path, await readFile(resolve(directory, entry.name)));
    else throw new Error('Only regular files are allowed in content trees');
  }
  return files;
}

export async function loadArchivedBase(baseDirectory = BASE) {
  const tree = await readTree(baseDirectory);
  const inventoryBytes = await readFile(resolve(ROOT, 'approvals/charity-cards-2026-09-18/preserved-inputs.json'));
  requireEqual(sha256(inventoryBytes), PRESERVED_INPUTS_SHA256, 'Historical source inventory');
  const inventory = JSON.parse(inventoryBytes);
  const prefix = 'releases/v2/production/';
  const records = [...inventory.immutable_files, ...inventory.previous_discovery_files].filter(record => record.path.startsWith(prefix));
  const files = new Map();
  for (const record of records) {
    const logical = record.path.slice(prefix.length);
    const actual = logical === 'index.json' ? BASE_INDEX_PATH : logical === 'index.sig' ? BASE_SIGNATURE_PATH : logical;
    const bytes = tree.get(actual);
    if (!bytes) throw new Error(`Missing immutable source file: ${actual}`);
    requireEqual(bytes.length, record.bytes, 'Historical source length');
    requireEqual(sha256(bytes), record.sha256, 'Historical source hash');
    files.set(logical, bytes);
  }
  files.set(BASE_INDEX_PATH, files.get('index.json'));
  files.set(BASE_SIGNATURE_PATH, files.get('index.sig'));
  return files;
}

export async function createCharityReleasePlan({ now = new Date().toISOString(), baseDirectory = BASE } = {}) {
  // An advanced live index or additional later release directory cannot alter
  // this fixed revision's source graph. Select only pinned historical inputs.
  const baseFiles = await loadArchivedBase(baseDirectory);
  requireEqual(sha256(baseFiles.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Production public key');
  requireEqual(sha256(baseFiles.get('index.json')), BASE_INDEX_SHA256, 'Source discovery index');
  const baseIndex = JSON.parse(baseFiles.get('index.json'));
  requireEqual(baseIndex.sequence, 2, 'Source sequence');
  const baseSet = JSON.parse(baseFiles.get(baseIndex.channels.production.path));
  requireEqual(baseIndex.channels.production.sha256, 'e8751a0924b41d1dcb8cf708eb36193a9979a6d551edc092a79bc23890a01506', 'Source release hash');
  for (const [platform, clientVersion] of [['android', 10], ['ios', '0.1.0']]) {
    await validateRelease(baseDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES, indexPath: BASE_INDEX_PATH, indexSignaturePath: BASE_SIGNATURE_PATH });
  }
  const payloadBytes = await readFile(resolve(ROOT, PAYLOAD));
  requireEqual(sha256(payloadBytes), PAYLOAD_SHA256, 'Approved organizations payload');
  const payload = JSON.parse(payloadBytes);
  const approvalBytes = await readFile(resolve(ROOT, APPROVAL));
  requireEqual(sha256(approvalBytes), APPROVAL_SHA256, 'Approval evidence bytes');
  const approval = JSON.parse(approvalBytes);
  const sourceReviewBytes = await readFile(resolve(ROOT, SOURCE_REVIEW));
  requireEqual(sha256(sourceReviewBytes), SOURCE_REVIEW_SHA256, 'Source review evidence bytes');
  const sourceReview = JSON.parse(sourceReviewBytes);
  requireEqual(approval.approval_id, 'shared-charity-cards-2026-09-18-r1', 'Approval identity');
  requireEqual(approval.payload_binding.sha256, PAYLOAD_SHA256, 'Approval payload hash');
  requireEqual(approval.payload_binding.bytes, payloadBytes.length, 'Approval payload bytes');
  requireEqual(approval.payload_binding.version, payload.version, 'Approval payload version');
  requireEqual(approval.payload_binding.revision, payload.revision, 'Approval payload revision');
  requireEqual(sourceReview.payload_sha256, PAYLOAD_SHA256, 'Source review payload hash');
  requireEqual(JSON.stringify(approval.consumer_platforms), JSON.stringify(['android', 'ios']), 'Approval platforms');
  requireEqual(approval.decision_evidence.path, 'approvals/charity-cards-2026-09-18/README.md', 'Approval decision path');
  requireEqual(sha256(await readFile(resolve(ROOT, approval.decision_evidence.path))), approval.decision_evidence.sha256, 'Approval decision hash');
  requireEqual(JSON.stringify(payload.organizations.map(org => org.id)), JSON.stringify(approval.authorized_content.organization_ids), 'Approved organization IDs');
  if (payload.organizations.some(org => org.payment_rails.length !== 0 || org.logo !== null || org.links.length !== 2)) throw new Error('Charity release exceeds approved links-only scope');
  const context = { module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: payload.version, revision: payload.revision };
  const eligibility = validateOrganizationsRegistry(payload, {
    now, contentAuthenticated: true, paymentSessionFresh: true,
    clientCapabilities: ['organizations-v1'], moduleContext: context
  });
  // This is only an editorial preflight of proposed bytes. No authenticated
  // runtime state is created; signatures are absent until the separate signer.
  if (!eligibility.registry_eligible || eligibility.organizations.some(org => org.links.some(link => !link.enabled))) throw new Error('Reviewed payload is not currently eligible for preparation');

  const files = new Map(baseFiles);
  files.delete('index.sig');
  const prefix = `releases/${RELEASE_ID}`;
  const moduleDirectory = `${prefix}/modules/organizations-v1-${payload.version}-r${payload.revision}`;
  const moduleFiles = [
    ['data/organizations-v1.json', payloadBytes],
    ['evidence/owner-approval.json', approvalBytes],
    ['evidence/source-review.json', sourceReviewBytes]
  ];
  for (const [path, bytes] of moduleFiles) files.set(`${moduleDirectory}/${path}`, bytes);
  const manifestBytes = json({
    schema_version: 'svetlost33-module-manifest-2', module_id: 'organizations-v1', module_type: 'organizations',
    version: payload.version, revision: payload.revision, key_id: KEY_ID,
    capabilities: ['organizations-v1'], dependencies: [], files: moduleFiles.map(([path, bytes]) => fileRecord(path, bytes))
  });
  const manifestPath = `${moduleDirectory}/manifest.json`;
  files.set(manifestPath, manifestBytes);
  const entry = {
    module_id: 'organizations-v1', module_type: 'organizations', version: payload.version, required: false,
    manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: `${moduleDirectory}/manifest.sig`
  };
  const releasePath = `${prefix}/release-set.json`;
  const releaseSignaturePath = `${prefix}/release-set.sig`;
  const releaseBytes = json({ ...baseSet, release_set_id: RELEASE_ID, sequence: 3, modules: [...baseSet.modules, entry] });
  files.set(releasePath, releaseBytes);
  // Retain the annual discovery expiry: charity actions have their own shorter
  // expiry, and its expiry must not disable the unchanged reading modules.
  const indexBytes = json({
    ...baseIndex, sequence: 3, issued_at: payload.issued_at,
    channels: { production: { release_set_id: RELEASE_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: releaseSignaturePath } }
  });
  files.set('index.json', indexBytes);
  const documentsToSign = [
    { path: manifestPath, signature_path: entry.signature_path, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    { path: releasePath, signature_path: releaseSignaturePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes) },
    { path: 'index.json', signature_path: 'index.sig', bytes: indexBytes.length, sha256: sha256(indexBytes) }
  ];
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE',
    release_set_id: RELEASE_ID, sequence: 3, key_id: KEY_ID,
    expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: BASE_INDEX_SHA256,
    source_release_sha256: baseIndex.channels.production.sha256,
    payload_sha256: PAYLOAD_SHA256,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: documentsToSign,
    preserved_module_ids: baseSet.modules.map(module => module.module_id),
    minimum_clients: baseSet.min_clients,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
  files.set('signing-request.json', json(request));
  return { files, request };
}

export async function writeNewTree(out, files) {
  const directory = resolve(out);
  await mkdir(dirname(directory), { recursive: true });
  // Refuse existing directories instead of removing or replacing any content.
  await mkdir(directory);
  for (const [path, bytes] of files) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe output path');
    const target = resolve(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  return directory;
}

export async function prepareCharityRelease(out, options = {}) {
  const plan = await createCharityReleasePlan(options);
  await writeNewTree(out, plan.files);
  return plan.request;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  if (flags.length !== 2 || flags[0] !== '--out') throw new Error('Usage: node scripts/prepare-charity-release-v2.mjs --out <new-candidate-directory>');
  const request = await prepareCharityRelease(flags[1]);
  console.log(`Prepared unsigned ${request.release_set_id}; ${request.documents_to_sign.length} detached signatures remain required. No private key was accessed.`);
}
