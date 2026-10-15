import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { BASE, ROOT, KEY_ID, json, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from '../scripts/prepare-calendar-browser-release-v2.mjs';
import { createSharedRefreshPlan, loadRefreshS10Base, refreshPreflight, readRefreshInput, PREPARED_AT, REFRESH_ID, S10_ARCHIVE, S10_INDEX_SHA256 } from '../scripts/prepare-shared-refresh-release-v2.mjs';
import { assertRefreshPublicationAuthorization, assertRefreshExternalKey, captureRefreshTree, signSharedRefreshRelease, installSharedRefreshRelease, inspectSharedRefreshNativeGo } from '../scripts/sign-shared-refresh-release-v2.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';
import { validateOrganizationsRegistry } from '../scripts/validate-organizations-v1.mjs';
import { evaluateCatalog } from '../scripts/validate-liturgical-catalog-v1.mjs';
import { evaluateSaintsDay } from '../scripts/validate-saints-v1.mjs';

const temporaryRoot = await realpath(tmpdir());
// S11 is now active. Reconstruct the exact signed predecessor from its immutable
// archive, rather than assuming replaceable live discovery will remain at S10.
// The production loader verifies the old signatures and every captured hash.
const historicalBase = await loadRefreshS10Base({ archived: true, now: PREPARED_AT });
const historicalFiles = new Map(historicalBase.files);
historicalFiles.set('index.json', historicalFiles.get(`${S10_ARCHIVE}/index.json`));
historicalFiles.set('index.sig', historicalFiles.get(`${S10_ARCHIVE}/index.sig`));
const fixtureParent = await mkdtemp(resolve(temporaryRoot, 'svetlost-s11-historical-source-'));
const historicalSource = resolve(fixtureParent, 'exact-s10');
await writeNewTree(historicalSource, historicalFiles);
const historicalPlan = options => createSharedRefreshPlan({ sourceDirectory: historicalSource, now: PREPARED_AT, ...options });
const plan = await historicalPlan();
const read = path => readFile(resolve(ROOT, path));
const parsed = async path => JSON.parse(await read(path));
const oldPayload = id => {
  const entry = plan.base.set.modules.find(x => x.module_id === id);
  return JSON.parse(plan.base.files.get(`${dirname(entry.manifest_path)}/data/${id}.json`));
};
const host = organizations => ({ module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: organizations.version, revision: organizations.revision });

test('single approved graph has four promoted modules, both OS, unchanged minimums and no media', () => {
  assert.equal(plan.set.release_set_id, REFRESH_ID); assert.equal(plan.set.sequence, 11);
  assert.deepEqual(plan.set.approved_platforms, ['android', 'ios']);
  assert.deepEqual(plan.set.min_clients, { android: 35, ios: '0.1.0' });
  assert.equal(plan.set.modules.length, 7); assert.equal(plan.request.documents_to_sign.length, 6);
  assert.deepEqual(plan.request.preserved_module_ids, ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1']);
  for (const id of plan.request.preserved_module_ids) assert.deepEqual(plan.set.modules.find(x => x.module_id === id), plan.base.set.modules.find(x => x.module_id === id));
  assert.ok(!plan.set.modules.some(x => x.module_type === 'backgrounds'));
  const newFiles = [...plan.files.keys()].filter(x => x.startsWith(`releases/${REFRESH_ID}/`));
  assert.equal(newFiles.length, 9); assert.ok(newFiles.every(x => !x.includes('evidence') && !x.includes('approval')));
});

test('saints are exact thirty approved additions, preserved thirty-two old records, no rewritten sacred text', async () => {
  const saints = plan.payloads.saints, before = oldPayload('saints-v1');
  const manuscript = await parsed('drafts/saints-next-window-2026-09-30/manuscript.json');
  assert.equal(saints.articles.length, 62); assert.equal(saints.days.length, 62);
  assert.deepEqual(saints.articles.slice(0, 32), before.articles); assert.deepEqual(saints.days.slice(0, 32), before.days);
  assert.deepEqual(saints.articles.slice(32), manuscript.articles);
  assert.deepEqual(saints.calendar_binding, before.calendar_binding);
  assert.equal(saints.days.at(-1).date, '2026-11-19');
  assert.ok(saints.days.every(x => !x.complete_saint_list));
  assert.equal(saints.authorship.clerical_review, null);
  assert.equal(evaluateSaintsDay(saints).eligible, false);
});

test('charity promotion changes only explicitly approved state flags; all URLs/expiry/source dates remain exact', async () => {
  const draft = await parsed('drafts/charity-refresh-2026-09-30/data/organizations-v1.json');
  const promoted = structuredClone(draft); promoted.dataset_kind = 'reviewed';
  for (const org of promoted.organizations) { org.status = 'active'; org.links.forEach(x => { x.status = 'active'; }); }
  assert.deepEqual(plan.payloads.organizations, promoted);
  assert.equal(promoted.organizations.flatMap(x => x.links).length, 15);
  assert.ok(promoted.organizations.every(x => x.logo === null && x.payment_rails.length === 0));
  const options = { now: PREPARED_AT, contentAuthenticated: true, paymentSessionFresh: false, clientCapabilities: ['organizations-v1'], moduleContext: host(promoted) };
  const result = validateOrganizationsRegistry(promoted, options);
  assert.equal(result.organizations.flatMap(x => x.links).filter(x => x.enabled).length, 12);
  assert.equal(validateOrganizationsRegistry(promoted, { ...options, contentAuthenticated: false }).registry_eligible, false);
  assert.equal(validateOrganizationsRegistry(promoted, { ...options, now: promoted.expires_at }).registry_eligible, false);
});

test('canonical catalog is preserved except precise new saints binding and exactly two approved article links', () => {
  const before = oldPayload('liturgical-catalog-v1'), restored = structuredClone(plan.payloads.catalog);
  assert.deepEqual(restored.article_links.slice(-2).map(x => [x.observance_id, x.article_id]), [['obs-paraskeva', 'paraskeva-epivates'], ['obs-demetrius', 'demetrius-thessalonica']]);
  restored.article_links = restored.article_links.slice(0, -2); restored.article_bindings = before.article_bindings;
  for (const key of ['version', 'revision', 'approval_id']) restored[key] = before[key];
  assert.deepEqual(restored, before);
  assert.equal(evaluateCatalog(plan.payloads.catalog).reason, 'content_not_authenticated');
});

test('calendar browser only rebinds exact catalog; archive and membership claims are unmodified', () => {
  const before = oldPayload('calendar-browser-v1'), restored = structuredClone(plan.payloads.browser);
  restored.catalog_binding = before.catalog_binding;
  for (const key of ['version', 'revision', 'approval_id']) restored[key] = before[key];
  assert.deepEqual(restored, before);
  assert.equal(restored.archive_days.length, 94); assert.equal(restored.feast_memberships.length, 21);
  assert.equal(plan.request.preflight.compatibility.length, 12);
});

test('radio proposals stay local evidence: no fabricated annual decision or partial malformed row promotion', () => {
  assert.equal(plan.report.radio_proposals.count, 30); assert.equal(plan.report.radio_proposals.runtime_calendar_modified, false);
  assert.equal(plan.report.radio_proposals.service_assignment_status, 'UNRESOLVED');
  assert.ok(!plan.report.radio_proposals.valid_dates.includes('2026-10-16'));
  assert.ok(![...plan.files.keys()].some(x => x.startsWith(`releases/${REFRESH_ID}/`) && /radio|calendar\.2026/.test(x)));
});

test('every captured S10 byte and signature is preserved, except replaceable discovery', async () => {
  for (const [path, bytes] of plan.base.files) assert.ok(plan.files.get(path)?.equals(bytes), path);
  assert.equal(sha256(plan.files.get(`${S10_ARCHIVE}/index.json`)), S10_INDEX_SHA256);
  assert.equal(sha256(await readFile(resolve(historicalSource, 'index.json'))), S10_INDEX_SHA256);
  assert.ok((await readFile(resolve(historicalSource, 'index.sig'))).equals(plan.base.files.get(`${S10_ARCHIVE}/index.sig`)));
  const again = await historicalPlan();
  assert.deepEqual([...again.files.keys()], [...plan.files.keys()]);
  for (const [path, bytes] of plan.files) assert.ok(again.files.get(path).equals(bytes), path);
});

test('default preparation against already active S11 refuses duplicate publication', async () => {
  await assert.rejects(createSharedRefreshPlan({ now: PREPARED_AT }), /S10 source discovery advanced: replan required/);
});

test('expired source freshness blocks preparation without extending charity validity', async () => {
  await assert.rejects(historicalPlan({ now: '2026-10-01T10:55:31Z' }), /older than 24 hours/);
  await assert.rejects(historicalPlan({ now: 'not-a-time' }), /Valid preparation time/);
});

test('mismatched exact catalog/browser links fail preflight', () => {
  for (const target of ['catalog', 'browser']) {
    const payloads = structuredClone(plan.payloads);
    if (target === 'catalog') payloads.catalog.article_bindings[0].sha256 = '0'.repeat(64);
    else payloads.browser.catalog_binding.sha256 = '0'.repeat(64);
    assert.throws(() => refreshPreflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads, now: PREPARED_AT }), /Same-generation exact payload binding/);
  }
});

test('read path rejects symlinks; changed signed source cannot be reused', async () => {
  const temporary = await mkdtemp(resolve(temporaryRoot, 'svetlost-s11-negative-'));
  await symlink(resolve(BASE, 'index.json'), resolve(temporary, 'linked.json'));
  await assert.rejects(readRefreshInput(resolve(temporary, 'linked.json')), /Symlink/);
  const source = new Map(plan.base.files); source.set('index.json', Buffer.from('{}\n')); source.set('index.sig', plan.base.files.get(`${S10_ARCHIVE}/index.sig`));
  await writeNewTree(resolve(temporary, 'source'), source);
  await assert.rejects(loadRefreshS10Base({ sourceDirectory: resolve(temporary, 'source'), now: PREPARED_AT }), /source discovery advanced/);
});

test('both authorizations are explicit and no missing GO can touch signing key or activation target', async () => {
  await assertRefreshPublicationAuthorization();
  await assert.rejects(signSharedRefreshRelease({ candidate: '/unread', out: '/unwritten', privateKeyPath: '/never-read' }), /signing GO/);
  await assert.rejects(installSharedRefreshRelease({ signedDirectory: '/unread' }), /activation GO/);
  await assert.rejects(inspectSharedRefreshNativeGo({ paths: {}, indexSha256: '', releaseSha256: '' }), /android native GO/);
});

test('signing key must be outside repository and source/candidate/output; captured trees reject symlinks', async () => {
  assert.throws(() => assertRefreshExternalKey(resolve(ROOT, 'secret.pem'), []), /outside/);
  assert.throws(() => assertRefreshExternalKey('/private/tmp/source/key.pem', ['/private/tmp/source']), /outside/);
  assert.doesNotThrow(() => assertRefreshExternalKey('/private/tmp/external-key.pem', ['/private/tmp/source']));
  const directory = await mkdtemp(resolve(temporaryRoot, 'svetlost-s11-tree-'));
  await symlink(resolve(BASE, 'index.json'), resolve(directory, 'leak.json'));
  await assert.rejects(captureRefreshTree(directory), /Symlink/);
});

test('native GO requires matching release hashes and real hashed artifacts, not a status label alone', async () => {
  const temporary = await mkdtemp(resolve(temporaryRoot, 'svetlost-s11-native-go-'));
  const proof = { schema_version: 'svetlost33-native-shared-refresh-go-1', platform: 'android', status: 'GO_FOR_S11_ACTIVATION', release_set_id: REFRESH_ID, sequence: 11, index_sha256: 'wrong', release_sha256: 'wrong', recorded_at: PREPARED_AT, artifacts: [] };
  await writeNewTree(resolve(temporary, 'proofs'), new Map([['android.json', json(proof)]]));
  await assert.rejects(inspectSharedRefreshNativeGo({ paths: { android: resolve(temporary, 'proofs/android.json') }, indexSha256: 'expected', releaseSha256: 'expected', now: PREPARED_AT }), /wrong/);
});

test('ephemeral test key validates exact S11 transport on both OS and all twelve capability profiles', async () => {
  const temporary = await mkdtemp(resolve(temporaryRoot, 'svetlost-s11-transport-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const files = new Map(plan.files); files.delete('signing-request.json');
  files.set('trusted-public-key.pem', Buffer.from(publicKey.export({ format: 'pem', type: 'spki' })));
  const signDocument = (path, signaturePath) => files.set(signaturePath, Buffer.from(`${sign('sha256', files.get(path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`));
  for (const entry of plan.set.modules) signDocument(entry.manifest_path, entry.signature_path);
  for (const doc of plan.request.documents_to_sign) signDocument(doc.path, doc.signature_path);
  const stage = resolve(temporary, 'ephemeral-signed-not-production'); await writeNewTree(stage, files);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(stage, { now: PREPARED_AT, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: 11, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, REFRESH_ID); assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7);
    assert.deepEqual(result.skippedOptionalModules, profile.skipped);
  }
  await assert.rejects(validateRelease(stage, { now: PREPARED_AT, platform: 'android', clientVersion: 34, trustedKeyId: KEY_ID }), /client|CLIENT/);
});
