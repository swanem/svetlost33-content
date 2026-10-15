import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { ROOT, BASE, KEY_ID, json, sha256, readTree, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { createCalendarBrowserReleasePlan, prepareCalendarBrowserRelease, loadCalendarBrowserS9Base,
  S9_ARCHIVE, S9_INDEX_SHA256, S9_RELEASE_SHA256, CALENDAR_BROWSER_RELEASE_ID,
  CALENDAR_BROWSER_CAPABILITIES, CALENDAR_BROWSER_PROFILES, PRESERVED_MODULE_IDS } from '../scripts/prepare-calendar-browser-release-v2.mjs';
import { evaluateCalendarBrowser } from '../scripts/validate-calendar-browser-v1.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';
import { assertCalendarPublicationDeadline, assertCalendarMutationDeadline, assertCalendarSigningKey, signCalendarBrowserRelease,
  validateCalendarBrowserSignedRelease } from '../scripts/sign-calendar-browser-release-v2.mjs';
import { calendarInstallationDiff, inspectCalendarNativeGo, installCalendarBrowserRelease,
  verifyCalendarNativeArtifact } from '../scripts/install-calendar-browser-release-v2.mjs';

const now = '2026-09-27T12:00:00Z';
const approvalId = 'test-only-calendar-local-review';
let basePromise;
const base = () => basePromise ??= loadCalendarBrowserS9Base({ now });
async function temporary(t) {
  const path = await mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-calendar-candidate-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
function modulePayload(source, moduleId, path) {
  const entry = source.set.modules.find(item => item.module_id === moduleId);
  return JSON.parse(source.files.get(`${dirname(entry.manifest_path)}/${path}`));
}
const descriptor = async path => { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };

async function inputs(t, { archive = false } = {}) {
  const directory = await temporary(t), source = await base();
  const catalog = modulePayload(source, 'liturgical-catalog-v1', 'data/liturgical-catalog-v1.json');
  catalog.revision++; catalog.approval_id = approvalId;
  const occurrence = catalog.occurrences[0], observance = catalog.observances.find(item => item.id === occurrence.observance_id);
  const catalogPath = resolve(directory, 'catalog.json'), browserPath = resolve(directory, 'browser.json'), evidencePath = resolve(directory, 'review.json');
  const browser = { schema_version: 'svetlost33-calendar-browser-1', version: '2026.9.27', revision: 1,
    review_status: 'approved', approval_id: approvalId, calendar_profile_id: catalog.calendar_profiles[0].id,
    catalog_binding: { module_id: 'liturgical-catalog-v1', version: catalog.version, revision: catalog.revision,
      path: 'data/liturgical-catalog-v1.json', sha256: sha256(json(catalog)) },
    feast_memberships: [{ observance_id: observance.id, occurrence_ids: [occurrence.id], review_status: 'reviewed', source_ids: [...observance.source_ids] }],
    archive_start_date: null, archive_bindings: [], archive_days: [] };
  if (archive) {
    const binding = moduleId => {
      const entry = source.set.modules.find(item => item.module_id === moduleId), bytes = source.files.get(entry.manifest_path);
      return { module_id: moduleId, version: entry.version, revision: JSON.parse(bytes).revision, manifest_sha256: sha256(bytes) };
    };
    const day = modulePayload(source, 'daily-cycles-r1', 'data/legacy-cycle.sr-Cyrl.json').days.find(day => day.cycle_day === 2);
    browser.archive_start_date = '2026-09-29';
    browser.archive_bindings = [{ id: 'test-only-reviewed-binding', policy_id: 'calendar-week-v1', policy_version: 1,
      library_binding: binding('library-annual-2026-r1'), cycles_binding: binding('daily-cycles-r1') }];
    browser.archive_days = [{ date: '2026-09-29', binding_id: browser.archive_bindings[0].id, status: 'available', correction_id: null,
      phases: day.slots.map(slot => ({ phase: slot.phase, cycle_day_id: day.id, slot_id: slot.id,
        psalm_id: slot.quote.psalm_id, verse_numbers: slot.quote.verse_numbers, prayer_id: slot.prayer_id })) }];
  }
  const ownerPath = resolve(directory, 'owner.json'), sourceReviewPath = resolve(directory, 'source-review.json');
  await writeFile(ownerPath, json({ purpose: 'TEST_ONLY_SYNTHETIC_NOT_OWNER_APPROVAL', record_type: 'OWNER_SCOPE_APPROVAL_NOT_EXACT_PAYLOAD_RECEIPT',
    approver_role: 'project_owner', statements: ['Synthetic test scope only.'], exact_payload_review: null, production_activated: false }));
  await writeFile(sourceReviewPath, json({ purpose: 'TEST_ONLY_SYNTHETIC_NOT_SOURCE_REVIEW' }));
  const evidence = { schema_version: 'svetlost33-calendar-browser-candidate-review-1', status: 'APPROVED_FOR_LOCAL_CANDIDATE',
    reviewer_role: 'coordinator', approval_id: approvalId, recorded_at: now, statement: 'Synthetic technical review for tests only; never owner or publication evidence.',
    approval_scope_record: await descriptor(ownerPath), source_reviews: [await descriptor(sourceReviewPath)],
    scope: { release_set_id: CALENDAR_BROWSER_RELEASE_ID, sequence: 10, base_index_sha256: S9_INDEX_SHA256, base_release_sha256: S9_RELEASE_SHA256 } };
  if (archive) evidence.prospective_publication_plan = { status: 'PLANNED_NOT_PUBLISHED', start_date: '2026-09-29', end_date: '2026-09-29',
    publish_before_utc: '2026-09-28T09:59:59Z', policy_id: 'calendar-week-v1', policy_version: 1, archive_bindings: structuredClone(browser.archive_bindings) };
  const result = { directory, catalogPath, browserPath, evidencePath, catalog, browser, evidence, options: { catalogPath, browserPath, evidencePath, now } };
  await save(result);
  return result;
}
async function save(input) {
  const catalogBytes = json(input.catalog);
  input.browser.catalog_binding.sha256 = sha256(catalogBytes);
  const browserBytes = json(input.browser);
  input.evidence.scope.payloads = [
    { module_id: 'liturgical-catalog-v1', bytes: catalogBytes.length, sha256: sha256(catalogBytes) },
    { module_id: 'calendar-browser-v1', bytes: browserBytes.length, sha256: sha256(browserBytes) }
  ];
  input.evidence.scope.feast_memberships = structuredClone(input.browser.feast_memberships);
  input.evidence.scope.archive_start_date = input.browser.archive_start_date;
  input.evidence.scope.archive_days = structuredClone(input.browser.archive_days);
  await writeFile(input.catalogPath, catalogBytes); await writeFile(input.browserPath, browserBytes); await writeFile(input.evidencePath, json(input.evidence));
}

test('S10 candidate is deterministic, preserves every old signed byte and has no new signatures or runtime authentication', async t => {
  const input = await inputs(t), first = await createCalendarBrowserReleasePlan(input.options), second = await createCalendarBrowserReleasePlan(input.options), source = await base();
  assert.deepEqual(first.files, second.files); assert.deepEqual(first.request, second.request);
  assert.equal(first.index.sequence, 10); assert.equal(first.set.sequence, 10);
  assert.equal(first.index.expires_at, source.index.expires_at); assert.deepEqual(first.set.min_clients, source.set.min_clients);
  assert.equal(first.set.modules.length, 7); assert.equal(first.request.max_module_count, 16);
  assert.deepEqual(first.request.preserved_module_ids, PRESERVED_MODULE_IDS);
  for (const [path, bytes] of source.files) assert.deepEqual(first.files.get(path), bytes, path);
  for (const moduleId of PRESERVED_MODULE_IDS) assert.deepEqual(first.set.modules.find(item => item.module_id === moduleId), source.set.modules.find(item => item.module_id === moduleId));
  assert.equal(first.request.state, 'UNSIGNED_CANDIDATE'); assert.equal(first.request.runtime_authenticated, false);
  assert.equal(first.request.publication_authorized, false); assert.equal(first.request.editorial_preflight.runtime_authenticated, false);
  assert.equal(first.request.editorial_preflight.archive_state, 'NO_REVIEWED_PUBLIC_HISTORY');
  assert.equal(first.request.documents_to_sign.length, 4);
  for (const document of first.request.documents_to_sign) assert.equal(first.files.has(document.signature_path), false);
  const browserEntry = first.set.modules.find(item => item.module_id === 'calendar-browser-v1');
  const manifest = JSON.parse(first.files.get(browserEntry.manifest_path));
  assert.deepEqual(manifest.dependencies, []); assert.deepEqual(manifest.capabilities, ['calendar-browser-v1']); assert.equal(browserEntry.required, false);
  const bytes = first.files.get(`${dirname(browserEntry.manifest_path)}/data/calendar-browser-v1.json`);
  assert.deepEqual(bytes, await readFile(input.browserPath), 'Copies exact reviewed bytes');
  assert.equal(evaluateCalendarBrowser(JSON.parse(bytes)).reason, 'content_not_authenticated');
  assert.equal(first.request.compatibility_preflight.length, CALENDAR_BROWSER_PROFILES.length * 2);
  assert.equal(CALENDAR_BROWSER_PROFILES.length, 12);
  assert.ok(first.request.compatibility_preflight.some(profile => profile.modules === 3 && profile.skipped.includes('calendar-browser-v1')));
  assert.ok(first.request.compatibility_preflight.some(profile => profile.modules === 4 && !profile.skipped.includes('calendar-browser-v1') && profile.skipped.includes('liturgical-catalog-v1')));
  assert.ok(first.request.compatibility_preflight.every(profile => profile.signature_verification === 'NOT_RUN_UNSIGNED_CANDIDATE'));
});

test('new staging copies deterministic unsigned bytes, cannot pass M0, and refuses overwrites or production destinations', async t => {
  const input = await inputs(t), firstPath = resolve(input.directory, 'stage-one'), secondPath = resolve(input.directory, 'stage-two');
  const first = await prepareCalendarBrowserRelease(firstPath, input.options), second = await prepareCalendarBrowserRelease(secondPath, input.options);
  assert.deepEqual(first, second); assert.deepEqual(await readTree(firstPath), await readTree(secondPath));
  await assert.rejects(prepareCalendarBrowserRelease(firstPath, input.options), /Refuse existing output/);
  await assert.rejects(prepareCalendarBrowserRelease(resolve(BASE, 'forbidden-candidate'), input.options), /Stage outside/);
  await assert.rejects(prepareCalendarBrowserRelease(resolve(BASE, '../forbidden-candidate'), input.options), /Stage outside/);
  await assert.rejects(validateRelease(firstPath, { now, platform: 'android', clientVersion: 35, trustedKeyId: KEY_ID, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES }), /MISSING.*index.sig/);
});

test('fractional local review timestamps emit whole-second UTC transport timestamps for existing iOS clients', async t => {
  const input = await inputs(t);
  input.evidence.recorded_at = '2026-09-27T11:59:59.790Z';
  await save(input);
  const result = await createCalendarBrowserReleasePlan(input.options);
  assert.equal(result.index.issued_at, '2026-09-27T11:59:59Z');
  assert.match(result.index.issued_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  assert.equal(JSON.parse(result.files.get(`releases/${CALENDAR_BROWSER_RELEASE_ID}/evidence/candidate-review.json`)).recorded_at,
    input.evidence.recorded_at, 'Original review timestamp and exact review bytes remain unchanged');
});

test('actual preparation CLI with default time emits existing-iOS-compatible whole-second UTC', async t => {
  const input = await inputs(t), out = resolve(input.directory, 'actual-cli-output');
  input.evidence.recorded_at = new Date(Date.now() - 60000).toISOString();
  await save(input);
  await promisify(execFile)(process.execPath, [resolve(ROOT, 'scripts/prepare-calendar-browser-release-v2.mjs'),
    '--catalog', input.catalogPath, '--browser', input.browserPath, '--evidence', input.evidencePath, '--out', out]);
  const index = JSON.parse(await readFile(resolve(out, 'index.json')));
  assert.match(index.issued_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  assert.equal(index.issued_at, new Date(input.evidence.recorded_at).toISOString().replace(/\.\d{3}Z$/u, 'Z'));
});

test('pending or mismatched local approvals are rejected without transforming any review status', async t => {
  for (const [label, mutate, expected] of [
    ['pending browser', input => { input.browser.review_status = 'pending'; input.browser.approval_id = null; }, /Only explicitly locally approved/],
    ['pending catalog', input => { input.catalog.review_status = 'pending'; input.catalog.approval_id = null; }, /Only explicitly locally approved/],
    ['mismatched approval', input => { input.browser.approval_id = 'wrong-approval-id'; }, /Exact local review identity/],
    ['unreviewed membership', input => { input.browser.feast_memberships[0].review_status = 'pending'; }, /Reviewed membership/],
    ['fake exact owner receipt', input => { input.evidence.reviewer_role = 'project_owner'; }, /must not be misrepresented/],
    ['review from future', input => { input.evidence.recorded_at = '2026-09-28T00:00:00Z'; }, /not in the future/],
    ['stale revision', input => { input.catalog.revision--; input.browser.catalog_binding.revision--; }, /advances its revision/]
  ]) {
    const input = await inputs(t); mutate(input); await save(input);
    await assert.rejects(createCalendarBrowserReleasePlan(input.options), expected, label);
    assert.equal(JSON.parse(await readFile(input.browserPath)).review_status, input.browser.review_status, label);
  }
});

test('payload and evidence edits after review are rejected; arbitrary authentication claims do not bypass checks', async t => {
  const input = await inputs(t);
  await writeFile(input.browserPath, Buffer.concat([await readFile(input.browserPath), Buffer.from(' ')]));
  await assert.rejects(createCalendarBrowserReleasePlan(input.options), /Exact reviewed candidate bytes/);
  await save(input);
  await writeFile(input.evidence.source_reviews[0].path, json({ authenticated: true, review_status: 'approved' }));
  await assert.rejects(createCalendarBrowserReleasePlan(input.options), /Exact evidence (length|hash)/);
  const other = await inputs(t); other.evidence.scope.feast_memberships = [];
  await writeFile(other.evidencePath, json(other.evidence));
  await assert.rejects(createCalendarBrowserReleasePlan(other.options), /Explicit reviewed feast membership/);
});

test('exact incoming catalog, calendar and saints bindings reject mismatches', async t => {
  for (const [label, mutate, expected] of [
    ['wrong calendar bytes', input => { input.catalog.calendar_bindings[0].sha256 = '0'.repeat(64); }, /Exact payload binding/],
    ['wrong saints revision', input => { input.catalog.article_bindings[0].revision++; }, /Exact payload binding/],
    ['missing saints article', input => { input.catalog.article_links[0].article_id = 'not-a-real-article'; }, /Exact saints article/],
    ['wrong browser catalog revision', input => { input.browser.catalog_binding.revision++; }, /Exact payload binding/],
    ['unknown membership occurrence', input => { input.browser.feast_memberships[0].occurrence_ids = ['not-an-occurrence']; }, /Reviewed occurrence/],
    ['wrong profile', input => { input.browser.calendar_profile_id = 'unknown-calendar-profile'; }, /Incoming catalog\/browser references/]
  ]) {
    const input = await inputs(t); mutate(input); await save(input);
    await assert.rejects(createCalendarBrowserReleasePlan(input.options), expected, label);
  }
});

test('prospective schedule checks exact preserved manifests and all phases without asserting publication history', async t => {
  const input = await inputs(t, { archive: true }), result = await createCalendarBrowserReleasePlan(input.options), source = await base();
  assert.equal(result.request.editorial_preflight.archive_state, 'PROSPECTIVE_SCHEDULE_NOT_PUBLISHED');
  assert.equal(result.request.editorial_preflight.archive_days, 1);
  assert.equal(result.request.prospective_publication_plan.status, 'PLANNED_NOT_PUBLISHED');
  assert.equal(result.request.publication_authorized, false);
  for (const field of ['library_binding', 'cycles_binding']) {
    const binding = result.request.editorial_preflight.available_archive_bindings[field];
    assert.equal(binding.manifest_sha256, sha256(source.files.get(source.set.modules.find(entry => entry.module_id === binding.module_id).manifest_path)));
  }
});

test('archive claims without evidence, changed manifests, wrong weekday/phase, or missed deadlines fail closed', async t => {
  for (const [label, mutate, expected] of [
    ['no evidence', input => { delete input.evidence.prospective_publication_plan; }, /require explicit publication evidence/],
    ['wrong manifest', input => {
      input.browser.archive_bindings[0].library_binding.manifest_sha256 = 'a'.repeat(64);
      input.evidence.prospective_publication_plan.archive_bindings = structuredClone(input.browser.archive_bindings);
    }, /Exact archive library manifest/],
    ['wrong slot', input => { input.browser.archive_days[0].phases[0].slot_id = 'not-an-existing-slot'; }, /Exact archive phase/],
    ['wrong weekday', input => {
      input.browser.archive_start_date = '2026-09-30'; input.browser.archive_days[0].date = '2026-09-30';
      input.evidence.prospective_publication_plan.start_date = '2026-09-30'; input.evidence.prospective_publication_plan.end_date = '2026-09-30';
    }, /Archive date claim/],
    ['deadline missed', input => { input.evidence.prospective_publication_plan.publish_before_utc = now; }, /publication deadline/],
    ['deadline after earliest start', input => { input.evidence.prospective_publication_plan.publish_before_utc = '2026-09-29T00:00:00Z'; }, /publication deadline/],
    ['retrospective row', input => {
      input.browser.archive_start_date = '2026-09-22'; input.browser.archive_days[0].date = '2026-09-22';
      input.evidence.prospective_publication_plan.start_date = '2026-09-22'; input.evidence.prospective_publication_plan.end_date = '2026-09-22';
    }, /publication deadline/]
  ]) {
    const input = await inputs(t, { archive: true }); mutate(input); await save(input);
    await assert.rejects(createCalendarBrowserReleasePlan(input.options), expected, label);
  }
});

test('source authentication rejects drifted index, trust key, signature, or payload bytes', async t => {
  const source = await base(), directory = await temporary(t);
  const sourceFiles = () => new Map([...source.files].filter(([path]) => !path.startsWith(`${S9_ARCHIVE}/`)).concat([
    ['index.json', source.files.get(`${S9_ARCHIVE}/index.json`)], ['index.sig', source.files.get(`${S9_ARCHIVE}/index.sig`)]
  ]));
  for (const [name, path, bytes, expected] of [
    ['index', 'index.json', Buffer.concat([source.files.get(`${S9_ARCHIVE}/index.json`), Buffer.from(' ')]), /Pinned current or archived S9 index/],
    ['key', 'trusted-public-key.pem', Buffer.concat([source.files.get('trusted-public-key.pem'), Buffer.from('\n')]), /trust anchor/],
    ['signature', source.set.modules[0].signature_path, Buffer.from('AAAA\n'), /Source snapshot signature/],
    ['payload', `${dirname(source.set.modules[0].manifest_path)}/data/psalms.sr-Cyrl.json`, Buffer.from('{}\n'), /Source snapshot length/]
  ]) {
    const files = sourceFiles(); files.set(path, bytes); const sourceDirectory = resolve(directory, name); await writeNewTree(sourceDirectory, files);
    await assert.rejects(loadCalendarBrowserS9Base({ sourceDirectory, now }), expected, name);
  }
});

test('archived S9 authenticates historical bytes after live advance but cannot authorize new signing', async t => {
  const input = await inputs(t), source = await base(), sourceDirectory = resolve(input.directory, 'advanced-live-tree');
  const advancedIndex = json({ ...source.index, sequence: 10 });
  // Synthetic live advance is deliberately not trusted. Only archived S9 is the
  // authentic historical base; the signer must reject this live discovery pair.
  const sourceFiles = new Map([...source.files, ['index.json', advancedIndex], ['index.sig', Buffer.from('AAAA\n')]]);
  await writeNewTree(sourceDirectory, sourceFiles);
  const historical = await loadCalendarBrowserS9Base({ sourceDirectory, now });
  assert.deepEqual(historical, source, 'Historical source snapshot stays byte-identical');
  const originalPlan = await createCalendarBrowserReleasePlan(input.options);
  const historicalPlan = await createCalendarBrowserReleasePlan({ ...input.options, sourceDirectory });
  assert.deepEqual(historicalPlan, originalPlan, 'Unsigned payloads, request and file inventory do not change');
  const candidate = resolve(input.directory, 'unsigned-for-historical-test');
  await writeNewTree(candidate, historicalPlan.files);
  await assert.rejects(signCalendarBrowserRelease({ ...input.options, sourceDirectory, candidate,
    out: resolve(input.directory, 'must-not-be-signed'), privateKeyPath: resolve(input.directory, 'missing-key-never-inspected.pem'),
    coordinatorGo: true }), /Signing source discovery advanced; replan before key access or output/);
  // Presence of a corrupted archive is never a reason to fall back silently to
  // a valid live S9 copy, since that would conceal the selected historical drift.
  await writeFile(resolve(sourceDirectory, 'index.json'), source.files.get(`${S9_ARCHIVE}/index.json`));
  await writeFile(resolve(sourceDirectory, 'index.sig'), source.files.get(`${S9_ARCHIVE}/index.sig`));
  await writeFile(resolve(sourceDirectory, `${S9_ARCHIVE}/index.json`), advancedIndex);
  await assert.rejects(loadCalendarBrowserS9Base({ sourceDirectory, now }), /Pinned current or archived S9 index/);
});

test('input, output ancestor, and source symlinks are rejected', async t => {
  const input = await inputs(t), link = resolve(input.directory, 'browser-link.json');
  await symlink(input.browserPath, link);
  await assert.rejects(createCalendarBrowserReleasePlan({ ...input.options, browserPath: link }), /Symlink path rejected/);
  const ancestor = resolve(input.directory, 'parent-link'); await symlink(input.directory, ancestor);
  await assert.rejects(createCalendarBrowserReleasePlan({ ...input.options, evidencePath: resolve(ancestor, 'review.json') }), /Symlink path rejected/);
  await assert.rejects(prepareCalendarBrowserRelease(resolve(ancestor, 'stage'), input.options), /Symlink path rejected/);
  const source = resolve(input.directory, 'source-link'); await symlink(BASE, source);
  await assert.rejects(loadCalendarBrowserS9Base({ sourceDirectory: source, now }), /Symlink path rejected/);
});

test('expired source and absent explicit payload paths cannot produce a candidate', async () => {
  await assert.rejects(loadCalendarBrowserS9Base({ now: '2027-02-01T00:00:01Z' }), /TIME: Index has expired/);
  await assert.rejects(createCalendarBrowserReleasePlan({ now }), /Explicit catalogPath required/);
});

test('staged signer rejects missing GO, candidate drift, existing/production output, and repository key paths before key access', async t => {
  await assert.rejects(signCalendarBrowserRelease({}), /Explicit coordinator signing GO/);
  const input = await inputs(t), candidate = resolve(input.directory, 'unsigned'), out = resolve(input.directory, 'signed');
  const nonexistentKey = resolve(input.directory, 'missing-private-key-never-opened.pem');
  await prepareCalendarBrowserRelease(candidate, input.options);
  const options = { ...input.options, candidate, out, privateKeyPath: nonexistentKey, coordinatorGo: true };
  await assert.rejects(signCalendarBrowserRelease({ ...options, out: candidate }), /Output exists/);
  await assert.rejects(signCalendarBrowserRelease({ ...options, out: resolve(BASE, 'forbidden-stage') }), /Signed stage must be outside/);
  await assert.rejects(signCalendarBrowserRelease({ ...options, privateKeyPath: resolve(ROOT, 'not-a-key.pem') }), /Private key must remain outside/);
  await writeFile(resolve(candidate, 'signing-request.json'), json({ state: 'UNSIGNED_CANDIDATE', publication_authorized: true }));
  await assert.rejects(signCalendarBrowserRelease(options), /Unsigned candidate bytes: signing-request.json/);
});

test('staged signer validates real public-key identity and publication deadlines without using a private key', async () => {
  const source = await base(), trusted = source.files.get('trusted-public-key.pem');
  assertCalendarSigningKey(createPublicKey(trusted), trusted);
  const fixturePublic = createPublicKey(await readFile(resolve(ROOT, 'fixtures/v2/positive/release/trusted-public-key.pem')));
  assert.throws(() => assertCalendarSigningKey(fixturePublic, trusted), /differs from existing production trust anchor/);
  const request = { prospective_publication_plan: { status: 'PLANNED_NOT_PUBLISHED', start_date: '2026-09-29', publish_before_utc: '2026-09-28T10:00:00Z' } };
  assertCalendarPublicationDeadline(request, now);
  assert.throws(() => assertCalendarPublicationDeadline(request, '2026-09-28T10:00:00Z'), /deadline passed/);
  assert.throws(() => assertCalendarPublicationDeadline({ prospective_publication_plan: { ...request.prospective_publication_plan, publish_before_utc: '2026-09-29T00:00:00Z' } }, now), /deadline passed or invalid/);
});

test('real signing deadline cannot be bypassed by a historical caller clock', async t => {
  const input = await inputs(t, { archive: true }), candidate = resolve(input.directory, 'unsigned-for-clock-test');
  await prepareCalendarBrowserRelease(candidate, input.options);
  const request = { prospective_publication_plan: input.evidence.prospective_publication_plan };
  assertCalendarPublicationDeadline(request, now);
  t.mock.method(Date, 'now', () => Date.parse('2026-09-28T10:00:01Z'));
  assert.throws(() => assertCalendarMutationDeadline(request), /deadline passed or invalid/);
  await assert.rejects(signCalendarBrowserRelease({ ...input.options, candidate, out: resolve(input.directory, 'must-not-sign-after-deadline'),
    coordinatorGo: true, privateKeyPath: resolve(input.directory, 'missing-key-never-opened.pem') }), /deadline passed or invalid/);
});

test('signed validator rejects fabricated signatures against exact candidate bytes', async t => {
  const input = await inputs(t), plan = await createCalendarBrowserReleasePlan(input.options), files = new Map(plan.files);
  files.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) files.set(document.signature_path, Buffer.from('AAAA\n'));
  const directory = resolve(input.directory, 'false-signatures'); await writeNewTree(directory, files);
  await assert.rejects(validateCalendarBrowserSignedRelease(directory, input.options), /Signed candidate signature/);
});

test('installer classifies safe immutable-copy retries and exact already-installed S10 without changing bytes', () => {
  const old = new Map([['index.json', Buffer.from('old-index')], ['index.sig', Buffer.from('old-sig')]]);
  const signed = new Map([['index.json', Buffer.from('new-index')], ['index.sig', Buffer.from('new-sig')],
    ['preserved.json', Buffer.from('preserved')], ['new.json', Buffer.from('new')]]);
  const existing = new Map([...old, ['preserved.json', signed.get('preserved.json')]]);
  assert.deepEqual(calendarInstallationDiff(existing, signed, old), { mode: 's9_to_s10', missing: ['new.json'] });
  existing.set('new.json', signed.get('new.json'));
  assert.deepEqual(calendarInstallationDiff(existing, signed, old), { mode: 's9_to_s10', missing: [] });
  assert.deepEqual(calendarInstallationDiff(signed, signed, old), { mode: 'already_installed', missing: [] });
  existing.set('new.json', Buffer.from('altered'));
  assert.throws(() => calendarInstallationDiff(existing, signed, old), /Immutable collision/);
  assert.throws(() => calendarInstallationDiff(new Map([['index.json', signed.get('index.json')], ['index.sig', old.get('index.sig')]]), signed, old), /neither exact S9 nor this signed S10/);
  const incomplete = new Map(signed); incomplete.delete('new.json');
  assert.throws(() => calendarInstallationDiff(incomplete, signed, old), /incomplete immutable files/);
});

test('native GO inspection reports missing or pending proofs and never manufactures approval', async t => {
  const indexSha256 = 'a'.repeat(64), releaseSha256 = 'b'.repeat(64);
  assert.deepEqual(await inspectCalendarNativeGo({ indexSha256, releaseSha256, now }),
    { checks: [], blockers: ['android_native_GO_missing', 'ios_native_GO_missing'] });
  const directory = await temporary(t), path = resolve(directory, 'pending-native.json');
  await writeFile(path, json({ purpose: 'TEST_ONLY_PENDING_STATUS_NOT_A_NATIVE_GO',
    schema_version: 'svetlost33-native-calendar-release-go-1', platform: 'android', status: 'PENDING',
    release_set_id: CALENDAR_BROWSER_RELEASE_ID, sequence: 10, index_sha256: indexSha256,
    release_sha256: releaseSha256, recorded_at: now }));
  assert.deepEqual(await inspectCalendarNativeGo({ nativeGoPaths: { android: path }, indexSha256, releaseSha256, now }),
    { checks: [], blockers: ['android_native_GO_not_granted', 'ios_native_GO_missing'] });
  await assert.rejects(inspectCalendarNativeGo({ nativeGoPaths: { android: path }, indexSha256: 'c'.repeat(64), releaseSha256, now }), /Native GO exact signed index/);
  await assert.rejects(inspectCalendarNativeGo({ nativeGoPaths: { ios: path }, indexSha256, releaseSha256, now }), /Native GO platform/);
});

test('native artifact integrity is checked directly without creating any native GO receipt', async t => {
  const directory = await temporary(t), path = resolve(directory, 'test-artifact.txt');
  await writeFile(path, 'TEST ONLY inert artifact; no build or approval assertion.\n');
  const record = await descriptor(path);
  await verifyCalendarNativeArtifact(record);
  await assert.rejects(verifyCalendarNativeArtifact({ ...record, bytes: record.bytes + 1 }), /Native artifact length/);
  await assert.rejects(verifyCalendarNativeArtifact({ ...record, sha256: '0'.repeat(64) }), /Native artifact hash/);
  const link = resolve(directory, 'artifact-link'); await symlink(path, link);
  await assert.rejects(verifyCalendarNativeArtifact({ ...record, path: link }), /Symlink path rejected/);
});

test('installer mutation gate and CLI real-time policy reject before any activation work', async () => {
  await assert.rejects(installCalendarBrowserRelease({ dryRun: false }), /Explicit coordinator activation GO/);
  await assert.rejects(installCalendarBrowserRelease({ dryRun: 'false' }), /Explicit boolean dryRun/);
  await assert.rejects(promisify(execFile)(process.execPath, [resolve(ROOT, 'scripts/install-calendar-browser-release-v2.mjs'),
    '--install', '--coordinator-activation-go', '--now', now]), /--now is permitted only for read-only installation inspection/);
  await assert.rejects(promisify(execFile)(process.execPath, [resolve(ROOT, 'scripts/sign-calendar-browser-release-v2.mjs'),
    '--coordinator-go', '--now', now]), /--now is permitted only for read-only signed validation/);
});
