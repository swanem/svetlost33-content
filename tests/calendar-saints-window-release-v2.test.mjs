import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { BASE, ROOT, KEY_ID, json, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { createCalendarSaintsWindowPlan, loadWindowS11Base, assertWindowApproval, WINDOW_RELEASE_ID,
  WINDOW_SEQUENCE, WINDOW_PREPARED_AT, S11_INDEX_SHA256, S11_ARCHIVE, WINDOW_PRESERVED_IDS } from '../scripts/prepare-calendar-saints-window-v2.mjs';
import { assertWindowUnsignedCandidate, signCalendarSaintsWindow } from '../scripts/sign-calendar-saints-window-v2.mjs';
import { assertRefreshExternalKey } from '../scripts/sign-shared-refresh-release-v2.mjs';
import { refreshPreflight } from '../scripts/prepare-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from '../scripts/prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const temporaryRoot = await realpath(tmpdir());
// Current S11 while preparing, preserved exact discovery after activation; never weaken the production live gate.
const activeIndex = JSON.parse(await readFile(resolve(BASE, 'index.json')));
const source = await loadWindowS11Base({ now: WINDOW_PREPARED_AT, archived: activeIndex.sequence !== 11 });
const sourceFiles = new Map(source.files);
sourceFiles.set('index.json', source.files.get(`${S11_ARCHIVE}/index.json`));
sourceFiles.set('index.sig', source.files.get(`${S11_ARCHIVE}/index.sig`));
const temp = await mkdtemp(resolve(temporaryRoot, 'svetlost-s12-tests-'));
const exactSource = resolve(temp, 'exact-s11');
await writeNewTree(exactSource, sourceFiles);
const plan = await createCalendarSaintsWindowPlan({ sourceDirectory: exactSource, now: WINDOW_PREPARED_AT });
const before = id => {
  const entry = plan.base.set.modules.find(item => item.module_id === id);
  return JSON.parse(plan.base.files.get(`${dirname(entry.manifest_path)}/data/${id}.json`));
};

test('S12 adds only two optional revisions; all five other module entries, bytes and signatures are immutable', () => {
  assert.equal(plan.set.release_set_id, WINDOW_RELEASE_ID); assert.equal(plan.set.sequence, WINDOW_SEQUENCE);
  assert.deepEqual(plan.set.approved_platforms, ['android', 'ios']);
  assert.deepEqual(plan.set.min_clients, { android: 35, ios: '0.1.0' });
  assert.equal(plan.set.modules.length, 7);
  assert.deepEqual(plan.request.preserved_module_ids, WINDOW_PRESERVED_IDS);
  for (const id of WINDOW_PRESERVED_IDS) assert.deepEqual(plan.set.modules.find(item => item.module_id === id), plan.base.set.modules.find(item => item.module_id === id));
  for (const [path, bytes] of plan.base.files) assert.ok(plan.files.get(path)?.equals(bytes), path);
  assert.equal(sha256(plan.files.get(`${S11_ARCHIVE}/index.json`)), S11_INDEX_SHA256);
});

test('exact approved pending bytes change only approval fields; all 62 articles and old four links remain intact', async () => {
  const { owner, pending } = await assertWindowApproval();
  const promoted = structuredClone(pending); promoted.review_status = 'approved'; promoted.approval_id = owner.approval_id;
  assert.deepEqual(plan.payloads.catalog, promoted);
  const old = before('liturgical-catalog-v1');
  for (const key of ['subjects', 'observances', 'occurrences', 'article_links']) assert.deepEqual(promoted[key].slice(0, old[key].length), old[key]);
  assert.deepEqual([promoted.subjects.length, promoted.observances.length, promoted.occurrences.length, promoted.article_links.length], [18, 34, 32, 11]);
  assert.deepEqual(plan.payloads.saints, before('saints-v1')); assert.equal(plan.payloads.saints.articles.length, 62);
  assert.deepEqual(plan.payloads.organizations, before('organizations-v1'));
  assert.deepEqual(promoted.sources, old.sources); assert.deepEqual(promoted.article_bindings, old.article_bindings);
  assert.deepEqual(promoted.calendar_bindings, old.calendar_bindings);
});

test('calendar-browser rebinds exact new catalog only: 21 memberships, 94 archive days and expiry are unchanged', () => {
  const old = before('calendar-browser-v1'), restored = structuredClone(plan.payloads.browser);
  const catalogEntry = plan.set.modules.find(item => item.module_id === 'liturgical-catalog-v1');
  const catalogManifest = JSON.parse(plan.files.get(catalogEntry.manifest_path));
  assert.equal(restored.catalog_binding.sha256, catalogManifest.files[0].sha256);
  restored.catalog_binding = old.catalog_binding;
  for (const key of ['version', 'revision', 'approval_id']) restored[key] = old[key];
  assert.deepEqual(restored, old);
  assert.equal(restored.feast_memberships.length, 21); assert.equal(restored.archive_days.length, 94);
  assert.equal(JSON.parse(plan.files.get('index.json')).expires_at, plan.base.index.expires_at);
  assert.equal(plan.request.preflight.compatibility.length, 12);
});

test('unknown annual values and unavailable 2027 cannot be promoted by this release', () => {
  const entry = plan.set.modules.find(item => item.module_id === 'calendar-2026-r1');
  const calendar = JSON.parse(plan.files.get(`${dirname(entry.manifest_path)}/data/calendar.2026.json`));
  for (const day of calendar.days.filter(day => day.date >= '2026-10-02' && day.date <= '2026-10-08')) {
    assert.equal(day.gospel.status, 'UNRESOLVED'); assert.equal(day.gospel.production_eligible, false);
  }
  assert.equal(calendar.days.find(day => day.date === '2026-10-02').fasting.rule, 'UNKNOWN');
  assert.deepEqual(plan.payloads.catalog.coverage.find(item => item.year === 2027), before('liturgical-catalog-v1').coverage.find(item => item.year === 2027));
  assert.ok(![...plan.files.keys()].some(path => path.startsWith(`releases/${WINDOW_RELEASE_ID}`) && /radio|media|saints-v1|calendar\.2026/.test(path)));
});

test('unsigned artifact set is reproducible and only 12 exact public delta paths are allowed after signing', async () => {
  const again = await createCalendarSaintsWindowPlan({ sourceDirectory: exactSource, now: WINDOW_PREPARED_AT });
  assert.deepEqual([...again.files.keys()].sort(), [...plan.files.keys()].sort());
  for (const [path, bytes] of plan.files) assert.ok(again.files.get(path).equals(bytes), path);
  assert.equal(plan.request.documents_to_sign.length, 4);
  assert.equal(plan.request.publication_allowlist.length, 12);
  assert.ok(plan.request.publication_allowlist.every(path => !/approval|evidence|signing-request|handoff|\.pem$/.test(path)));
  assert.equal([...plan.files.keys()].filter(path => path.startsWith(`releases/${WINDOW_RELEASE_ID}/`)).length, 5);
  assert.ok(plan.request.documents_to_sign.every(item => !plan.files.has(item.signature_path)));
});

test('source expiry/advance/tamper fail closed; no old-base retry after S12', async () => {
  await assert.rejects(createCalendarSaintsWindowPlan({ sourceDirectory: exactSource, now: '2027-02-01T00:00:01Z' }), /freshness/);
  const advanced = new Map(sourceFiles); advanced.set('index.json', plan.files.get('index.json'));
  const path = resolve(temp, 'advanced'); await writeNewTree(path, advanced);
  await assert.rejects(createCalendarSaintsWindowPlan({ sourceDirectory: path, now: WINDOW_PREPARED_AT }), /source discovery advanced/);
  const corrupt = new Map(sourceFiles); corrupt.set('index.sig', Buffer.from('AAAA\n'));
  const broken = resolve(temp, 'bad-signature'); await writeNewTree(broken, corrupt);
  await assert.rejects(loadWindowS11Base({ sourceDirectory: broken, now: WINDOW_PREPARED_AT }), /Source signature/);
});

test('new exact authorization plus explicit GO is required before any key read; changed candidate fails before key access', async () => {
  await assertWindowApproval();
  await assert.rejects(signCalendarSaintsWindow({ candidate: '/unread', out: '/unwritten', privateKeyPath: '/never-read' }), /coordinator signing GO/);
  const candidate = new Map(plan.files); candidate.set('index.json', json({ forged: true }));
  const path = resolve(temp, 'changed-candidate'); await writeNewTree(path, candidate);
  await assert.rejects(assertWindowUnsignedCandidate(path, plan), /approved-plan mismatch/);
  await assert.rejects(signCalendarSaintsWindow({ candidate: path, out: resolve(temp, 'not-written'), privateKeyPath: resolve(temp, 'never-read.pem'), sourceDirectory: exactSource, coordinatorGo: true }), /approved-plan mismatch/);
  const extra = new Map(plan.files); extra.set('private-note.json', json({ private: true }));
  const extraPath = resolve(temp, 'extra-file'); await writeNewTree(extraPath, extra);
  await assert.rejects(assertWindowUnsignedCandidate(extraPath, plan), /Exact unsigned candidate file set/);
});

test('key boundary, no-follow source/candidate reads and mismatched catalog/browser binding remain blocked', async () => {
  assert.throws(() => assertRefreshExternalKey(resolve(ROOT, 'private.pem'), []), /outside/);
  assert.throws(() => assertRefreshExternalKey(resolve(temp, 'output/private.pem'), [resolve(temp, 'output')]), /outside/);
  const linked = resolve(temp, 'linked-candidate'); await symlink(exactSource, linked);
  await assert.rejects(assertWindowUnsignedCandidate(linked, plan), /Symlink/);
  for (const which of ['catalog', 'browser']) {
    const payloads = structuredClone(plan.payloads);
    if (which === 'catalog') payloads.catalog.article_bindings[0].sha256 = '0'.repeat(64);
    else payloads.browser.catalog_binding.sha256 = '0'.repeat(64);
    assert.throws(() => refreshPreflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads, now: WINDOW_PREPARED_AT }), /exact payload binding/);
  }
});

test('test-only ephemeral signatures validate both platforms and all 12 capability profiles, minimums and replay gate', async () => {
  // Ephemeral in-memory test key, never the production key, and never published.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const files = new Map(plan.files); files.delete('signing-request.json');
  files.set('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
  const signDoc = (path, sig) => files.set(sig, Buffer.from(`${sign('sha256', files.get(path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`));
  for (const entry of plan.set.modules) signDoc(entry.manifest_path, entry.signature_path);
  for (const doc of plan.request.documents_to_sign) signDoc(doc.path, doc.signature_path);
  const stage = resolve(temp, 'ephemeral-not-production'); await writeNewTree(stage, files);
  let profiles = 0;
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(stage, { now: WINDOW_PREPARED_AT, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: 12, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, WINDOW_RELEASE_ID); assert.equal(result.sequence, 12);
    assert.equal(result.modules, profile.modules); assert.equal(result.verifiedModules, 7);
    assert.deepEqual(result.skippedOptionalModules, profile.skipped); profiles++;
  }
  assert.equal(profiles, 24);
  await assert.rejects(validateRelease(stage, { now: WINDOW_PREPARED_AT, platform: 'android', clientVersion: 34, trustedKeyId: KEY_ID }), /client|CLIENT/);
  await assert.rejects(validateRelease(stage, { now: WINDOW_PREPARED_AT, platform: 'ios', clientVersion: '0.0.9', trustedKeyId: KEY_ID }), /client|CLIENT/);
  await assert.rejects(validateRelease(stage, { now: WINDOW_PREPARED_AT, platform: 'android', clientVersion: 35, trustedKeyId: KEY_ID, minimumSequence: 13 }), { code: 'REPLAY' });
});
