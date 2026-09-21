import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, BASE, json, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { buildSaintsCompletion, COMPLETION_APPROVAL_PATH, COMPLETION_APPROVAL_SHA256, COMPLETION_INPUTS } from '../scripts/export-saints-completion-v1.mjs';
import { createSaintsCompletionReleasePlan, loadCompletionS8Base, completionCompatibility, COMPLETION_PROFILES, COMPLETION_RELEASE_ID, S8_INDEX_SHA256, S8_RELEASE_SHA256, S8_ARCHIVE, assertNoSymlinkPath } from '../scripts/prepare-saints-completion-release-v2.mjs';
import { signSaintsCompletionRelease, installSaintsCompletionSignedRelease } from '../scripts/sign-saints-completion-release-v2.mjs';
import { parseSaintsPayload, evaluateSaintsDay, SAINTS_MODULE, articleWordCount, toLatin } from '../scripts/validate-saints-v1.mjs';
import { parseManuscript } from '../scripts/prepare-saints-completion-draft.mjs';
import { catalogPreflight } from '../scripts/prepare-liturgical-catalog-release-v2.mjs';
import { searchCatalog } from '../scripts/validate-liturgical-catalog-v1.mjs';
import { COMPLETION_PUBLIC_CHANNEL } from '../scripts/verify-saints-completion-public-v2.mjs';

const now = '2026-09-22T00:00:00Z';
const saintsHash = '5551b12abc73777ee02bc3c150f52a3375a1101c548be11de50e78196e0e0000';
const catalogHash = '13113be5f9bd3aeebc349cb5a89fee88439f7da57e9db9f6d9f1877e3da89774';
const approvedIds = [
  'greatmartyr-eustathius', 'apostle-quadratus', 'hieromartyr-phocas-sinope',
  'conception-john-forerunner', 'protomartyr-thecla', 'euphrosyne-alexandria',
  'john-theologian-repose', 'callistratus-companions', 'chariton-confessor',
  'cyriacus-anchorite-miholjdan', 'gregory-enlightener-armenia', 'protection-theotokos',
  'cyprian-antioch-justina', 'dionysius-areopagite', 'hierotheus-athens',
  'martyr-charitina-amisos', 'apostle-thomas', 'sergius-bacchus'
];
let pendingPlan;
const plan = () => pendingPlan ??= createSaintsCompletionReleasePlan({ now });
const temporary = async label => mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-s9-' + label + '-'));

async function inputs() {
  const result = {};
  for (const [key, record] of Object.entries(COMPLETION_INPUTS)) {
    const bytes = await readFile(resolve(ROOT, record.path));
    assert.equal(sha256(bytes), record.sha256, 'Pinned test input: ' + key);
    result[key] = key === 'manuscript' ? bytes.toString('utf8') : JSON.parse(bytes);
  }
  return result;
}

async function copiedInputs(destination) {
  const files = new Map();
  for (const record of Object.values(COMPLETION_INPUTS))
    files.set(record.path, await readFile(resolve(ROOT, record.path)));
  files.set(COMPLETION_APPROVAL_PATH, await readFile(resolve(ROOT, COMPLETION_APPROVAL_PATH)));
  await writeNewTree(destination, files);
}

test('S9 exact owner approval covers only eighteen presented texts on both platforms, not fabricated rights clearance', async () => {
  const result = await buildSaintsCompletion(), approval = result.approval;
  assert.equal(sha256(result.approvalBytes), COMPLETION_APPROVAL_SHA256);
  assert.equal(approval.statement, 'odobravam dopunu za zajedničku objavu na iOS-u i Androidu');
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.equal(approval.manuscript.sha256, 'c7d7e8ea931ae9f88fed2e7c3678a6f895028c08dff72110dc55b08ddbb06609');
  assert.deepEqual(approval.new_article_ids, approvedIds);
  assert.deepEqual(approval.source_inputs, COMPLETION_INPUTS);
  assert.equal(approval.scope.new_articles, 18);
  assert.equal(approval.scope.previous_articles_preserved, 14);
  assert.equal(approval.scope.total_articles, 32); assert.equal(approval.scope.total_days, 32);
  assert.equal(approval.scope.new_catalog_article_links, 0);
  assert.equal(approval.scope.occurrences_2027, 0);
  assert.equal(approval.rights_basis.original_statement, 'može prava racunaj da imamo');
  for (const field of ['independently_verified', 'public_license_assigned', 'source_permissions_independently_verified'])
    assert.equal(approval.rights_basis[field], false);
  assert.equal(approval.clerical_review, null);
  assert.equal(approval.independent_legal_verification, false);
});

test('saints r3 is deterministic, preserves all fourteen approved articles/days/sources and adds exactly eighteen master texts', async () => {
  const input = await inputs(), first = await buildSaintsCompletion(), second = await buildSaintsCompletion();
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(sha256(first.bytes), saintsHash); assert.equal(first.bytes.length, 138927);
  assert.equal(parseSaintsPayload(first.bytes).valid, true);
  assert.equal(first.payload.version, '2026.9.21'); assert.equal(first.payload.revision, 3);
  assert.equal(first.payload.review_status, 'approved');
  assert.equal(first.payload.articles.length, 32); assert.equal(first.payload.days.length, 32);
  assert.deepEqual(first.payload.articles.slice(0, 14), input.previous.articles);
  assert.deepEqual(first.payload.days.slice(0, 14), input.previous.days);
  assert.deepEqual(first.payload.sources.slice(0, input.previous.sources.length), input.previous.sources);
  assert.deepEqual(first.payload.calendar_binding, input.previous.calendar_binding);
  const added = first.payload.articles.slice(14);
  assert.deepEqual(added.map(article => article.id), approvedIds);
  assert.deepEqual(first.payload.articles, input.draft.articles);
  assert.deepEqual(first.payload.days, input.draft.days);
  for (const article of added) {
    assert.deepEqual(article.content, parseManuscript(input.manuscript, article.id));
    const cyrl = article.content['sr-Cyrl'], latn = article.content['sr-Latn'];
    for (const field of ['title', 'intro', 'takeaway']) assert.equal(latn[field], toLatin(cyrl[field]));
    assert.deepEqual(latn.body, cyrl.body.map(toLatin));
    assert.equal(articleWordCount(cyrl), articleWordCount(latn));
    assert.ok(articleWordCount(cyrl) >= 100 && articleWordCount(cyrl) <= 200);
  }
  assert.equal(first.payload.authorship.clerical_review, null);
});

test('all thirty-two civil/Julian days are eligible in both scripts; Oct21 and 2027 remain uncovered', async () => {
  const input = await inputs(), result = await buildSaintsCompletion();
  const context = { contentAuthenticated: true, calendarAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: '2026.9.21', revision: 3 },
    calendarContext: { ...result.payload.calendar_binding, days: input.calendar.days } };
  for (const [index, day] of result.payload.days.entries()) {
    assert.equal(day.date, new Date(Date.UTC(2026, 8, 19 + index)).toISOString().slice(0, 10));
    assert.equal(day.julian_date, new Date(Date.UTC(2026, 8, 6 + index)).toISOString().slice(0, 10));
    const actual = input.calendar.days.find(item => item.date === day.date);
    assert.equal(day.calendar_title['sr-Cyrl'], actual.commemoration.title_cyrl);
    assert.equal(day.calendar_title['sr-Latn'], toLatin(actual.commemoration.title_cyrl));
    assert.deepEqual(day.calendar_source_ids, actual.commemoration.source_ids);
    assert.equal(day.complete_saint_list, false);
    for (const locale of ['sr-Cyrl', 'sr-Latn']) {
      assert.equal(evaluateSaintsDay(result.payload, { ...context, date: day.date, locale }).eligible, true);
      for (const id of day.article_ids)
        assert.ok(result.payload.articles.find(article => article.id === id).content[locale].body.length >= 2);
    }
  }
  assert.deepEqual(result.payload.days.slice(14).map(day => day.article_ids[0]), approvedIds);
  for (const date of ['2026-10-21', '2027-10-03'])
    assert.equal(evaluateSaintsDay(result.payload, { ...context, date }).reason, 'uncovered_date');
  assert.equal(evaluateSaintsDay(result.payload, { ...context, date: '2026-10-12',
    calendarContext: { ...context.calendarContext, revision: 3 } }).reason, 'calendar_mismatch');
});

test('October4 preserves distinct Quadratus article and Cross leavetaking note without introducing an article link', async () => {
  const { payload } = await buildSaintsCompletion();
  const day = payload.days.find(day => day.date === '2026-10-04');
  assert.deepEqual(day.article_ids, ['apostle-quadratus']);
  assert.deepEqual(day.calendar_notes, [{ kind: 'leavetaking',
    label: { 'sr-Cyrl': 'Оданије Воздвижења', 'sr-Latn': 'Odanije Vozdviženja' },
    related_article_id: 'exaltation-cross', source_ids: ['eparhija-month-10'] }]);
  assert.equal(payload.articles.find(article => article.id === 'apostle-quadratus').type, 'saint');
  assert.equal(payload.articles.find(article => article.id === 'exaltation-cross').type, 'feast');
  assert.equal(Object.hasOwn(payload, 'article_links'), false);
});

test('catalog r4 changes only permitted approval/binding fields; all entities, two links, rights and dates remain identical', async () => {
  const input = await inputs(), result = await buildSaintsCompletion();
  assert.equal(sha256(result.catalogBytes), catalogHash); assert.equal(result.catalogBytes.length, 39773);
  const expected = structuredClone(input.catalog);
  expected.revision = 4; expected.approval_id = 'saints-completion-2026-09-21-owner-r3';
  Object.assign(expected.article_bindings[0], { version: '2026.9.21', revision: 3, sha256: saintsHash });
  assert.deepEqual(result.catalog, expected);
  assert.equal(result.catalog.version, '2026.9.20');
  assert.deepEqual(result.catalog.article_links, input.catalog.article_links);
  assert.equal(result.catalog.article_links.length, 2);
  assert.equal(result.catalog.subjects.length, 12); assert.equal(result.catalog.observances.length, 15);
  assert.equal(result.catalog.occurrences.length, 13);
  assert.deepEqual(result.catalog.coverage, input.catalog.coverage);
  assert.deepEqual(result.catalog.sources.map(source => source.rights_status), Array(17).fill('pending'));
  assert.deepEqual(result.approval.catalog_continuation.allowed_changed_fields,
    ['revision', 'approval_id', 'article_bindings/0/version', 'article_bindings/0/revision', 'article_bindings/0/sha256']);
  // Saints version was already 2026.9.21 in S8: the permitted version leaf
  // legitimately remains equal; do not manufacture a fifth actual difference.
  assert.equal(result.catalog.article_bindings[0].version, input.catalog.article_bindings[0].version);
});

test('unsigned S9 plan preserves authenticated S8 bytes and four base modules, min clients, key and expiry', async () => {
  const liveBefore = sha256(await readFile(resolve(BASE, 'index.json')));
  const first = await plan(), second = await createSaintsCompletionReleasePlan({ now }), base = await loadCompletionS8Base({ now });
  assert.deepEqual(first.files, second.files); assert.deepEqual(first.request, second.request);
  for (const [path, bytes] of base.files) assert.deepEqual(first.files.get(path), bytes, path);
  assert.equal(sha256(first.files.get(S8_ARCHIVE + '/index.json')), S8_INDEX_SHA256);
  assert.equal(sha256(first.files.get(base.index.channels.production.path)), S8_RELEASE_SHA256);
  assert.deepEqual(first.set.modules.slice(0, 4), base.set.modules.slice(0, 4));
  assert.equal(first.set.modules.length, 6); assert.equal(first.set.sequence, 9);
  assert.equal(first.set.release_set_id, COMPLETION_RELEASE_ID);
  assert.deepEqual(first.set.min_clients, { android: 35, ios: '0.1.0' });
  const index = JSON.parse(first.files.get('index.json'));
  assert.equal(index.issued_at, first.completed.approval.recorded_at);
  assert.equal(index.expires_at, '2027-02-01T00:00:00Z');
  assert.equal(index.key_id, base.index.key_id);
  assert.equal(first.request.documents_to_sign.length, 4);
  assert.equal(first.request.signing_and_activation_require_separate_coordinator_GO, true);
  for (const item of first.request.documents_to_sign) {
    assert.equal(first.files.has(item.signature_path), false);
    assert.equal(sha256(first.files.get(item.path)), item.sha256);
    assert.equal(first.files.get(item.path).length, item.bytes);
  }
  for (const item of first.request.all_candidate_files) {
    assert.equal(sha256(first.files.get(item.path)), item.sha256);
    assert.equal(first.files.get(item.path).length, item.bytes);
  }
  assert.equal(first.request.all_candidate_files.length, first.files.size - 1);
  assert.ok([...first.files.keys()].every(path => !path.includes('m0v2-s5') && !path.includes('organizations-v1-2026.9.19')));
  assert.equal(sha256(await readFile(resolve(BASE, 'index.json'))), liveBefore);
});

test('S9 uses existing M0 schemas, exactly one payload per new manifest, and evidence only outside manifests', async () => {
  const { files, set } = await plan(), ajv = new Ajv2020({ strict: true }); addFormats(ajv);
  for (const [path, schema] of [['index.json', 'index.schema.json'],
    [JSON.parse(files.get('index.json')).channels.production.path, 'release-set.schema.json']]) {
    const validate = ajv.compile(JSON.parse(await readFile(resolve(ROOT, 'schemas/v2', schema))));
    assert.equal(validate(JSON.parse(files.get(path))), true, JSON.stringify(validate.errors));
  }
  const validate = ajv.compile(JSON.parse(await readFile(resolve(ROOT, 'schemas/v2/module-manifest.schema.json'))));
  for (const entry of set.modules.slice(4)) {
    const manifest = JSON.parse(files.get(entry.manifest_path));
    assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
    assert.equal(entry.required, false); assert.equal(entry.module_type, 'library');
    assert.equal(manifest.files.length, 1); assert.equal(manifest.files[0].path, 'data/' + entry.module_id + '.json');
    assert.equal(manifest.files[0].content_type, 'application/json');
    assert.equal(manifest.files[0].media_type, undefined);
    const bytes = files.get(dirname(entry.manifest_path) + '/' + manifest.files[0].path);
    assert.equal(bytes.length, manifest.files[0].bytes); assert.equal(sha256(bytes), manifest.files[0].sha256);
    assert.equal(sha256(files.get(entry.manifest_path)), entry.manifest_sha256);
  }
  assert.deepEqual(JSON.parse(files.get(set.modules[5].manifest_path)).dependencies,
    [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }, { module_id: 'saints-v1', version: '2026.9.21' }]);
  const prefix = 'releases/' + COMPLETION_RELEASE_ID + '/evidence/';
  assert.equal(sha256(files.get(prefix + 'owner-publication-approval.json')), COMPLETION_APPROVAL_SHA256);
  for (const key of ['manuscript', 'metadata', 'sources', 'coverage', 'draft'])
    assert.equal(sha256(files.get(prefix + (key === 'manuscript' ? 'TEKSTOVI.md' : key + '.json'))), COMPLETION_INPUTS[key].sha256);
});

test('four capability profiles coexist and missing optional dependencies fail only when their consumer is active', async () => {
  const { files, set } = await plan();
  for (const profile of COMPLETION_PROFILES)
    assert.deepEqual(completionCompatibility(files, set, profile.capabilities), { modules: profile.modules, skipped: profile.skipped });
  const missing = structuredClone(set); missing.modules = missing.modules.filter(entry => entry.module_id !== 'saints-v1');
  assert.throws(() => completionCompatibility(files, missing, COMPLETION_PROFILES[0].capabilities), /Missing or mismatched dependency/);
  assert.deepEqual(completionCompatibility(files, missing, COMPLETION_PROFILES[2].capabilities),
    { modules: 4, skipped: ['liturgical-catalog-v1'] });
});

test('both old catalog article links resolve against r3; stale saints hashes return no articles', async () => {
  const { files, set, completed } = await plan();
  const context = catalogPreflight(completed.catalog, files, set, files.get('index.json'));
  const input = { query: 'Мала Госпојина', locale: 'sr-Cyrl', year: 2026, calendar_profile_id: 'spc-rs-ba-julian-v1' };
  assert.deepEqual(searchCatalog(completed.catalog, context, input).results[0].article_ids, ['nativity-theotokos']);
  // catalogPreflight itself asserts both published links, not just the search example.
  assert.equal(completed.catalog.article_links.length, 2);
  const stale = structuredClone(context); stale.articleContexts[0].sha256 = 'e85c725d109a322c109e8455bf94c6ddd28c113e67cd77dde9f34642d3559a21';
  assert.deepEqual(searchCatalog(completed.catalog, stale, input).results[0].article_ids, []);
  const next = searchCatalog(completed.catalog, context, { ...input, year: 2027 }).results[0];
  assert.deepEqual(next.dates, []); assert.deepEqual(next.article_ids, ['nativity-theotokos']);
  assert.equal(COMPLETION_PUBLIC_CHANNEL, 'https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/');
});

test('mutated approval and source manuscripts cannot be promoted from a copied input root', async () => {
  const temp = await temporary('approval');
  try {
    const copied = resolve(temp, 'inputs'); await copiedInputs(copied);
    const approvalPath = resolve(copied, COMPLETION_APPROVAL_PATH);
    const original = await readFile(approvalPath), changed = JSON.parse(original);
    changed.statement = 'not approved';
    await writeFile(approvalPath, json(changed));
    await assert.rejects(buildSaintsCompletion(copied), /approval/i);
    await writeFile(approvalPath, original);
    await writeFile(resolve(copied, COMPLETION_INPUTS.manuscript.path), 'unapproved rewrite\n');
    await assert.rejects(buildSaintsCompletion(copied), /manuscript|input/i);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('source discovery hash is checked before candidate content is built; symlink source paths are rejected', async () => {
  const temp = await temporary('source');
  try {
    const copied = resolve(temp, 'source');
    await writeNewTree(copied, new Map([['index.json', Buffer.from('{}\n')]]));
    await assert.rejects(createSaintsCompletionReleasePlan({ sourceDirectory: copied, now }), /Pinned S8 source index/);
    const linked = resolve(temp, 'linked'); await symlink(BASE, linked, 'dir');
    await assert.rejects(loadCompletionS8Base({ sourceDirectory: linked, now }), /Symlink/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('signing and installation require separate coordinator GO before file or key access', async () => {
  await assert.rejects(signSaintsCompletionRelease({}), /signing GO required/);
  await assert.rejects(installSaintsCompletionSignedRelease({}), /activation GO required/);
});

test('mutated candidate payload and unplanned files are rejected before nonexistent private key access', async () => {
  const liveBefore = sha256(await readFile(resolve(BASE, 'index.json')));
  const { files, set } = await plan(), temp = await temporary('candidate');
  try {
    const candidate = resolve(temp, 'candidate'), out = resolve(temp, 'never-created'), key = resolve(temp, 'nonexistent-key');
    await writeNewTree(candidate, files);
    const payloadPath = dirname(set.modules[4].manifest_path) + '/data/saints-v1.json';
    await writeFile(resolve(candidate, payloadPath), '{}\n');
    await assert.rejects(signSaintsCompletionRelease({ candidate, out, privateKeyPath: key, coordinatorGo: true, now }),
      /Candidate mismatch: .*saints-v1\.json/);
    await writeFile(resolve(candidate, payloadPath), files.get(payloadPath));
    await writeFile(resolve(candidate, 'unapproved-extra.txt'), 'not planned');
    await assert.rejects(signSaintsCompletionRelease({ candidate, out, privateKeyPath: key, coordinatorGo: true, now }), /Candidate file set/);
    await assert.rejects(lstat(out), { code: 'ENOENT' }); await assert.rejects(lstat(key), { code: 'ENOENT' });
    assert.equal(sha256(await readFile(resolve(BASE, 'index.json'))), liveBefore);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('existing output and symlink ancestor are refused before nonexistent private key access', async () => {
  const { files } = await plan(), temp = await temporary('paths');
  try {
    const candidate = resolve(temp, 'candidate'), key = resolve(temp, 'nonexistent-key');
    await writeNewTree(candidate, files);
    await assert.rejects(signSaintsCompletionRelease({ candidate, out: candidate, privateKeyPath: key, coordinatorGo: true, now }), /Output exists/);
    const linked = resolve(temp, 'linked'); await symlink(candidate, linked, 'dir');
    await assert.rejects(assertNoSymlinkPath(resolve(linked, 'new', 'child'), { allowMissing: true }), /Symlink/);
    await assert.rejects(signSaintsCompletionRelease({ candidate, out: resolve(linked, 'out'), privateKeyPath: key, coordinatorGo: true, now }), /Symlink/);
    await assert.rejects(lstat(key), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('valid S8 archive does not permit signing against advanced live discovery or changed live signature', async () => {
  const { files } = await plan(), temp = await temporary('stale-live');
  try {
    const candidate = resolve(temp, 'candidate'), sourceDirectory = resolve(temp, 'source');
    const out = resolve(temp, 'never-created'), key = resolve(temp, 'nonexistent-key');
    await writeNewTree(candidate, files);
    const stale = new Map(files);
    // Valid archived S8 plus the unsigned S9 live index: the loader may inspect
    // history, but the signer must refuse before touching any key.
    stale.set('index.sig', files.get(S8_ARCHIVE + '/index.sig'));
    await writeNewTree(sourceDirectory, stale);
    await loadCompletionS8Base({ sourceDirectory, now });
    await assert.rejects(signSaintsCompletionRelease({ candidate, out, privateKeyPath: key, sourceDirectory, coordinatorGo: true, now }),
      /Signing source discovery advanced.*before key access/);
    await writeFile(resolve(sourceDirectory, 'index.json'), files.get(S8_ARCHIVE + '/index.json'));
    await writeFile(resolve(sourceDirectory, 'index.sig'), 'changed signature\n');
    await assert.rejects(signSaintsCompletionRelease({ candidate, out, privateKeyPath: key, sourceDirectory, coordinatorGo: true, now }),
      /Signing source discovery signature changed.*before key access/);
    await assert.rejects(lstat(out), { code: 'ENOENT' }); await assert.rejects(lstat(key), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
