import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, constants, verify } from 'node:crypto';
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { BASE, ROOT, KEY_ID, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_CAPABILITIES, CALENDAR_BROWSER_PROFILES } from '../../scripts/prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { parseSaintsPayload as historicalSaints, toLatin, articleWordCount } from '../../scripts/validate-saints-v1.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { HERE, createPlan, approvedInputs, loadS12, host, preflight, record, parse, nativeDescriptor, SEQUENCE, RELEASE_ID, S12_ARCHIVE, PUBLIC_COMMIT, PREPARED_AT, PRESERVED, REPLACED } from './prepare.mjs';
import { assertUnsignedCandidate, assertLiveS12, assertNewOutput, assertPublicationTarget, assertProductionKey, signDocuments, signS13 } from './sign.mjs';

const now = '2026-10-06T16:10:00Z';
const plan = await createPlan({ now });
const temp = await mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-s13-ephemeral-test-'));
after(async () => { await rm(temp, { recursive: true }); });
let serial = 0;
const stage = async files => { const path = resolve(temp, `stage-${++serial}`); await writeNewTree(path, files); return path; };
const options = { now, platform: 'android', clientVersion: 66, trustedKeyId: KEY_ID, minimumSequence: 13, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES };
// TEST ONLY: never write private key bytes. Re-sign a temporary copy of the entire
// graph under an in-memory ephemeral key. Production trust/payloads are untouched.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ephemeral = new Map(plan.files); ephemeral.delete('signing-request.json');
const signPaths = new Map(plan.request.documents_to_sign.map(x => [x.path, x.signature_path]));
for (const path of [...ephemeral.keys()]) if (path.endsWith('.sig')) { signPaths.set(path.replace(/\.sig$/u, '.json'), path); ephemeral.delete(path); }
ephemeral.set('trusted-public-key.pem', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
const testSigned = signDocuments(ephemeral, [...signPaths].map(([path, signature_path]) => ({ ...record(path, ephemeral.get(path)), signature_path })), privateKey);
const signedStage = await stage(testSigned);

test('01 exact reproducible approved candidate and frozen inputs, no new production signature', async () => {
  await assertUnsignedCandidate(resolve(HERE, 'unsigned-s13'), plan);
  const second = await createPlan({ now });
  assert.deepEqual(second.files, plan.files); assert.deepEqual((await approvedInputs()).protected_inputs, plan.request.protected_inputs);
  for (const x of plan.request.documents_to_sign) assert.equal(plan.files.has(x.signature_path), false);
  assert.equal(plan.request.documents_to_sign.length, 5); assert.equal(plan.request.publication_allowlist.length, 15);
  assert.equal(plan.files.size, 59); assert.equal(testSigned.size, 63);
  assert.deepEqual(plan.set.min_clients, { android: 66, ios: '0.1.14' });
  const descriptor = nativeDescriptor(plan);
  assert.deepEqual(Object.keys(descriptor), ['key_id', 'trusted_pem_sha256', 'accepted_at', 'old', 'candidate']);
  assert.deepEqual([descriptor.old.sequence, descriptor.old.article_count, descriptor.old.article_links, descriptor.old.modules.length], [12, 62, 11, 7]);
  assert.deepEqual([descriptor.candidate.sequence, descriptor.candidate.article_count, descriptor.candidate.article_links, descriptor.candidate.modules.length], [13, 104, 53, 7]);
  assert.equal(descriptor.candidate.index_sha256, plan.report.index_sha256);
});

test('02 exact62 preserved plus42 approved original bilingual summaries, rights/provenance unchanged', () => {
  const { saints, catalog, browser } = plan.payloads, draft = plan.approved.draft;
  assert.deepEqual(saints.articles, draft.combined.saints.articles); assert.equal(saints.articles.length, 104);
  assert.deepEqual(saints.articles.slice(0, 62), draft.beforeSaints.articles);
  for (const a of saints.articles.slice(62)) {
    const c = a.content['sr-Cyrl'], l = a.content['sr-Latn'];
    assert.deepEqual(l, { title: toLatin(c.title), intro: toLatin(c.intro), body: c.body.map(toLatin), takeaway: toLatin(c.takeaway) });
    for (const content of [c, l]) { const count = articleWordCount(content); assert.ok(count >= 100 && count <= 200); assert.ok(content.takeaway); }
  }
  assert.deepEqual(saints.sources, draft.combined.saints.sources);
  assert.deepEqual(saints.days, draft.combined.saints.days);
  assert.equal(saints.days.slice(62).length, 42);
  for (let n = 0; n < 42; n++) assert.equal(saints.days[62 + n].date, new Date(Date.UTC(2026, 10, 20 + n)).toISOString().slice(0, 10));
  assert.equal(saints.days[62].date, '2026-11-20'); assert.equal(saints.days.at(-1).date, '2026-12-31');
  for (const key of ['sources', 'subjects', 'observances', 'occurrences', 'article_links']) {
    assert.deepEqual(catalog[key], draft.combined.catalog[key].map((row, n) => n < draft.beforeCatalog[key].length ? row : { ...row, review_status: 'reviewed' }));
  }
  for (const key of ['archive_bindings', 'archive_days', 'feast_memberships']) assert.deepEqual(browser[key], draft.beforeBrowser[key]);
  assert.deepEqual(catalog.calendar_bindings, draft.beforeCatalog.calendar_bindings);
  assert.equal(plan.report.packages_A_B_included, false); assert.equal(plan.report.test_fixture_reused, false);
});

test('03 exactly four unchanged modules and authenticated S12 archive retained; correct new versions/dependencies', async () => {
  assert.deepEqual(plan.set.modules.map(x => x.module_id), [...PRESERVED, ...REPLACED]);
  for (const id of PRESERVED) assert.deepEqual(plan.set.modules.find(x => x.module_id === id), plan.base.set.modules.find(x => x.module_id === id));
  for (const [path, bytes] of plan.base.files) assert.ok(plan.files.get(path)?.equals(bytes), path);
  assert.deepEqual(await loadS12({ now }), plan.base);
  assert.equal(plan.base.index.expires_at, parse(plan.files.get('index.json')).expires_at);
  assert.equal(parse(plan.files.get('index.json')).issued_at, PREPARED_AT);
  for (const [id, revision] of [['saints-v1', 5], ['liturgical-catalog-v1', 8], ['calendar-browser-v1', 4]]) {
    const item = plan.set.modules.find(x => x.module_id === id), manifest = parse(plan.files.get(item.manifest_path));
    assert.equal(item.version, '2026.10.6'); assert.equal(manifest.revision, revision);
  }
  const catalog = plan.set.modules.find(x => x.module_id === 'liturgical-catalog-v1');
  assert.deepEqual(parse(plan.files.get(catalog.manifest_path)).dependencies, profile.catalog.catalogDependencies(plan.payloads.catalog));
});

test('04 explicit KS01 domain profile and real contexts, default historical parser remains strict', () => {
  assert.equal(historicalSaints(json(plan.payloads.saints)).valid, false);
  assert.equal(profile.saints.parseSaintsPayload(json(plan.payloads.saints)).valid, true);
  assert.deepEqual(preflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads: plan.payloads, now }), plan.report.preflight);
  assert.equal(plan.report.preflight.runtime_authenticated, false);
  for (const name of ['saints', 'catalog', 'browser']) {
    const payloads = structuredClone(plan.payloads); payloads[name].review_status = name === 'saints' ? 'draft' : 'pending';
    assert.throws(() => preflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads, now }));
  }
  const stale = structuredClone(plan.payloads); stale.browser.catalog_binding.sha256 = '0'.repeat(64);
  assert.throws(() => preflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads: stale, now }), /binding/u);
  const broken = structuredClone(plan.payloads); broken.catalog.article_bindings[0].sha256 = 'f'.repeat(64);
  assert.throws(() => preflight({ files: plan.files, set: plan.set, indexBytes: plan.files.get('index.json'), payloads: broken, now }), /binding/u);
});

test('05 isolated ephemeral RSA-PSS graph passes24 actual transport profiles; S12 predecessor retained', async () => {
  for (const [platform, clientVersion] of [['android', 66], ['ios', '0.1.14']]) for (const profile of CALENDAR_BROWSER_PROFILES) {
    const result = await validateRelease(signedStage, { ...options, platform, clientVersion, clientCapabilities: profile.capabilities });
    assert.equal(result.releaseSetId, RELEASE_ID); assert.equal(result.sequence, SEQUENCE);
    assert.equal(result.verifiedModules, 7); assert.equal(result.modules, profile.modules); assert.deepEqual(result.skippedOptionalModules, profile.skipped);
  }
  const old = await validateRelease(signedStage, { ...options, minimumSequence: 12, indexPath: `${S12_ARCHIVE}/index.json`, indexSignaturePath: `${S12_ARCHIVE}/index.sig` });
  assert.equal(old.sequence, 12); assert.equal(old.verifiedModules, 7);
  for (const item of plan.request.documents_to_sign) assert.equal(verify('sha256', testSigned.get(item.path), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(testSigned.get(item.signature_path).toString().trim(), 'base64')), true);
  assert.throws(() => assertProductionKey(privateKey, plan.files.get('trusted-public-key.pem')), /Existing production signing key/u);
});

test('06 old clients reject whole release; replay, expiry and signature corruption fail closed', async () => {
  for (const [platform, clientVersion] of [['android', 65], ['ios', '0.1.13']]) await assert.rejects(validateRelease(signedStage, { ...options, platform, clientVersion }), /CLIENT_VERSION/u);
  await assert.rejects(validateRelease(signedStage, { ...options, minimumSequence: 14 }), /REPLAY/u);
  await assert.rejects(validateRelease(signedStage, { ...options, now: plan.base.index.expires_at }), /TIME/u);
  const bad = new Map(testSigned); const sig = Buffer.from(bad.get('index.sig')); sig[0] = sig[0] === 65 ? 66 : 65; bad.set('index.sig', sig);
  await assert.rejects(validateRelease(await stage(bad), options), /SIGNATURE/u);
  const wrongPayload = new Map(testSigned), entry = plan.set.modules.find(x => x.module_id === 'saints-v1');
  const path = `${dirname(entry.manifest_path)}/data/saints-v1.json`; const bytes = Buffer.from(wrongPayload.get(path)); bytes[10] ^= 1; wrongPayload.set(path, bytes);
  await assert.rejects(validateRelease(await stage(wrongPayload), options), /HASH/u);
});

test('07 exact unsigned file set, byte identity and pre-key approval/GO/key-location guards', async () => {
  const extra = new Map(plan.files); extra.set('unapproved.json', json({ added: true }));
  await assert.rejects(assertUnsignedCandidate(await stage(extra), plan), /Exact unsigned/u);
  const tamper = new Map(plan.files); tamper.set('index.json', json({ altered: true }));
  const tamperPath = await stage(tamper);
  await assert.rejects(assertUnsignedCandidate(tamperPath, plan), /Unsigned approved-plan mismatch/u);
  await assert.rejects(signS13({}), /coordinator signing GO/u);
  await assert.rejects(signS13({ coordinatorGo: true, candidate: resolve(HERE, 'unsigned-s13'), out: resolve(temp, 'out'), privateKeyPath: resolve(ROOT, 'never-read-private.pem') }), /Private key must stay outside/u);
  await assert.rejects(signS13({ coordinatorGo: true, candidate: tamperPath, out: resolve(temp, 'out'), privateKeyPath: resolve(temp, 'never-created-private.pem') }), /Unsigned approved-plan mismatch/u);
  assert.throws(() => signDocuments(plan.files, [{ ...plan.request.documents_to_sign[0], sha256: '0'.repeat(64) }], privateKey), /Exact document before signing/u);
});

test('08 source CAS, publication allowlist/immutable conflicts and safe immutable outputs', async () => {
  await assertLiveS12(BASE, plan);
  const live = new Map(plan.base.files); live.set('index.json', live.get(`${S12_ARCHIVE}/index.json`)); live.set('index.sig', live.get(`${S12_ARCHIVE}/index.sig`));
  live.delete(`${S12_ARCHIVE}/index.json`); live.delete(`${S12_ARCHIVE}/index.sig`);
  const target = await stage(live);
  const result = await assertPublicationTarget(target, plan, testSigned, PUBLIC_COMMIT); assert.equal(result.allowlist.length, 15);
  await assert.rejects(assertPublicationTarget(target, plan, testSigned, '0'.repeat(40)), /HEAD advanced/u);
  const advanced = new Map(live); advanced.set('index.json', plan.files.get('index.json'));
  await assert.rejects(assertPublicationTarget(await stage(advanced), plan, testSigned, PUBLIC_COMMIT), /S12 source advanced/u);
  const conflict = new Map(live), immutable = plan.request.documents_to_sign[0].path; conflict.set(immutable, Buffer.from('conflict\n'));
  await assert.rejects(assertPublicationTarget(await stage(conflict), plan, testSigned, PUBLIC_COMMIT), /Immutable publication path conflict/u);
  await assert.rejects(assertNewOutput(resolve(BASE, 'never-created'), { sourceDirectory: BASE, candidate: HERE }), /disjoint/u);
  await assert.rejects(assertNewOutput(signedStage, { sourceDirectory: BASE, candidate: HERE }), /New immutable/u);
  const link = resolve(temp, 'symlink'); await symlink(signedStage, link);
  await assert.rejects(assertNewOutput(link, { sourceDirectory: BASE, candidate: HERE }), /[Ss]ymlink/u);
  await assert.rejects(assertUnsignedCandidate(link, plan), /[Ss]ymlink/u);
});

test('09 all frozen pending, approval and production inputs unchanged after preparation/tests', async () => {
  assert.deepEqual((await approvedInputs()).protected_inputs, plan.request.protected_inputs);
  for (const item of plan.base.observation.files) {
    const bytes = await readRefreshInput(resolve(BASE, item.path)); assert.equal(sha256(bytes), item.sha256);
  }
  assert.equal(parse(await readRefreshInput(resolve(ROOT, plan.approved.owner.resolves_question_in))).answer, null);
  assert.equal(plan.approved.draft.combined.saints.review_status, 'draft');
  assert.equal(plan.approved.draft.combined.catalog.review_status, 'pending');
});
