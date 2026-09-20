import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { ROOT, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { createCatalogReleasePlan, loadCatalogS6Base, loadApprovedCatalog, transformApprovedCatalog,
  catalogPreflight } from '../scripts/prepare-liturgical-catalog-release-v2.mjs';
import { signCatalogRelease } from '../scripts/sign-liturgical-catalog-release-v2.mjs';
import { evaluateCatalog, resolveCatalogDay, searchCatalog } from '../scripts/validate-liturgical-catalog-v1.mjs';

const now = '2026-09-20T18:00:00Z';
const candidatePath = 'fixtures/liturgical-catalog-v1/catalog-candidate.json';
const approvalPath = 'approvals/liturgical-catalog-2026-09-20/owner-publication-approval.json';
const payloadPath = 'modules/liturgical-catalog-v1/2026.9.20-r2/data/liturgical-catalog-v1.json';
const candidateHash = '3722e9fbbf53bbd75b1a76289b59965f6ae929d693e0f700cdf1a6d6ff48015b';
const approvalHash = 'abc161c755997f3db2203d3687cd1aa6245715b766b665be94ed10d7398642e4';
const payloadHash = '18a581b5bb1a3c881d48a9af3fc3e05596d3528c82ba29bfe53cedd54ec7f910';
const releaseId = 'shared-liturgical-catalog-2026-09-20-m0v2-s7';
const approvalId = 'liturgical-catalog-2026-09-20-owner-r2';
const reviewCounts = { sources: 17, subjects: 12, observances: 15, occurrences: 13, article_links: 2 };
const preservedIds = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1', 'saints-v1'];
const dependencies = [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }, { module_id: 'saints-v1', version: '2026.9.19' }];
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
let planPromise;
const plan = () => planPromise ??= createCatalogReleasePlan({ now });
const documents = files => {
  const indexBytes = files.get('index.json'), index = JSON.parse(indexBytes);
  const set = JSON.parse(files.get(index.channels.production.path));
  const entry = set.modules.find(item => item.module_id === 'liturgical-catalog-v1');
  const manifest = JSON.parse(files.get(entry.manifest_path));
  const payload = JSON.parse(files.get(`${dirname(entry.manifest_path)}/data/liturgical-catalog-v1.json`));
  return { indexBytes, index, set, entry, manifest, payload };
};

// Compare leaves while separately requiring identical object/array structure.
function scalarChanges(before, after, path = []) {
  if (before !== null && typeof before === 'object') {
    assert.ok(after !== null && typeof after === 'object', JSON.stringify(path));
    assert.equal(Array.isArray(after), Array.isArray(before));
    assert.deepEqual(Object.keys(after), Object.keys(before), JSON.stringify(path));
    return Object.keys(before).flatMap(key => scalarChanges(before[key], after[key], [...path, key]));
  }
  return Object.is(before, after) ? [] : [{ path: path.join('/'), before, after }];
}

test('catalog r2 changes exactly the 62 approved scalar fields and never changes the frozen pending fixture', async () => {
  const frozenBytes = await readFile(resolve(ROOT, candidatePath));
  const approvedBytes = await readFile(resolve(ROOT, payloadPath));
  assert.equal(sha256(frozenBytes), candidateHash); assert.equal(frozenBytes.length, 39678);
  assert.equal(sha256(approvedBytes), payloadHash); assert.equal(approvedBytes.length, 39774);
  const frozen = JSON.parse(frozenBytes), approved = JSON.parse(approvedBytes), expected = structuredClone(frozen);
  assert.equal(frozen.version, '2026.9.20'); assert.equal(frozen.revision, 1);
  assert.equal(frozen.review_status, 'pending'); assert.equal(frozen.approval_id, null);
  expected.revision = 2; expected.review_status = 'approved'; expected.approval_id = approvalId;
  const allowed = ['revision', 'review_status', 'approval_id'];
  for (const [key, count] of Object.entries(reviewCounts)) {
    assert.equal(frozen[key].length, count);
    frozen[key].forEach((item, index) => {
      assert.equal(item.review_status, 'pending');
      expected[key][index].review_status = 'reviewed';
      allowed.push(`${key}/${index}/review_status`);
    });
  }
  assert.deepEqual(approved, expected);
  assert.deepEqual(approvedBytes, encode(expected));
  const changes = scalarChanges(frozen, approved);
  assert.equal(changes.length, 62);
  assert.deepEqual(changes.map(change => change.path).sort(), allowed.sort());
  assert.deepEqual(transformApprovedCatalog(frozen), expected);
  assert.deepEqual(encode(frozen), frozenBytes, 'Transformation is pure');
  assert.deepEqual(await readFile(resolve(ROOT, candidatePath)), frozenBytes);
  assert.deepEqual(approved.legacy_slava_links, frozen.legacy_slava_links);
  assert.deepEqual(approved.legacy_slava_links.map(item => item.review_status), Array(10).fill('pending'));
  assert.deepEqual(approved.sources.map(item => item.rights_status), Array(17).fill('pending'));
  assert.deepEqual(approved.sources.map(item => item.checked_on), [...Array(9).fill('2026-09-20'), ...Array(8).fill('2026-09-15')]);
  assert.deepEqual(approved.sources.map(item => item.original_author), Array(17).fill(null));
  assert.deepEqual(approved.day_reviews, []);
  assert.deepEqual(approved.coverage, frozen.coverage);
  assert.deepEqual(approved.coverage.map(item => [item.year, item.status, item.mapped_dates, item.occurrences, item.complete_saint_list]),
    [[2026, 'limited_catalog', 13, 13, false], [2027, 'unavailable', 0, 0, false]]);
  assert.equal(approved.coverage[1].calendar_binding_id, null);
});

test('catalog publication approval has the exact owner quote, frozen source hashes and bounded scope', async () => {
  const bytes = await readFile(resolve(ROOT, approvalPath)), approval = JSON.parse(bytes);
  assert.equal(sha256(bytes), approvalHash);
  assert.equal(approval.statement, 'Da, objavi i taj katalog');
  assert.equal(approval.approver_role, 'project_owner');
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.equal(approval.approval_id, approvalId);
  assert.equal(approval.source.commit, 'b755d06be30905d531c0e34477b50cd978607824');
  assert.equal(approval.source.candidate_path, candidatePath);
  assert.equal(approval.source.candidate_sha256, candidateHash);
  assert.equal(approval.source.candidate_unchanged, true);
  for (const name of ['contract', 'schema', 'source_review']) {
    assert.equal(sha256(await readFile(resolve(ROOT, approval.source[`${name}_path`]))), approval.source[`${name}_sha256`]);
  }
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.deepEqual(approval.scope, { subjects: 12, observances: 15, occurrences_2026: 13, article_links: 2,
    undated_observances: ['obs-stefan-decanski', 'obs-nektarios-aegina'], occurrences_2027: 0,
    complete_saint_list: false, legacy_slava_migration_authorized: false, new_religious_texts: false });
  assert.equal(approval.transformation.reviewed_record_count, 59);
  assert.equal(approval.transformation.total_changed_scalar_fields, 62);
  assert.equal(approval.clerical_review, null);
  assert.deepEqual(approval.payload, { path: payloadPath, bytes: 39774, sha256: payloadHash, version: '2026.9.20', revision: 2 });
  const loaded = await loadApprovedCatalog();
  assert.deepEqual(loaded.approvalBytes, bytes);
  assert.deepEqual(loaded.bytes, await readFile(resolve(ROOT, payloadPath)));
});

test('catalog unsigned plan is deterministic and preserves all five S6 entries, minimum clients and every source byte', async () => {
  const first = await plan(), second = await createCatalogReleasePlan({ now });
  assert.deepEqual(first.files, second.files); assert.deepEqual(first.request, second.request);
  const { index, set } = documents(first.files), base = await loadCatalogS6Base({ now });
  assert.equal(index.sequence, 7); assert.equal(set.sequence, 7); assert.equal(set.release_set_id, releaseId);
  assert.deepEqual(base.set.modules.map(item => item.module_id), preservedIds);
  assert.deepEqual(set.modules.slice(0, 5), base.set.modules); assert.equal(set.modules.length, 6);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  assert.deepEqual(set.min_clients, base.set.min_clients);
  assert.deepEqual(first.request.minimum_clients, base.set.min_clients);
  for (const [path, bytes] of base.files) assert.deepEqual(first.files.get(path), bytes, `Preserved S6 bytes: ${path}`);
  for (const entry of base.set.modules) {
    const manifestBytes = first.files.get(entry.manifest_path), manifest = JSON.parse(manifestBytes);
    assert.equal(sha256(manifestBytes), entry.manifest_sha256);
    for (const record of manifest.files) {
      const path = `${dirname(entry.manifest_path)}/${record.path}`, bytes = first.files.get(path);
      assert.equal(bytes.length, record.bytes, path); assert.equal(sha256(bytes), record.sha256, path);
    }
  }
  assert.equal(first.request.source_index_sha256, 'fa4a38a4c97f7634fe7554a03d94438b5a9486d1fcf89446bdd21abbaa2fd3fc');
  assert.equal(first.request.source_release_sha256, '3e9b1ef707ebb4e0cd71fa5c59f1ee1df1cb99bb0572d1729e29cadeacde8e28');
  assert.deepEqual(first.request.preserved_module_ids, preservedIds);
  assert.equal(first.request.excluded_candidate, 'shared-charity-details-2026-09-19-m0v2-s5');
  assert.ok([...first.files.keys()].every(path => !path.includes('m0v2-s5') && !path.includes('organizations-v1-2026.9.19')));
});

test('catalog is exactly one optional library payload with its two declared dependencies and three unsigned documents', async () => {
  const { files, request } = await plan(), { index, set, entry, manifest } = documents(files);
  assert.equal(entry.module_type, 'library'); assert.equal(entry.required, false);
  assert.equal(manifest.module_id, 'liturgical-catalog-v1'); assert.equal(manifest.module_type, 'library');
  assert.equal(manifest.version, '2026.9.20'); assert.equal(manifest.revision, 2);
  assert.deepEqual(manifest.capabilities, ['liturgical-catalog-v1']); assert.deepEqual(manifest.dependencies, dependencies);
  assert.deepEqual(manifest.files, [{ path: 'data/liturgical-catalog-v1.json', bytes: 39774, sha256: payloadHash,
    content_type: 'application/json', encoding: 'utf-8' }]);
  assert.equal(files.get(entry.manifest_path).length, entry.manifest_bytes);
  assert.equal(sha256(files.get(entry.manifest_path)), entry.manifest_sha256);
  assert.equal(index.channels.production.release_set_id, releaseId);
  assert.equal(sha256(files.get(index.channels.production.path)), index.channels.production.sha256);
  assert.equal(request.state, 'UNSIGNED_CANDIDATE'); assert.equal(request.publication_authorized_by_approval, true);
  assert.equal(request.owner_approval_sha256, approvalHash); assert.equal(request.payload_sha256, payloadHash);
  assert.deepEqual(request.documents_to_sign.map(item => [item.path, item.signature_path]), [
    [entry.manifest_path, entry.signature_path],
    [index.channels.production.path, index.channels.production.signature_path], ['index.json', 'index.sig']
  ]);
  for (const item of request.documents_to_sign) {
    assert.equal(sha256(files.get(item.path)), item.sha256); assert.equal(files.get(item.path).length, item.bytes);
    assert.equal(files.has(item.signature_path), false, 'Preparation never signs');
  }
  assert.deepEqual(request.all_candidate_files.map(item => item.path).sort(), [...files.keys()].filter(path => path !== 'signing-request.json').sort());
  for (const item of request.all_candidate_files) {
    assert.equal(files.get(item.path).length, item.bytes); assert.equal(sha256(files.get(item.path)), item.sha256);
  }
  assert.equal(set.modules.filter(item => item.module_type === 'library').length, 3);
});

test('approved metadata exposes 15 observances, 13 dates and two existing articles without resolving the two gaps or 2027', async () => {
  const { files } = await plan(), { indexBytes, set, payload } = documents(files);
  const context = catalogPreflight(payload, files, set, indexBytes);
  assert.deepEqual(evaluateCatalog(payload, context), { eligible: true, reason: null });
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    const results = payload.observances.map(observance => {
      const input = { query: observance.name[locale], locale, year: 2026, calendar_profile_id: payload.calendar_profiles[0].id };
      const result = searchCatalog(payload, context, input).results.find(item => item.observance_id === observance.id);
      assert.ok(result, observance.id);
      assert.deepEqual(result.occurrence_ids, payload.occurrences.filter(item => item.observance_id === observance.id).map(item => item.id));
      const nextYear = searchCatalog(payload, context, { ...input, year: 2027 }).results.find(item => item.observance_id === observance.id);
      assert.ok(nextYear); assert.equal(nextYear.date_state, 'unavailable');
      assert.deepEqual(nextYear.dates, []); assert.deepEqual(nextYear.occurrence_ids, []);
      assert.deepEqual(nextYear.article_ids, result.article_ids);
      return result;
    });
    assert.equal(results.length, 15); assert.equal(new Set(results.map(item => item.observance_id)).size, 15);
    assert.equal(results.filter(item => item.date_state === 'source_recorded').length, 13);
    assert.equal(results.reduce((count, item) => count + item.dates.length, 0), 13);
    assert.deepEqual(results.filter(item => item.dates.length === 0).map(item => item.observance_id).sort(), ['obs-nektarios-aegina', 'obs-stefan-decanski']);
    assert.deepEqual(results.flatMap(item => item.article_ids).sort(), ['michael-miracle-chonae', 'nativity-theotokos']);
  }
  for (const item of payload.occurrences) assert.deepEqual(resolveCatalogDay(payload, context, {
    date: item.date, calendar_profile_id: payload.calendar_profiles[0].id
  }), { eligible: true, reason: null, state: 'source_recorded', occurrence_ids: [item.id] });
  for (const date of ['2026-11-22', '2026-11-24']) assert.equal(resolveCatalogDay(payload, context, {
    date, calendar_profile_id: payload.calendar_profiles[0].id
  }).state, 'uncovered');
});

test('malformed catalog candidates fail before a nonexistent signing-key path is accessed; no output is created', async t => {
  const { files } = await plan();
  const { entry } = documents(files);
  const temporary = await mkdtemp(resolve(tmpdir(), 'svetlost33-catalog-release-guards-'));
  try {
    for (const [name, target, expected] of [
      ['payload', `${dirname(entry.manifest_path)}/data/liturgical-catalog-v1.json`, /Candidate mismatch: .*data\/liturgical-catalog-v1\.json/],
      ['request', 'signing-request.json', /Candidate mismatch: signing-request\.json/],
      ['extra-file', 'unexpected.json', /Candidate file set/]
    ]) await t.test(name, async () => {
      const candidate = resolve(temporary, name), out = resolve(temporary, `${name}-never-created`);
      const privateKeyPath = resolve(temporary, 'nonexistent-private-key');
      await writeNewTree(candidate, files);
      await writeFile(resolve(candidate, target), '{}\n');
      await assert.rejects(signCatalogRelease({ candidate, out, privateKeyPath, now }), expected);
      await assert.rejects(lstat(out), { code: 'ENOENT' });
      await assert.rejects(lstat(privateKeyPath), { code: 'ENOENT' });
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
