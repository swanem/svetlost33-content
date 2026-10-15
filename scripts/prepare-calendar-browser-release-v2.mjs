#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants as cryptoConstants, createPublicKey, verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { CATALOG_CAPABILITIES } from './prepare-liturgical-catalog-release-v2.mjs';
import { assertNoSymlinkPath, completionCompatibility } from './prepare-saints-completion-release-v2.mjs';
import { CATALOG_MODULE, catalogDependencies, evaluateCatalog, parseCatalogPayload } from './validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE, evaluateCalendarBrowser, parseCalendarBrowserPayload, upcomingBrowserFeasts, resolveBrowserArchiveDay } from './validate-calendar-browser-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export const CALENDAR_BROWSER_RELEASE_ID = 'shared-calendar-browser-2026-09-27-m0v2-s10';
export const CALENDAR_BROWSER_SEQUENCE = 10;
export const S9_INDEX_SHA256 = '3205118f271828771b5fef50d645fc3636e2cd4d7e92201844c7c20da2c1f01a';
export const S9_RELEASE_SHA256 = 'd95c571945fe6ea8f93adf47623b3de2ec40220c5f54cd13785800f26815cdf0';
export const S9_ARCHIVE = 'discovery-archive/shared-saints-completion-2026-09-21-m0v2-s9';
export const CALENDAR_BROWSER_CAPABILITIES = [...CATALOG_CAPABILITIES, 'calendar-browser-v1'];
export const PRESERVED_MODULE_IDS = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1', 'saints-v1'];
const baseIds = [...PRESERVED_MODULE_IDS, 'liturgical-catalog-v1'];
const identifier = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const payloadPath = moduleId => `data/${moduleId}.json`;
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });
const exactFields = (actual, expected, keys, label) => {
  for (const key of keys) assert.equal(actual[key], expected[key], `${label}: ${key}`);
};
const parseJSON = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const shapes = Object.fromEntries(await Promise.all(['index', 'release-set', 'module-manifest'].map(async name =>
  [name, ajv.compile(JSON.parse(await readFile(new URL(`../schemas/v2/${name}.schema.json`, import.meta.url))))])));
const shape = (name, value) => assert.ok(shapes[name](value), `Candidate ${name} schema: ${ajv.errorsText(shapes[name].errors)}`);
const safeRelative = path => {
  assert.ok(typeof path === 'string' && path.length <= 160 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe content path: ${path}`);
  return path;
};

// Read one immutable snapshot. These captured bytes, not a subsequent read, are
// validated and copied. No request-provided authentication boolean is accepted.
async function readRegular(path, maximum = 20 * 1024 * 1024) {
  await assertNoSymlinkPath(path);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= maximum, `Regular bounded input required: ${path}`);
    const bytes = await handle.readFile();
    assert.ok(bytes.length > 0 && bytes.length <= maximum, `Input byte limit: ${path}`);
    return bytes;
  } finally { await handle.close(); }
}

/** Authenticate exact current or archived S9 bytes using only the existing key.
 * Historical verification does not authorize signing against an advanced channel.
 */
export async function loadCalendarBrowserS9Base({ sourceDirectory = BASE, now = new Date().toISOString() } = {}) {
  await assertNoSymlinkPath(sourceDirectory);
  const source = new Map();
  const capture = async path => {
    safeRelative(path);
    if (!source.has(path)) source.set(path, await readRegular(resolve(sourceDirectory, path)));
    return source.get(path);
  };
  const keyBytes = await capture('trusted-public-key.pem');
  assert.equal(sha256(keyBytes), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  const key = createPublicKey(keyBytes);
  const signed = async (path, signaturePath) => {
    const bytes = await capture(path), signature = await capture(signaturePath);
    assert.ok(signature.every(byte => byte < 128), `ASCII source signature: ${path}`);
    const encoded = signature.toString('ascii');
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\n$/u);
    assert.equal(Buffer.from(encoded.trim(), 'base64').toString('base64'), encoded.trim());
    assert.equal(verify('sha256', bytes, { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(encoded.trim(), 'base64')), true, `Source snapshot signature: ${path}`);
    return parseJSON(bytes);
  };
  const archivedIndex = `${S9_ARCHIVE}/index.json`;
  const archived = await lstat(resolve(sourceDirectory, archivedIndex)).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const indexPath = archived ? archivedIndex : 'index.json';
  const indexSignaturePath = archived ? `${S9_ARCHIVE}/index.sig` : 'index.sig';
  const indexBytes = await capture(indexPath);
  assert.equal(sha256(indexBytes), S9_INDEX_SHA256, 'Pinned current or archived S9 index');
  const index = await signed(indexPath, indexSignaturePath);
  assert.equal(index.sequence, 9); assert.equal(index.channels.production.sha256, S9_RELEASE_SHA256);
  const pointer = index.channels.production, releaseBytes = await capture(pointer.path);
  assert.equal(releaseBytes.length, pointer.bytes); assert.equal(sha256(releaseBytes), S9_RELEASE_SHA256);
  const set = await signed(pointer.path, pointer.signature_path);
  assert.deepEqual(set.modules.map(item => item.module_id), baseIds, 'Only the approved S9 module graph');
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  for (const entry of set.modules) {
    const bytes = await capture(entry.manifest_path);
    assert.equal(bytes.length, entry.manifest_bytes); assert.equal(sha256(bytes), entry.manifest_sha256);
    const manifest = await signed(entry.manifest_path, entry.signature_path);
    for (const item of manifest.files) {
      safeRelative(item.path);
      const path = `${dirname(entry.manifest_path)}/${item.path}`, payload = await capture(path);
      assert.equal(payload.length, item.bytes, `Source snapshot length: ${path}`);
      assert.equal(sha256(payload), item.sha256, `Source snapshot hash: ${path}`);
    }
  }
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']])
    await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      clientCapabilities: CATALOG_CAPABILITIES, indexPath, indexSignaturePath });
  const files = new Map(source);
  files.set(`${S9_ARCHIVE}/index.json`, indexBytes); files.set(`${S9_ARCHIVE}/index.sig`, source.get(indexSignaturePath));
  files.delete('index.json'); files.delete('index.sig');
  return { files, index, set };
}

function manifestContext(files, set, moduleId) {
  const entry = set.modules.find(item => item.module_id === moduleId);
  assert.ok(entry, `Bound module present: ${moduleId}`);
  const bytes = files.get(entry.manifest_path);
  assert.equal(bytes.length, entry.manifest_bytes); assert.equal(sha256(bytes), entry.manifest_sha256);
  const manifest = parseJSON(bytes);
  return { entry, manifest, identity: { module_id: entry.module_id, version: entry.version, revision: manifest.revision, manifest_sha256: sha256(bytes) } };
}
function boundPayload(files, set, binding) {
  const { entry, manifest } = manifestContext(files, set, binding.module_id);
  const item = manifest.files.find(item => item.path === binding.path);
  assert.ok(item, `Bound payload present: ${binding.path}`);
  const bytes = files.get(`${dirname(entry.manifest_path)}/${item.path}`);
  assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
  const actual = { module_id: entry.module_id, version: entry.version, revision: manifest.revision, path: item.path, sha256: sha256(bytes) };
  exactFields(actual, binding, ['module_id', 'version', 'revision', 'path', 'sha256'], 'Exact payload binding');
  return { ...actual, payload: parseJSON(bytes) };
}

function archiveProjection(files, set) {
  const library = manifestContext(files, set, 'library-annual-2026-r1');
  const cycles = manifestContext(files, set, 'daily-cycles-r1');
  const readPayload = (host, path) => boundPayload(files, set, { ...host.identity, path,
    sha256: host.manifest.files.find(item => item.path === path)?.sha256 }).payload;
  const locales = ['sr-Cyrl', 'sr-Latn'].map(locale => ({
    library: { ...library.identity,
      psalms: readPayload(library, `data/psalms.${locale}.json`).psalms.map(psalm => ({ id: psalm.id, verse_numbers: psalm.verses.map(verse => verse.number) })),
      prayer_ids: readPayload(library, `data/prayers.${locale}.json`).prayers.map(prayer => prayer.id) },
    cycles: { ...cycles.identity, days: readPayload(cycles, `data/legacy-cycle.${locale}.json`).days.map(day => ({ id: day.id, cycle_day: day.cycle_day,
      slots: day.slots.map(slot => ({ id: slot.id, phase: slot.phase, psalm_id: slot.quote.psalm_id, verse_numbers: slot.quote.verse_numbers, prayer_id: slot.prayer_id })) })) }
  }));
  assert.deepEqual(locales[0], locales[1], 'Both scripts carry identical archive references');
  return locales[0];
}

// All true authentication flags below are isolated editorial simulations over
// the inspected bytes. This function exports only a report, never a host context
// or captured runtime selection. New candidate documents remain UNSIGNED.
function editorialPreflight(catalog, browser, files, set, indexBytes) {
  const generation = { id: set.release_set_id, sequence: set.sequence, decision_sha256: sha256(indexBytes) };
  const contexts = bindings => bindings.map(binding => ({ ...boundPayload(files, set, binding), generation, authenticated: true }));
  const calendarContexts = contexts(catalog.calendar_bindings).map(host => ({ ...host, year: host.payload.civil_year, days: host.payload.days }));
  const articleContexts = contexts(catalog.article_bindings).map(host => ({ ...host, review_status: host.payload.review_status,
    calendar_binding: host.payload.calendar_binding, articles: host.payload.articles.map(article => ({ id: article.id, type: article.type })) }));
  for (const link of catalog.article_links) {
    const binding = catalog.article_bindings.find(binding => binding.id === link.article_binding_id);
    const host = articleContexts.find(host => host.module_id === binding.module_id && host.path === binding.path);
    assert.equal(host.review_status, 'approved', 'Approved bound saints payload');
    assert.ok(host.articles.some(article => article.id === link.article_id), `Exact saints article: ${link.article_id}`);
  }
  const catalogHost = { generation, contentAuthenticated: true,
    moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, generation, dependencies: catalogDependencies(catalog) }, calendarContexts, articleContexts };
  assert.deepEqual(evaluateCatalog(catalog, catalogHost), { eligible: true, reason: null });
  assert.ok(browser.catalog_binding, 'Calendar browser candidate binds its incoming catalog');
  const actualCatalog = boundPayload(files, set, browser.catalog_binding);
  assert.deepEqual(actualCatalog.payload, catalog);
  const projected = archiveProjection(files, set);
  const archiveContexts = browser.archive_bindings.map(binding => {
    exactFields(projected.library, binding.library_binding, ['module_id', 'version', 'revision', 'manifest_sha256'], 'Exact archive library manifest');
    exactFields(projected.cycles, binding.cycles_binding, ['module_id', 'version', 'revision', 'manifest_sha256'], 'Exact archive cycles manifest');
    return { binding_id: binding.id, generation, authenticated: true, review_status: 'approved', ...projected };
  });
  const host = { generation, contentAuthenticated: true, moduleContext: { ...CALENDAR_BROWSER_MODULE,
    version: browser.version, revision: browser.revision, generation, dependencies: [] },
    catalogContext: { ...actualCatalog, generation, authenticated: true, context: catalogHost }, archiveContexts };
  assert.deepEqual(evaluateCalendarBrowser(browser, host), { eligible: true, reason: null });
  const reviewed = item => item?.review_status === 'reviewed' && item.source_ids.every(id =>
    catalog.sources.some(source => source.id === id && source.review_status === 'reviewed' && source.checked_on !== null));
  for (const membership of browser.feast_memberships) {
    assert.ok(reviewed(membership), `Reviewed membership: ${membership.observance_id}`);
    const observance = catalog.observances.find(item => item.id === membership.observance_id);
    assert.ok(reviewed(observance), `Reviewed observance: ${membership.observance_id}`);
    assert.ok(observance.subject_ids.every(id => reviewed(catalog.subjects.find(item => item.id === id))), 'Reviewed membership subjects');
    for (const id of membership.occurrence_ids) assert.ok(reviewed(catalog.occurrences.find(item => item.id === id)), `Reviewed occurrence: ${id}`);
  }
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    const result = upcomingBrowserFeasts(browser, host, { from_date: '0001-01-01', locale });
    assert.ok(result.eligible && result.state !== 'unavailable', `Incoming catalog/browser references: ${locale}`);
  }
  for (const day of browser.archive_days) {
    const result = resolveBrowserArchiveDay(browser, host, { date: day.date });
    assert.equal(result.state, day.status, `Archive date claim: ${day.date}`);
    for (const phase of day.phases) assert.equal(result.phases.find(item => item.phase === phase.phase)?.state, 'available', `Exact archive phase: ${day.date}/${phase.phase}`);
  }
  assert.equal(evaluateCalendarBrowser(browser).reason, 'content_not_authenticated');
  assert.equal(evaluateCatalog(catalog).reason, 'content_not_authenticated');
  return { state: 'EDITORIAL_SIMULATION_ONLY', runtime_authenticated: false, generation,
    feast_memberships: browser.feast_memberships.length, archive_days: browser.archive_days.length,
    archive_state: browser.archive_start_date === null ? 'NO_REVIEWED_PUBLIC_HISTORY' : 'EXPLICIT_REVIEWED_CLAIMS',
    available_archive_bindings: { library_binding: projected.library && Object.fromEntries(['module_id', 'version', 'revision', 'manifest_sha256'].map(key => [key, projected.library[key]])),
      cycles_binding: Object.fromEntries(['module_id', 'version', 'revision', 'manifest_sha256'].map(key => [key, projected.cycles[key]])) } };
}

/** Every supported optional-capability combination; catalog requires saints. */
export const CALENDAR_BROWSER_PROFILES = [false, true].flatMap(organizations => [0, 1, 2].flatMap(level => [false, true].map(browser => ({
  id: `${organizations ? 'organizations' : 'no_organizations'}_${['base', 'saints', 'catalog_and_saints'][level]}_${browser ? 'browser' : 'no_browser'}`,
  capabilities: [...CAPABILITIES.filter(cap => organizations || cap !== 'organizations-v1'), ...(level >= 1 ? ['saints-v1'] : []), ...(level === 2 ? ['liturgical-catalog-v1'] : []), ...(browser ? ['calendar-browser-v1'] : [])],
  modules: 3 + Number(organizations) + level + Number(browser),
  skipped: [...(!organizations ? ['organizations-v1'] : []), ...(level === 0 ? ['saints-v1'] : []), ...(level < 2 ? ['liturgical-catalog-v1'] : []), ...(!browser ? ['calendar-browser-v1'] : [])]
}))));

async function reviewedInputs({ catalogPath, browserPath, evidencePath, now }) {
  for (const [label, path] of Object.entries({ catalogPath, browserPath, evidencePath })) assert.ok(typeof path === 'string' && path.length, `Explicit ${label} required`);
  const [catalogBytes, browserBytes, evidenceBytes] = await Promise.all([
    readRegular(resolve(catalogPath), 524288), readRegular(resolve(browserPath), 1048576), readRegular(resolve(evidencePath), 1048576)
  ]);
  const parsedCatalog = parseCatalogPayload(catalogBytes), parsedBrowser = parseCalendarBrowserPayload(browserBytes);
  assert.equal(parsedCatalog.valid, true, `Catalog payload: ${parsedCatalog.reason}`);
  assert.equal(parsedBrowser.valid, true, `Browser payload: ${parsedBrowser.reason}`);
  const catalog = parsedCatalog.payload, browser = parsedBrowser.payload, evidence = parseJSON(evidenceBytes);
  assert.equal(evidence.schema_version, 'svetlost33-calendar-browser-candidate-review-1');
  assert.equal(evidence.status, 'APPROVED_FOR_LOCAL_CANDIDATE');
  assert.ok(['coordinator', 'editorial_review_under_owner_scope'].includes(evidence.reviewer_role), 'Exact-byte review must not be misrepresented as an owner receipt');
  assert.ok(typeof evidence.statement === 'string' && evidence.statement.trim().length > 0, 'Explicit technical review statement');
  assert.match(evidence.approval_id ?? '', identifier);
  assert.ok(Number.isFinite(Date.parse(evidence.recorded_at)) && Date.parse(evidence.recorded_at) <= Date.parse(now), 'Review is dated and not in the future');
  for (const payload of [catalog, browser]) {
    assert.equal(payload.review_status, 'approved', 'Only explicitly locally approved payloads; never promote pending content');
    assert.equal(payload.approval_id, evidence.approval_id, 'Exact local review identity');
  }
  assert.equal(evidence.scope?.release_set_id, CALENDAR_BROWSER_RELEASE_ID); assert.equal(evidence.scope.sequence, CALENDAR_BROWSER_SEQUENCE);
  assert.equal(evidence.scope.base_index_sha256, S9_INDEX_SHA256); assert.equal(evidence.scope.base_release_sha256, S9_RELEASE_SHA256);
  assert.deepEqual(evidence.scope.payloads, [
    { module_id: 'liturgical-catalog-v1', bytes: catalogBytes.length, sha256: sha256(catalogBytes) },
    { module_id: 'calendar-browser-v1', bytes: browserBytes.length, sha256: sha256(browserBytes) }
  ], 'Exact reviewed candidate bytes');
  assert.deepEqual(evidence.scope.feast_memberships, browser.feast_memberships, 'Explicit reviewed feast membership');
  assert.deepEqual(evidence.scope.archive_start_date, browser.archive_start_date, 'Explicit reviewed archive start');
  assert.deepEqual(evidence.scope.archive_days, browser.archive_days, 'Explicit reviewed archive claims');
  const evidenceFiles = new Map([['candidate-review.json', evidenceBytes]]);
  const captureEvidence = async (item, path) => {
    assert.ok(item && typeof item.path === 'string' && item.path.length, `Evidence file required: ${path}`);
    // Relative evidence paths are relative to the repository, never the cwd of a caller.
    const bytes = await readRegular(resolve(ROOT, item.path), 8 * 1024 * 1024);
    assert.equal(bytes.length, item.bytes, `Exact evidence length: ${path}`);
    assert.equal(sha256(bytes), item.sha256, `Exact evidence hash: ${path}`);
    evidenceFiles.set(path, bytes);
    return bytes;
  };
  const owner = parseJSON(await captureEvidence(evidence.approval_scope_record, 'owner-scope.json'));
  assert.equal(owner.record_type, 'OWNER_SCOPE_APPROVAL_NOT_EXACT_PAYLOAD_RECEIPT');
  assert.equal(owner.approver_role, 'project_owner');
  assert.ok(Array.isArray(owner.statements) && owner.statements.some(value => typeof value === 'string' && value.trim().length));
  assert.equal(owner.exact_payload_review, null); assert.equal(owner.production_activated, false);
  assert.ok(Array.isArray(evidence.source_reviews) && evidence.source_reviews.length > 0, 'Frozen source review evidence required');
  for (const [index, item] of evidence.source_reviews.entries()) await captureEvidence(item, `source-review-${index + 1}.json`);
  let archivePublicationState = 'NO_REVIEWED_PUBLIC_HISTORY';
  if (browser.archive_days.length && evidence.prospective_publication_plan) {
    const plan = evidence.prospective_publication_plan;
    assert.equal(plan.status, 'PLANNED_NOT_PUBLISHED');
    assert.equal(plan.start_date, browser.archive_start_date);
    assert.equal(plan.end_date, browser.archive_days.at(-1).date);
    assert.equal(plan.policy_id, 'calendar-week-v1'); assert.equal(plan.policy_version, 1);
    assert.deepEqual(plan.archive_bindings, browser.archive_bindings, 'Exact prospective archive manifest bindings');
    assert.ok(browser.archive_bindings.every(binding => binding.policy_id === plan.policy_id && binding.policy_version === plan.policy_version));
    assert.ok(browser.archive_days.every(day => day.status === 'available' && day.correction_id === null), 'New prospective rows cannot claim historical correction or withdrawal');
    // Earliest civil start globally is UTC+14. Staging later cannot establish a
    // truthful published-in-advance schedule; signing must recheck this deadline.
    const deadline = Date.parse(plan.publish_before_utc), earliestStart = Date.parse(`${plan.start_date}T00:00:00Z`) - 14 * 60 * 60 * 1000;
    assert.ok(Number.isFinite(deadline) && Date.parse(now) < deadline && deadline <= earliestStart, 'Prospective schedule publication deadline');
    archivePublicationState = 'PROSPECTIVE_SCHEDULE_NOT_PUBLISHED';
  } else if (browser.archive_days.length) {
    assert.ok(Array.isArray(evidence.archive_publication_evidence) && evidence.archive_publication_evidence.length > 0, 'Public archive claims require explicit publication evidence');
    for (const [index, item] of evidence.archive_publication_evidence.entries()) await captureEvidence(item, `archive-publication-${index + 1}.json`);
    archivePublicationState = 'EXPLICIT_REVIEWED_PUBLICATION_EVIDENCE';
  } else assert.equal(evidence.prospective_publication_plan == null, true, 'Empty archive has no prospective publication claim');
  return { catalog, browser, catalogBytes, browserBytes, evidence, evidenceFiles, archivePublicationState };
}

/** Prepare only unsigned, non-runtime candidate bytes; never sign or activate. */
export async function createCalendarBrowserReleasePlan({ sourceDirectory = BASE, catalogPath, browserPath, evidencePath, now = new Date().toISOString() } = {}) {
  assert.ok(Number.isFinite(Date.parse(now)), 'Valid preflight time');
  const base = await loadCalendarBrowserS9Base({ sourceDirectory, now });
  const inputs = await reviewedInputs({ catalogPath, browserPath, evidencePath, now });
  const { catalog, browser, evidence } = inputs;
  assert.ok(Date.parse(evidence.recorded_at) >= Date.parse(base.index.issued_at), 'New local review follows the S9 release');
  assert.ok(Date.parse(base.index.expires_at) > Date.parse(now), 'Inherited production expiry remains valid');
  const oldCatalog = manifestContext(base.files, base.set, 'liturgical-catalog-v1').manifest;
  if (catalog.version === oldCatalog.version) assert.ok(catalog.revision > oldCatalog.revision, 'Catalog replacement advances its revision');
  const files = new Map(base.files), prefix = `releases/${CALENDAR_BROWSER_RELEASE_ID}`, replacements = new Map(), documents = [];
  for (const [moduleId, payload, bytes, dependencies] of [
    ['liturgical-catalog-v1', catalog, inputs.catalogBytes, catalogDependencies(catalog)],
    ['calendar-browser-v1', browser, inputs.browserBytes, []]
  ]) {
    const root = `${prefix}/modules/${moduleId}-${payload.version}-r${payload.revision}`;
    const manifestPath = `${root}/manifest.json`, signaturePath = `${root}/manifest.sig`;
    files.set(`${root}/${payloadPath(moduleId)}`, bytes);
    const manifest = { schema_version: 'svetlost33-module-manifest-2', module_id: moduleId, module_type: 'library', version: payload.version,
      revision: payload.revision, key_id: KEY_ID, capabilities: [moduleId], dependencies, files: [record(payloadPath(moduleId), bytes)] };
    shape('module-manifest', manifest);
    const manifestBytes = json(manifest); files.set(manifestPath, manifestBytes);
    replacements.set(moduleId, { module_id: moduleId, module_type: 'library', version: payload.version, required: false,
      manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: signaturePath });
    documents.push([manifestPath, signaturePath]);
  }
  const set = { ...base.set, release_set_id: CALENDAR_BROWSER_RELEASE_ID, sequence: CALENDAR_BROWSER_SEQUENCE,
    modules: [...base.set.modules.map(entry => replacements.get(entry.module_id) ?? entry), replacements.get('calendar-browser-v1')] };
  assert.ok(set.modules.length <= 16, 'Existing M0 maximum of sixteen modules'); shape('release-set', set);
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set); files.set(releasePath, releaseBytes);
  // Installed iOS M0 uses its existing whole-second ISO8601 parser. Preserve the
  // exact review bytes, but emit canonical UTC seconds in the transport index.
  const issuedAt = new Date(evidence.recorded_at).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const index = { ...base.index, sequence: CALENDAR_BROWSER_SEQUENCE, issued_at: issuedAt,
    channels: { production: { release_set_id: CALENDAR_BROWSER_RELEASE_ID, path: releasePath, bytes: releaseBytes.length,
      sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } };
  shape('index', index);
  const indexBytes = json(index); files.set('index.json', indexBytes);
  const preflight = { ...editorialPreflight(catalog, browser, files, set, indexBytes), archive_state: inputs.archivePublicationState };
  const compatibility = CALENDAR_BROWSER_PROFILES.flatMap(profile => ['android', 'ios'].map(platform => {
    const result = completionCompatibility(files, set, profile.capabilities);
    assert.deepEqual(result, { modules: profile.modules, skipped: profile.skipped });
    return { platform, minimum_client: set.min_clients[platform], profile: profile.id, ...result, signature_verification: 'NOT_RUN_UNSIGNED_CANDIDATE' };
  }));
  for (const [path, bytes] of inputs.evidenceFiles) files.set(`${prefix}/evidence/${path}`, bytes);
  for (const entry of base.set.modules.filter(entry => PRESERVED_MODULE_IDS.includes(entry.module_id))) assert.deepEqual(set.modules.find(item => item.module_id === entry.module_id), entry);
  for (const [path, bytes] of base.files) assert.deepEqual(files.get(path), bytes, `All old signed bytes preserved: ${path}`);
  documents.push([releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']);
  for (const [path, signaturePath] of documents) { safeRelative(path); safeRelative(signaturePath); assert.equal(files.has(signaturePath), false, 'No fabricated new signature'); }
  for (const path of files.keys()) safeRelative(path);
  const request = { schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: CALENDAR_BROWSER_RELEASE_ID,
    sequence: CALENDAR_BROWSER_SEQUENCE, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: S9_INDEX_SHA256, source_release_sha256: S9_RELEASE_SHA256,
    local_review_id: evidence.approval_id, local_review_sha256: sha256(inputs.evidenceFiles.get('candidate-review.json')),
    publication_authorized: false, signing_and_activation_require_separate_coordinator_GO: true, runtime_authenticated: false,
    preserved_module_ids: PRESERVED_MODULE_IDS, replaced_module_ids: ['liturgical-catalog-v1'], added_module_ids: ['calendar-browser-v1'],
    minimum_clients: set.min_clients, inherited_expires_at: index.expires_at, module_count: set.modules.length, max_module_count: 16,
    prospective_publication_plan: evidence.prospective_publication_plan ?? null,
    editorial_preflight: preflight, compatibility_preflight: compatibility,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    documents_to_sign: documents.map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  files.set('signing-request.json', json(request));
  return { files, request, set, index };
}

const within = (parent, child) => { const path = relative(resolve(parent), resolve(child)); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)); };
export async function prepareCalendarBrowserRelease(out, options = {}) {
  assert.ok(typeof out === 'string' && out.length, 'Explicit new staging directory required');
  const directory = resolve(out);
  assert.ok(!within(resolve(ROOT, 'releases'), directory) && !within(options.sourceDirectory ?? BASE, directory), 'Stage outside all releases and the selected production source tree');
  await assertNoSymlinkPath(directory, { allowMissing: true });
  assert.equal(await lstat(directory).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false, 'Refuse existing output');
  const plan = await createCalendarBrowserReleasePlan(options);
  await assertNoSymlinkPath(directory, { allowMissing: true });
  await writeNewTree(directory, plan.files);
  return plan.request;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {}, names = { '--catalog': 'catalogPath', '--browser': 'browserPath', '--evidence': 'evidencePath', '--out': 'out', '--now': 'now' };
  for (let index = 0; index < args.length; index += 2) {
    assert.ok(names[args[index]] && args[index + 1] && !options[names[args[index]]], 'Usage: --catalog FILE --browser FILE --evidence FILE --out NEW_NONPRODUCTION_DIRECTORY [--now ISO]');
    options[names[args[index]]] = args[index + 1];
  }
  const { out, ...inputs } = options;
  console.log(JSON.stringify(await prepareCalendarBrowserRelease(out, inputs), null, 2));
}
