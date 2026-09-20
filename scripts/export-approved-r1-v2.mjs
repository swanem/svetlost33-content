#!/usr/bin/env node
import { constants, createHash, createPublicKey, sign, verify } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertBibleCandidate } from './validate-bible-reference-v1.mjs';

const root = resolve(import.meta.dirname, '..');
const valueAfter = flag => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};
const legacy = resolve(valueAfter('--source') || resolve(root, 'releases/legacy/annual-2026-r1'));
const approvalMode = valueAfter('--approval-mode') || 'android-history';
if (!['android-history', 'shared'].includes(approvalMode)) {
  throw new Error('approval-mode must be android-history or shared');
}
const shared = approvalMode === 'shared';
const releaseSetId = shared ? 'shared-annual-2026-r1-m0v2-s2' : 'annual-2026-r1-m0v2';
const moduleVersion = shared ? '2026.1.1' : '2026.1.0';
const moduleRevision = shared ? 2 : 1;
const ownerApprovalId = shared
  ? 'shared-annual-2026-r1-2026-09-15'
  : 'android-annual-2026-r1-2026-09-15';
const approvedPlatforms = shared ? ['android', 'ios'] : ['android'];
const out = resolve(valueAfter('--out') || resolve(root, shared
  ? 'build/v0.17-shared-discovery-root'
  : 'releases/v2/annual-2026-r1'));
const privateKeyPath = valueAfter('--private-key') || process.env.SVETLOST33_CONTENT_PRIVATE_KEY;
const expectedPublicKeyPath = valueAfter('--public-key');
const sequence = Number(valueAfter('--sequence') || (shared ? 2 : 1));
const issuedAt = valueAfter('--issued-at') || '2026-09-15T00:00:00Z';
const expiresAt = valueAfter('--expires-at') || '2027-02-01T00:00:00Z';
const keyId = 'svetlost33-content-2026-key-1';
// The output root is the stable discovery root. Shared artifacts live below a
// release-specific immutable prefix, while only index.json/index.sig change
// between signed discovery decisions. Paths remain root-relative for both
// native M0 v2 resolvers.
const releasePrefix = shared ? `releases/${releaseSetId}` : '';
const atRelease = path => releasePrefix ? `${releasePrefix}/${path}` : path;
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const signature = (bytes, privateKey) => Buffer.from(`${sign('sha256', bytes, {
  key:privateKey,
  padding:constants.RSA_PKCS1_PSS_PADDING,
  saltLength:32
}).toString('base64')}\n`, 'ascii');
const put = async (path, bytes) => {
  const target = resolve(out, path);
  await mkdir(dirname(target), { recursive:true });
  await writeFile(target, bytes);
  return bytes;
};
const record = (path, bytes) => ({
  path,
  bytes:bytes.length,
  sha256:sha256(bytes),
  content_type:'application/json',
  encoding:'utf-8'
});

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function loadApprovedSource(publicKey) {
  const manifestBytes = await readFile(resolve(legacy, 'manifest.json'));
  const manifestSignature = Buffer.from((await readFile(resolve(legacy, 'manifest.sig'), 'ascii')).trim(), 'base64');
  if (!verify('sha256', manifestBytes, { key:publicKey, padding:constants.RSA_PKCS1_PADDING }, manifestSignature)) {
    throw new Error('The approved legacy manifest signature is invalid');
  }
  requireEqual(sha256(manifestBytes), 'adcd9c4c03fea220142c4e4e7027ffc4596d77ea44f6f248556723cbe73c640a', 'legacy manifest SHA-256');
  const manifest = JSON.parse(manifestBytes);
  const legacyApprovalBytes = await readFile(resolve(legacy, 'approval.json'));
  const approval = JSON.parse(legacyApprovalBytes);
  requireEqual(manifest.package_id, 'svetlost33-annual-2026-r1', 'source package');
  requireEqual(manifest.status, 'RELEASED', 'source release status');
  requireEqual(manifest.production_ready, true, 'source production approval');
  requireEqual(manifest.release_allowed, true, 'source distribution approval');
  requireEqual(manifest.signing_key_id, keyId, 'source signing key');
  requireEqual(approval.approval_id, 'android-annual-2026-r1-2026-09-15', 'owner approval');
  requireEqual(approval.historical_prayers_distribution_authorized, true, 'historical prayer rights');
  requireEqual(approval.android_release_before_ios_authorized, true, 'Android release approval');
  requireEqual(approval.unresolved_display_policy, 'SHOW_NOT_CONFIRMED', 'unresolved display policy');
  for (const [field, expected] of [['psalms',150], ['prayers',18], ['gospel_books',4], ['radio_suggestion_dates',173], ['unresolved_gospel_dates',192], ['unknown_fasting_rule_dates',91]]) {
    requireEqual(approval[field], expected, `approval ${field}`);
  }
  requireEqual(manifest.files.length, 13, 'approved payload count');

  const payload = new Map();
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(legacy, 'payload', file.path));
    requireEqual(bytes.length, file.bytes, `${file.path} length`);
    requireEqual(sha256(bytes), file.sha256, `${file.path} SHA-256`);
    payload.set(file.path, bytes);
  }

  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    assertBibleCandidate({ locale, generationId: releaseSetId,
      psalms: JSON.parse(payload.get(`psalms.${locale}.json`)),
      gospels: JSON.parse(payload.get(`gospels.${locale}.json`)),
      cycle: JSON.parse(payload.get(`legacy-cycle.${locale}.json`)),
      calendar: JSON.parse(payload.get('calendar.2026.json')) });
    requireEqual(JSON.parse(payload.get(`psalms.${locale}.json`)).psalms.length, 150, `${locale} psalms`);
    requireEqual(JSON.parse(payload.get(`prayers.${locale}.json`)).prayers.length, 18, `${locale} prayers`);
    requireEqual(JSON.parse(payload.get(`gospels.${locale}.json`)).books.length, 4, `${locale} Gospel books`);
    requireEqual(JSON.parse(payload.get(`legacy-cycle.${locale}.json`)).days.length, 7, `${locale} cycle days`);
  }
  const calendar = JSON.parse(payload.get('calendar.2026.json'));
  requireEqual(calendar.days.length, 365, 'calendar dates');
  requireEqual(calendar.days.filter(day => day.gospel.status === 'SOURCE_RECORDED').length, 173, 'source-recorded Gospel dates');
  requireEqual(calendar.days.filter(day => day.gospel.status === 'UNRESOLVED').length, 192, 'unresolved Gospel dates');
  requireEqual(calendar.days.filter(day => day.fasting.rule === 'UNKNOWN').length, 91, 'unknown fasting-rule dates');
  if (calendar.days.some(day => day.gospel.complete_service_schedule_verified !== false)) {
    throw new Error('Calendar must not claim a complete service schedule');
  }

  let approvalBytes = legacyApprovalBytes;
  if (shared) {
    approvalBytes = await readFile(resolve(root, 'approvals/shared-annual-2026-r1-2026-09-15.json'));
    const sharedApproval = JSON.parse(approvalBytes);
    requireEqual(sharedApproval.schema_version, 'svetlost33-owner-content-approval-1', 'shared approval schema');
    requireEqual(sharedApproval.approval_id, ownerApprovalId, 'shared owner approval');
    requireEqual(sharedApproval.approval_type, 'SHARED_CONTENT_DISTRIBUTION_AUTHORIZATION', 'shared approval type');
    requireEqual(sharedApproval.approved_at, '2026-09-15', 'shared approval date');
    requireEqual(sharedApproval.approved_by, 'project_owner', 'shared approver');
    requireEqual(sharedApproval.user_statement, 'želim da se jednom odobri sadržaj i bude dostupan za osveženje oba OS', 'shared owner statement');
    requireEqual(sharedApproval.approval_policy, 'ONCE_PER_IMMUTABLE_CONTENT_REVISION', 'shared approval policy');
    requireEqual(JSON.stringify(sharedApproval.consumer_platforms), JSON.stringify(approvedPlatforms), 'shared platforms');
    requireEqual(JSON.stringify(sharedApproval.territories), JSON.stringify(['RS', 'BA']), 'shared territories');
    requireEqual(JSON.stringify(sharedApproval.consolidates_prior_decisions), JSON.stringify([
      'android-annual-2026-r1-2026-09-15', 'ios-annual-2026-r1-2026-09-15'
    ]), 'consolidated approvals');
    requireEqual(sharedApproval.source.repository, 'swanem/svetlost33-content', 'approval source repository');
    requireEqual(sharedApproval.source.commit, '3b1ca8050c44afc41d52ec28a5dc53d5b7e60b19', 'approval source commit');
    requireEqual(sharedApproval.source.package_id, manifest.package_id, 'approval source package');
    requireEqual(sharedApproval.source.manifest_path, 'releases/legacy/annual-2026-r1/manifest.json', 'approval manifest path');
    requireEqual(sharedApproval.source.manifest_sha256, sha256(manifestBytes), 'approval source manifest');
    requireEqual(sharedApproval.source.payload_file_count, manifest.files.length, 'approval payload count');
    requireEqual(sharedApproval.source.payload_identity_rule,
      'All entries in manifest.files retain exact content bytes, sizes, SHA-256 and source identity; no independent platform edits.',
      'approval payload identity rule');
    const authorized = sharedApproval.authorized_content;
    for (const [field, expected] of [['psalms',150], ['prayers',18], ['historical_prayers',12],
      ['gospel_books',4], ['daily_cycle_days',7], ['daily_cycle_slots',21],
      ['calendar_year',2026], ['calendar_dates',365]]) {
      requireEqual(authorized[field], expected, `shared approval ${field}`);
    }
    requireEqual(JSON.stringify(authorized.locales), JSON.stringify(['sr-Cyrl', 'sr-Latn']), 'approved locales');
    requireEqual(authorized.local_sources_and_licenses, true, 'approved sources and licenses');
    const limits = sharedApproval.preserved_limits;
    requireEqual(limits.radio_suggestion_dates, 173, 'shared radio suggestions');
    requireEqual(limits.radio_source, 'Radio Slovo ljubve', 'shared radio source');
    requireEqual(limits.unresolved_gospel_dates, 192, 'shared unresolved readings');
    requireEqual(limits.unknown_fasting_rule_dates, 91, 'shared unknown fasting rules');
    requireEqual(limits.unresolved_display_policy, 'SHOW_NOT_CONFIRMED', 'shared unresolved display policy');
    requireEqual(limits.complete_liturgical_schedule, false, 'shared service-schedule boundary');
    requireEqual(JSON.stringify(sharedApproval.not_in_this_revision), JSON.stringify([
      'background_module', 'organizations_and_payment_data', 'new_texts_translations_or_calendar_assertions'
    ]), 'shared approval exclusions');
    const policy = sharedApproval.release_policy;
    for (const field of ['shared_release_set', 'shared_discovery_channel',
      'client_compatibility_checks_required', 'platform_technical_qa_required',
      'existing_signed_artifacts_immutable', 'changed_content_or_rights_requires_new_shared_approval',
      'technical_metadata_only_revision_may_reuse_approval']) {
      requireEqual(policy[field], true, `shared release policy ${field}`);
    }
    requireEqual(policy.platform_specific_content_reapproval_required, false, 'platform reapproval policy');
    requireEqual(JSON.stringify(policy.target_platforms), JSON.stringify(approvedPlatforms), 'shared target platforms');
    requireEqual(sharedApproval.evidence_record_only, true, 'approval evidence state');
    requireEqual(sharedApproval.signed_runtime_release_created_by_this_record, false, 'approval signing state');
    requireEqual(sharedApproval.publication_or_installation_performed, false, 'approval publication state');
  }
  return { manifest, manifestBytes, approvalBytes, payload };
}

if (!privateKeyPath) {
  throw new Error('Pass --private-key or set SVETLOST33_CONTENT_PRIVATE_KEY; a production signing key is never stored in the repository');
}
if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive safe integer');
if (shared && sequence !== 2) throw new Error('shared annual r1 export is immutable at sequence 2');
if (!Number.isFinite(Date.parse(issuedAt)) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(issuedAt)) {
  throw new Error('issued-at and expires-at must define a valid increasing RFC 3339 interval');
}
const privateStat = await lstat(resolve(privateKeyPath));
if (!privateStat.isFile() || privateStat.isSymbolicLink()) throw new Error('Private key must be a regular file');
const privateKey = await readFile(resolve(privateKeyPath), 'utf8');
const publicKey = createPublicKey(privateKey).export({ type:'spki', format:'pem' }).toString();
if (expectedPublicKeyPath) {
  const expectedPublicKey = await readFile(resolve(expectedPublicKeyPath), 'utf8');
  if (createPublicKey(expectedPublicKey).export({ type:'spki', format:'der' }).compare(createPublicKey(publicKey).export({ type:'spki', format:'der' })) !== 0) {
    throw new Error('Private and expected public content signing keys do not match');
  }
}
const probe = Buffer.from('svetlost33-content-key-pair-check');
if (!verify('sha256', probe, { key:publicKey, padding:constants.RSA_PKCS1_PSS_PADDING, saltLength:32 }, sign('sha256', probe, { key:privateKey, padding:constants.RSA_PKCS1_PSS_PADDING, saltLength:32 }))) {
  throw new Error('Private and public content signing keys do not match');
}
const legacyPublicKey = await readFile(resolve(legacy, 'public-key.pem'), 'utf8');
const source = await loadApprovedSource(legacyPublicKey);

await rm(out, { recursive:true, force:true });
await mkdir(out, { recursive:true });
await writeFile(resolve(out, 'trusted-public-key.pem'), publicKey);

const scope = json({
  schema_version:'svetlost33-approved-content-scope-1',
  source_package_id:source.manifest.package_id,
  source_manifest_sha256:sha256(source.manifestBytes),
  owner_approval_id:ownerApprovalId,
  approved_platforms:approvedPlatforms,
  content:{ psalms:150, prayers:18, historical_prayers:12, gospel_books:4, calendar_dates:365 },
  daily_readings:{
    source:'Radio Slovo ljubve',
    source_recorded_suggestion_dates:173,
    unresolved_dates:192,
    complete_liturgical_schedule:false,
    unresolved_display_policy:'SHOW_NOT_CONFIRMED'
  },
  fasting:{ unknown_rule_dates:91, unresolved_display_policy:'SHOW_NOT_CONFIRMED' },
  exclusions:{
    backgrounds:'No per-asset rights inventory and approval is present in annual-2026-r1.',
    organizations:'No approved organization or payment data is present.'
  },
  provenance_note:shared
    ? 'Payload bytes retain their historical review fields; this signed scope records one immutable owner approval for the same content revision on Android and iOS.'
    : 'Payload bytes retain their pre-approval review fields as historical evidence; this signed scope and the immutable owner approval record the later Android release decision.'
});

const definitions = [
  {
    id:'library-annual-2026-r1', type:'library', version:moduleVersion, required:true,
    capabilities:['library-v1','sr-Cyrl','sr-Latn'], dependencies:[],
    files:[
      ...['psalms','prayers','gospels','sources','licenses'].flatMap(kind => ['sr-Cyrl','sr-Latn'].map(locale => `data/${kind}.${locale}.json`)),
      'data/release-scope.json', 'evidence/owner-approval.json', 'evidence/source-release-manifest.json'
    ]
  },
  {
    id:'daily-cycles-r1', type:'cycles', version:moduleVersion, required:true,
    capabilities:['cycle-v1','sr-Cyrl','sr-Latn'], dependencies:[{ module_id:'library-annual-2026-r1', version:moduleVersion }],
    files:['data/legacy-cycle.sr-Cyrl.json','data/legacy-cycle.sr-Latn.json']
  },
  {
    id:'calendar-2026-r1', type:'calendar', version:moduleVersion, required:true,
    capabilities:['calendar-v1','explicit-unknown'], dependencies:[{ module_id:'library-annual-2026-r1', version:moduleVersion }],
    files:['data/calendar.2026.json']
  }
];
const synthetic = new Map([
  ['data/release-scope.json', scope],
  ['evidence/owner-approval.json', source.approvalBytes],
  ['evidence/source-release-manifest.json', source.manifestBytes]
]);
const modules = [];
for (const definition of definitions) {
  const moduleLeaf = shared
    ? `${definition.id}-${definition.version}-r${moduleRevision}`
    : definition.id;
  const directory = atRelease(`modules/${moduleLeaf}`);
  const records = [];
  for (const path of definition.files) {
    let bytes = synthetic.get(path);
    if (!bytes) bytes = source.payload.get(path.replace(/^data\//, ''));
    if (!bytes) throw new Error(`No approved source bytes for ${path}`);
    await put(`${directory}/${path}`, bytes);
    records.push(record(path, bytes));
  }
  const manifestBytes = json({
    schema_version:'svetlost33-module-manifest-2', module_id:definition.id, module_type:definition.type,
    version:definition.version, revision:moduleRevision, key_id:keyId, capabilities:definition.capabilities,
    dependencies:definition.dependencies, files:records
  });
  await put(`${directory}/manifest.json`, manifestBytes);
  await put(`${directory}/manifest.sig`, signature(manifestBytes, privateKey));
  modules.push({
    module_id:definition.id, module_type:definition.type, version:definition.version, required:definition.required,
    manifest_path:`${directory}/manifest.json`, manifest_bytes:manifestBytes.length,
    manifest_sha256:sha256(manifestBytes), signature_path:`${directory}/manifest.sig`
  });
}
const releaseSetBytes = json({
  schema_version:'svetlost33-release-set-2', release_set_id:releaseSetId, sequence,
  channel:'production', key_id:keyId, approved_platforms:approvedPlatforms,
  min_clients:{ android:10, ios:shared ? '0.1.0' : '0.15.0' }, modules
});
const releaseSetPath = atRelease('release-set.json');
const releaseSignaturePath = atRelease('release-set.sig');
await put(releaseSetPath, releaseSetBytes);
await put(releaseSignaturePath, signature(releaseSetBytes, privateKey));
const indexBytes = json({
  schema_version:'svetlost33-m0-index-2', sequence, issued_at:issuedAt, expires_at:expiresAt, key_id:keyId,
  channels:{ production:{ release_set_id:releaseSetId, path:releaseSetPath, bytes:releaseSetBytes.length, sha256:sha256(releaseSetBytes), signature_path:releaseSignaturePath } }
});
await put('index.json', indexBytes);
await put('index.sig', signature(indexBytes, privateKey));
console.log(`Exported signed ${shared ? 'shared Android/iOS' : 'historical Android'} M0 v2 annual-2026-r1 release (${modules.length} modules, ${source.manifest.files.length} approved payloads) to ${out}`);
