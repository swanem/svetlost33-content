import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, BASE, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { buildSaintsExpansion, loadExpansionInputs, transformSaintsExpansion, EXPANSION_APPROVAL_SHA256, EXPANSION_ARTICLE_IDS } from '../scripts/export-saints-expansion-v1.mjs';
import { createSaintsExpansionReleasePlan, loadExpansionS7Base, expansionCompatibility, EXPANSION_PROFILES } from '../scripts/prepare-saints-expansion-release-v2.mjs';
import { signSaintsExpansionRelease, installSaintsExpansionSignedRelease } from '../scripts/sign-saints-expansion-release-v2.mjs';
import { parseSaintsPayload, evaluateSaintsDay, SAINTS_MODULE, articleWordCount, toLatin } from '../scripts/validate-saints-v1.mjs';
import { catalogPreflight } from '../scripts/prepare-liturgical-catalog-release-v2.mjs';
import { searchCatalog } from '../scripts/validate-liturgical-catalog-v1.mjs';

const now = '2026-09-20T21:00:00Z';
const saintsHash = 'e85c725d109a322c109e8455bf94c6ddd28c113e67cd77dde9f34642d3559a21';
const catalogHash = 'f202bff8a92f4d4f84a6c025ea67144bf61c2df3fe38030fc446de2116d82e8c';
let pendingPlan;
const plan = () => pendingPlan ??= createSaintsExpansionReleasePlan({ now });

test('S8 exact owner quote approves only the presented seven texts and records attestation without invented clearance', async () => {
  const result = await buildSaintsExpansion(), approval = result.approval;
  assert.equal(sha256(result.approvalBytes), EXPANSION_APPROVAL_SHA256);
  assert.equal(approval.statement, 'objavi sadržaj i nastavi');
  assert.equal(approval.manuscript.sha256, '0f912a46cff2f1558018d43d8e2c564d5b0d44e56fb7ab2eafd7971c1676d0ba');
  assert.deepEqual(approval.new_article_ids, EXPANSION_ARTICLE_IDS);
  assert.equal(approval.scope.remaining_18_unwritten_days_approved, false);
  assert.equal(approval.rights_basis.original_statement, 'može prava racunaj da imamo');
  assert.equal(approval.rights_basis.independently_verified, false);
  assert.equal(approval.rights_basis.public_license_assigned, false);
  assert.equal(approval.clerical_review, null);
});

test('saints r2 deterministically preserves seven old articles, days, notes, sources and adds only seven exact master texts', async () => {
  const inputs = await loadExpansionInputs(), first = await buildSaintsExpansion(), second = transformSaintsExpansion(inputs);
  assert.deepEqual(first.bytes, second.bytes); assert.equal(sha256(first.bytes), saintsHash); assert.equal(first.bytes.length, 60425);
  assert.equal(parseSaintsPayload(first.bytes).valid, true);
  assert.equal(first.payload.articles.length, 14); assert.equal(first.payload.days.length, 14);
  assert.deepEqual(first.payload.articles.slice(0, 7), inputs.previous.articles);
  assert.deepEqual(first.payload.days.slice(0, 7), inputs.previous.days);
  assert.deepEqual(first.payload.sources.slice(0, inputs.previous.sources.length), inputs.previous.sources);
  const added = first.payload.articles.slice(7);
  assert.deepEqual(added.map(a => a.id), EXPANSION_ARTICLE_IDS);
  assert.deepEqual(added.map(a => articleWordCount(a.content['sr-Cyrl'])), [131, 129, 138, 141, 133, 137, 141]);
  for (const article of added) {
    const c = article.content['sr-Cyrl'], l = article.content['sr-Latn'];
    assert.equal(l.title, toLatin(c.title)); assert.equal(l.intro, toLatin(c.intro));
    assert.deepEqual(l.body, c.body.map(toLatin)); assert.equal(l.takeaway, toLatin(c.takeaway));
    assert.equal(articleWordCount(c), articleWordCount(l));
  }
  assert.equal(first.payload.sources.find(s => s.id === 'oca-dorotheus').original_author, null);
  assert.equal(first.payload.sources.find(s => s.id === 'mcp-dedication').original_author, 'Протојереј Мирчета Шљиванчанин');
  assert.equal(first.payload.authorship.clerical_review, null);
});

test('all 14 days bind exact calendar title and Julian day; Oct3 and 2027 remain uncovered', async () => {
  const input = await loadExpansionInputs(), result = await buildSaintsExpansion();
  const context = { contentAuthenticated: true, calendarAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: '2026.9.21', revision: 2 },
    calendarContext: { ...result.payload.calendar_binding, days: input.calendar.days } };
  for (const [index, day] of result.payload.days.entries()) {
    assert.equal(day.date, new Date(Date.UTC(2026, 8, 19 + index)).toISOString().slice(0, 10));
    assert.equal(day.julian_date, new Date(Date.UTC(2026, 8, 6 + index)).toISOString().slice(0, 10));
    const actual = input.calendar.days.find(item => item.date === day.date);
    assert.equal(day.calendar_title['sr-Cyrl'], actual.commemoration.title_cyrl);
    assert.equal(day.complete_saint_list, false);
    assert.equal(evaluateSaintsDay(result.payload, { ...context, date: day.date }).eligible, true);
  }
  for (const date of ['2026-10-03', '2027-09-26']) assert.equal(evaluateSaintsDay(result.payload, { ...context, date }).reason, 'uncovered_date');
  assert.equal(evaluateSaintsDay(result.payload, { ...context, date: '2026-09-29', calendarContext: { ...context.calendarContext, revision: 3 } }).reason, 'calendar_mismatch');
});

test('catalog r3 changes exactly five binding/approval leaves, never entities, links, dates, rights or 2027 coverage', async () => {
  const inputs = await loadExpansionInputs(), result = await buildSaintsExpansion();
  assert.equal(sha256(result.catalogBytes), catalogHash); assert.equal(result.catalogBytes.length, 39772);
  const expected = structuredClone(inputs.catalog);
  expected.revision = 3; expected.approval_id = 'saints-expansion-2026-09-21-owner-r2';
  Object.assign(expected.article_bindings[0], { version: '2026.9.21', revision: 2, sha256: saintsHash });
  assert.deepEqual(result.catalog, expected);
  assert.deepEqual(result.catalog.article_links, inputs.catalog.article_links);
  assert.equal(result.catalog.subjects.length, 12); assert.equal(result.catalog.observances.length, 15);
  assert.equal(result.catalog.occurrences.length, 13); assert.equal(result.catalog.article_links.length, 2);
  assert.deepEqual(result.catalog.coverage, inputs.catalog.coverage);
  assert.deepEqual(result.catalog.sources.map(s => s.rights_status), Array(17).fill('pending'));
});

test('unsigned S8 plan preserves four active module entries and every historical S7 byte, without S5 or min-client changes', async () => {
  const liveBefore = sha256(await readFile(resolve(BASE, 'index.json')));
  const first = await plan(), second = await createSaintsExpansionReleasePlan({ now }), base = await loadExpansionS7Base({ now });
  assert.deepEqual(first.files, second.files); assert.deepEqual(first.request, second.request);
  for (const [path, bytes] of base.files) assert.deepEqual(first.files.get(path), bytes, path);
  assert.deepEqual(first.set.modules.slice(0, 4), base.set.modules.slice(0, 4));
  assert.equal(first.set.modules.length, 6); assert.equal(first.set.sequence, 8);
  assert.deepEqual(first.set.min_clients, { android: 35, ios: '0.1.0' });
  const index = JSON.parse(first.files.get('index.json'));
  assert.equal(index.issued_at, '2026-09-20T20:24:08Z'); assert.equal(index.expires_at, '2027-02-01T00:00:00Z');
  assert.equal(first.request.documents_to_sign.length, 4);
  assert.equal(first.request.signing_and_activation_require_separate_coordinator_GO, true);
  for (const item of first.request.documents_to_sign) {
    assert.equal(first.files.has(item.signature_path), false); assert.equal(sha256(first.files.get(item.path)), item.sha256);
  }
  assert.ok([...first.files.keys()].every(path => !path.includes('m0v2-s5') && !path.includes('organizations-v1-2026.9.19')));
  assert.equal(sha256(await readFile(resolve(BASE, 'index.json'))), liveBefore);
});

test('new manifests use existing M0 shape, exactly one JSON payload each and evidence outside manifests', async () => {
  const { files, set } = await plan(), ajv = new Ajv2020({ strict: true }); addFormats(ajv);
  for (const [path, schema] of [['index.json', 'index.schema.json'], [JSON.parse(files.get('index.json')).channels.production.path, 'release-set.schema.json']]) {
    const validate = ajv.compile(JSON.parse(await readFile(resolve(ROOT, 'schemas/v2', schema))));
    assert.equal(validate(JSON.parse(files.get(path))), true, JSON.stringify(validate.errors));
  }
  const validate = ajv.compile(JSON.parse(await readFile(resolve(ROOT, 'schemas/v2/module-manifest.schema.json'))));
  for (const entry of set.modules.slice(4)) {
    const manifest = JSON.parse(files.get(entry.manifest_path)); assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
    assert.equal(entry.required, false); assert.equal(entry.module_type, 'library'); assert.equal(manifest.files.length, 1);
    assert.equal(manifest.files[0].path, `data/${entry.module_id}.json`); assert.equal(manifest.files[0].content_type, 'application/json');
    assert.equal(manifest.files[0].media_type, undefined);
    const bytes = files.get(`${dirname(entry.manifest_path)}/${manifest.files[0].path}`);
    assert.equal(bytes.length, manifest.files[0].bytes); assert.equal(sha256(bytes), manifest.files[0].sha256);
  }
  const manifest = JSON.parse(files.get(set.modules[5].manifest_path));
  assert.deepEqual(manifest.dependencies, [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }, { module_id: 'saints-v1', version: '2026.9.21' }]);
});

test('four unsigned capability profiles coexist and unsupported optional dependencies are skipped, not silently repaired', async () => {
  const { files, set } = await plan();
  for (const profile of EXPANSION_PROFILES) assert.deepEqual(expansionCompatibility(files, set, profile.capabilities), { modules: profile.modules, skipped: profile.skipped });
  const missing = structuredClone(set); missing.modules = missing.modules.filter(entry => entry.module_id !== 'saints-v1');
  assert.throws(() => expansionCompatibility(files, missing, EXPANSION_PROFILES[0].capabilities), /Missing or mismatched dependency/);
  assert.deepEqual(expansionCompatibility(files, missing, EXPANSION_PROFILES[2].capabilities), { modules: 4, skipped: ['liturgical-catalog-v1'] });
});

test('new generation keeps both existing catalog article links resolvable; stale saints host returns no articles', async () => {
  const { files, set, expanded } = await plan();
  const context = catalogPreflight(expanded.catalog, files, set, files.get('index.json'));
  const input = { query: 'Мала Госпојина', locale: 'sr-Cyrl', year: 2026, calendar_profile_id: 'spc-rs-ba-julian-v1' };
  assert.deepEqual(searchCatalog(expanded.catalog, context, input).results[0].article_ids, ['nativity-theotokos']);
  const stale = structuredClone(context); stale.articleContexts[0].sha256 = 'ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000';
  assert.deepEqual(searchCatalog(expanded.catalog, stale, input).results[0].article_ids, []);
  const next = searchCatalog(expanded.catalog, context, { ...input, year: 2027 }).results[0];
  assert.deepEqual(next.dates, []); assert.deepEqual(next.article_ids, ['nativity-theotokos']);
});

test('signing and installation require separate coordinator GO before any files or keys are read', async () => {
  await assert.rejects(signSaintsExpansionRelease({}), /signing GO required/);
  await assert.rejects(installSaintsExpansionSignedRelease({}), /activation GO required/);
});

test('mutated unsigned candidate is rejected before nonexistent private key access; no output or production change', async () => {
  const liveBefore = sha256(await readFile(resolve(BASE, 'index.json')));
  const { files, set } = await plan(), temporary = await mkdtemp(resolve(tmpdir(), 'svetlost33-s8-guard-'));
  try {
    const candidate = resolve(temporary, 'candidate'), out = resolve(temporary, 'never-created'), key = resolve(temporary, 'nonexistent-key');
    await writeNewTree(candidate, files);
    await writeFile(resolve(candidate, dirname(set.modules[4].manifest_path), 'data/saints-v1.json'), '{}\n');
    await assert.rejects(signSaintsExpansionRelease({ candidate, out, privateKeyPath: key, coordinatorGo: true, now }), /Candidate mismatch: .*saints-v1\.json/);
    await assert.rejects(lstat(out), { code: 'ENOENT' }); await assert.rejects(lstat(key), { code: 'ENOENT' });
    assert.equal(sha256(await readFile(resolve(BASE, 'index.json'))), liveBefore);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
