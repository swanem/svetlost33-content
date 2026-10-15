#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, PUBLIC_KEY_SHA256, json, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath, completionCompatibility } from './prepare-saints-completion-release-v2.mjs';
import { CALENDAR_BROWSER_CAPABILITIES, CALENDAR_BROWSER_PROFILES } from './prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';
import { inspectCandidate } from '../drafts/saints-next-window-2026-09-30/inspect.mjs';
import { parseSaintsPayload, evaluateSaintsDay, SAINTS_MODULE } from './validate-saints-v1.mjs';
import { catalogDependencies, parseCatalogPayload, evaluateCatalog, CATALOG_MODULE } from './validate-liturgical-catalog-v1.mjs';
import { parseCalendarBrowserPayload, evaluateCalendarBrowser, upcomingBrowserFeasts, resolveBrowserArchiveDay, CALENDAR_BROWSER_MODULE } from './validate-calendar-browser-v1.mjs';
import { validateOrganizationsRegistry } from './validate-organizations-v1.mjs';

export const REFRESH_ID = 'shared-content-refresh-2026-09-30-m0v2-s11';
export const REFRESH_SEQUENCE = 11;
export const PREPARED_AT = '2026-09-30T20:43:44Z';
export const S10_INDEX_SHA256 = 'cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23';
export const S10_RELEASE_SHA256 = 'ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879';
export const S10_ARCHIVE = 'discovery-archive/shared-calendar-browser-2026-09-27-m0v2-s10';
export const OWNER_PATH = 'approvals/new-content-2026-09-30/owner-approval.json';
export const OWNER_SHA256 = '549e767f5734030b8c36d7b05c1b7eefc02583a4b6b14f4313e8721594002290';
export const PRESERVED_IDS = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1'];
export const REPLACED_IDS = ['organizations-v1', 'saints-v1', 'liturgical-catalog-v1', 'calendar-browser-v1'];
const compact = value => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });
const safe = path => {
  assert.ok(typeof path === 'string' && path.length <= 240 && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe path: ${path}`);
  return path;
};
const exact = (a, b, keys, label) => { for (const key of keys) assert.equal(a[key], b[key], `${label}: ${key}`); };

export async function readRefreshInput(path, maximum = 20 * 1024 * 1024) {
  await assertNoSymlinkPath(path);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= maximum, `Bounded regular file required: ${path}`);
    const bytes = await handle.readFile();
    assert.ok(bytes.length > 0 && bytes.length <= maximum, `File byte limit: ${path}`);
    return bytes;
  } finally { await handle.close(); }
}

/** Exact captured production snapshot, verified before reuse. Never trusts an input authentication flag. */
export async function loadRefreshS10Base({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  const files = new Map();
  const capture = async path => {
    safe(path);
    if (!files.has(path)) files.set(path, await readRefreshInput(resolve(sourceDirectory, path)));
    return files.get(path);
  };
  const keyBytes = await capture('trusted-public-key.pem');
  assert.equal(sha256(keyBytes), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  const key = createPublicKey(keyBytes);
  const signed = async (path, sigPath) => {
    const bytes = await capture(path), signature = await capture(sigPath);
    assert.ok(signature.every(byte => byte < 128), 'ASCII signature');
    const encoded = signature.toString('ascii');
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\n$/u);
    assert.equal(Buffer.from(encoded.trim(), 'base64').toString('base64'), encoded.trim());
    assert.ok(verify('sha256', bytes, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(encoded.trim(), 'base64')), `Captured signature: ${path}`);
    return parse(bytes);
  };
  const indexPath = archived ? `${S10_ARCHIVE}/index.json` : 'index.json';
  const sigPath = archived ? `${S10_ARCHIVE}/index.sig` : 'index.sig';
  assert.equal(sha256(await capture(indexPath)), S10_INDEX_SHA256, 'S10 source discovery advanced: replan required');
  const index = await signed(indexPath, sigPath);
  assert.equal(index.sequence, 10);
  assert.ok(Date.parse(index.expires_at) > Date.parse(now), 'Source discovery expired');
  const pointer = index.channels.production;
  assert.equal(pointer.sha256, S10_RELEASE_SHA256);
  const releaseBytes = await capture(pointer.path);
  assert.equal(releaseBytes.length, pointer.bytes); assert.equal(sha256(releaseBytes), pointer.sha256);
  const set = await signed(pointer.path, pointer.signature_path);
  assert.deepEqual(set.modules.map(x => x.module_id), [...PRESERVED_IDS, ...REPLACED_IDS]);
  assert.deepEqual(set.approved_platforms, ['android', 'ios']);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  for (const entry of set.modules) {
    const bytes = await capture(entry.manifest_path);
    assert.equal(bytes.length, entry.manifest_bytes); assert.equal(sha256(bytes), entry.manifest_sha256);
    const manifest = await signed(entry.manifest_path, entry.signature_path);
    for (const item of manifest.files) {
      safe(item.path);
      const bytes = await capture(`${dirname(entry.manifest_path)}/${item.path}`);
      assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
    }
  }
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES, indexPath, indexSignaturePath: sigPath });
  }
  files.set(`${S10_ARCHIVE}/index.json`, files.get(indexPath));
  files.set(`${S10_ARCHIVE}/index.sig`, files.get(sigPath));
  files.delete('index.json'); files.delete('index.sig');
  return { files, set, index };
}

function payloadHost(files, set, moduleId) {
  const entry = set.modules.find(x => x.module_id === moduleId);
  assert.ok(entry, moduleId);
  const manifestBytes = files.get(entry.manifest_path), manifest = parse(manifestBytes);
  assert.equal(sha256(manifestBytes), entry.manifest_sha256);
  const path = `data/${moduleId}.json`;
  const item = manifest.files.find(x => x.path === path);
  assert.ok(item, `Payload: ${moduleId}`);
  const bytes = files.get(`${dirname(entry.manifest_path)}/${path}`);
  assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
  return { module_id: moduleId, version: manifest.version, revision: manifest.revision, path, sha256: sha256(bytes), payload: parse(bytes) };
}

async function reviewedSnapshot(owner, candidateId) {
  const candidate = owner.candidates.find(x => x.id === candidateId);
  assert.ok(candidate);
  const anchorBytes = await readRefreshInput(resolve(ROOT, safe(candidate.anchor.path)));
  assert.equal(sha256(anchorBytes), candidate.anchor.sha256, `Owner approved anchor: ${candidateId}`);
  const anchor = parse(anchorBytes), contents = new Map();
  for (const file of anchor.files ?? []) {
    const path = resolve(ROOT, dirname(candidate.anchor.path), safe(file.path));
    assert.ok(!relative(ROOT, path).startsWith('..'));
    const bytes = await readRefreshInput(path);
    assert.equal(bytes.length, file.bytes); assert.equal(sha256(bytes), file.sha256, `Approved snapshot: ${file.path}`);
    contents.set(file.path, bytes);
  }
  return { candidate, contents };
}

/** Editorial simulation only. It returns no authenticated native/runtime snapshot. */
export function refreshPreflight({ files, set, indexBytes, payloads, now }) {
  const { saints, organizations, catalog, browser } = payloads;
  const generation = { id: set.release_set_id, sequence: set.sequence, decision_sha256: sha256(indexBytes) };
  const bound = binding => {
    const entry = set.modules.find(x => x.module_id === binding.module_id);
    assert.ok(entry); const manifest = parse(files.get(entry.manifest_path));
    const item = manifest.files.find(x => x.path === binding.path); assert.ok(item);
    const bytes = files.get(`${dirname(entry.manifest_path)}/${item.path}`);
    const host = { module_id: entry.module_id, version: entry.version, revision: manifest.revision, path: item.path, sha256: sha256(bytes), payload: parse(bytes) };
    exact(host, binding, ['module_id', 'version', 'revision', 'path', 'sha256'], 'Same-generation exact payload binding');
    return { ...host, generation, authenticated: true };
  };
  const calendars = catalog.calendar_bindings.map(binding => { const host = bound(binding); return { ...host, year: host.payload.civil_year, days: host.payload.days }; });
  const articleContexts = catalog.article_bindings.map(binding => { const host = bound(binding); return { ...host, review_status: host.payload.review_status, calendar_binding: host.payload.calendar_binding, articles: host.payload.articles.map(x => ({ id: x.id, type: x.type })) }; });
  const catalogContext = { generation, contentAuthenticated: true, moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, generation, dependencies: catalogDependencies(catalog) }, calendarContexts: calendars, articleContexts };
  assert.deepEqual(evaluateCatalog(catalog, catalogContext), { eligible: true, reason: null });
  for (const link of catalog.article_links) assert.ok(articleContexts.some(host => host.articles.some(article => article.id === link.article_id)), `Exact linked article: ${link.article_id}`);
  const calendar = bound(saints.calendar_binding);
  for (const day of saints.days) assert.equal(evaluateSaintsDay(saints, { contentAuthenticated: true, moduleContext: { ...SAINTS_MODULE, version: saints.version, revision: saints.revision }, calendarAuthenticated: true, calendarContext: { ...calendar, days: calendar.payload.days }, date: day.date }).eligible, true, day.date);
  const projection = (id, locale) => {
    const entry = set.modules.find(x => x.module_id === id), manifest = parse(files.get(entry.manifest_path));
    const read = name => parse(files.get(`${dirname(entry.manifest_path)}/data/${name}.${locale}.json`));
    const identity = { module_id: id, version: entry.version, revision: manifest.revision, manifest_sha256: entry.manifest_sha256 };
    return id === 'daily-cycles-r1' ? { ...identity, days: read('legacy-cycle').days.map(day => ({ id: day.id, cycle_day: day.cycle_day, slots: day.slots.map(slot => ({ id: slot.id, phase: slot.phase, psalm_id: slot.quote.psalm_id, verse_numbers: slot.quote.verse_numbers, prayer_id: slot.prayer_id })) })) }
      : { ...identity, psalms: read('psalms').psalms.map(psalm => ({ id: psalm.id, verse_numbers: psalm.verses.map(x => x.number) })), prayer_ids: read('prayers').prayers.map(x => x.id) };
  };
  const projected = ['sr-Cyrl', 'sr-Latn'].map(locale => ({ library: projection('library-annual-2026-r1', locale), cycles: projection('daily-cycles-r1', locale) }));
  assert.deepEqual(projected[0], projected[1]);
  const archiveContexts = browser.archive_bindings.map(binding => {
    for (const name of ['library', 'cycles']) exact(projected[0][name], binding[`${name}_binding`], ['module_id', 'version', 'revision', 'manifest_sha256'], 'Archive binding');
    return { ...projected[0], generation, authenticated: true, review_status: 'approved', binding_id: binding.id };
  });
  const browserContext = { generation, contentAuthenticated: true, moduleContext: { ...CALENDAR_BROWSER_MODULE, version: browser.version, revision: browser.revision, generation, dependencies: [] }, catalogContext: { ...bound(browser.catalog_binding), context: catalogContext }, archiveContexts };
  assert.deepEqual(evaluateCalendarBrowser(browser, browserContext), { eligible: true, reason: null });
  for (const locale of ['sr-Cyrl', 'sr-Latn']) assert.equal(upcomingBrowserFeasts(browser, browserContext, { from_date: '2026-01-01', locale }).items.length, 21);
  for (const day of browser.archive_days) {
    const result = resolveBrowserArchiveDay(browser, browserContext, { date: day.date });
    assert.equal(result.state, day.status);
    assert.ok(result.phases.every(x => x.state === 'available'));
  }
  const org = validateOrganizationsRegistry(organizations, { now, contentAuthenticated: true, paymentSessionFresh: true, clientCapabilities: ['organizations-v1'], moduleContext: { module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: organizations.version, revision: organizations.revision } });
  assert.equal(org.registry_eligible, true); assert.ok(org.organizations.every(x => x.links.every(link => link.enabled)));
  assert.equal(evaluateCatalog(catalog).reason, 'content_not_authenticated');
  assert.equal(evaluateCalendarBrowser(browser).reason, 'content_not_authenticated');
  const compatibility = CALENDAR_BROWSER_PROFILES.map(profile => {
    const result = completionCompatibility(files, set, profile.capabilities);
    assert.deepEqual(result, { modules: profile.modules, skipped: profile.skipped });
    return { profile: profile.id, ...result };
  });
  return { state: 'EDITORIAL_SIMULATION_ONLY', runtime_authenticated: false, saints_articles: saints.articles.length, saints_days: saints.days.length, organizations: organizations.organizations.length, links: organizations.organizations.flatMap(x => x.links).length, catalog_article_links: catalog.article_links.length, feast_memberships: browser.feast_memberships.length, archive_days: browser.archive_days.length, compatibility };
}

export async function createSharedRefreshPlan({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  assert.ok(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(PREPARED_AT), 'Valid preparation time');
  const base = await loadRefreshS10Base({ sourceDirectory, now, archived });
  const ownerBytes = await readRefreshInput(resolve(ROOT, OWNER_PATH));
  assert.equal(sha256(ownerBytes), OWNER_SHA256); const owner = parse(ownerBytes);
  assert.deepEqual(owner.platforms, ['android', 'ios']); assert.deepEqual(owner.territories, ['RS', 'BA']);
  assert.ok(Date.parse(owner.recorded_at) <= Date.parse(now));
  const saintsSnapshot = await reviewedSnapshot(owner, 'saints-next-window-2026-09-30-r1');
  const charitySnapshot = await reviewedSnapshot(owner, 'charity-refresh-2026-09-30-r3');
  const radioSnapshot = await reviewedSnapshot(owner, 'radio-refresh-2026-09-30-r1');
  assert.equal(saintsSnapshot.candidate.owner_status, 'APPROVED'); assert.equal(charitySnapshot.candidate.owner_status, 'APPROVED');
  const inventory = parse(saintsSnapshot.contents.get('inventory.json'));
  const originals = inventory.source_files.map(item => {
    assert.ok(item.path.startsWith('releases/v2/production/'));
    const bytes = base.files.get(item.path.slice('releases/v2/production/'.length));
    assert.ok(bytes); assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
    return parse(bytes);
  });
  const inputs = { inventory, manuscript: parse(saintsSnapshot.contents.get('manuscript.json')), sources: parse(saintsSnapshot.contents.get('sources.json')), calendar: originals[0], baseline: originals[1], catalog: originals[2] };
  const draft = inspectCandidate(inputs);
  assert.deepEqual(inputs.baseline, payloadHost(base.files, base.set, 'saints-v1').payload);
  assert.deepEqual(inputs.catalog, payloadHost(base.files, base.set, 'liturgical-catalog-v1').payload);
  const saints = { ...draft.payload, revision: 4, approval_id: owner.approval_id, review_status: 'approved' };
  const saintsBytes = compact(saints); assert.equal(parseSaintsPayload(saintsBytes).valid, true);
  const organizations = parse(charitySnapshot.contents.get('data/organizations-v1.json'));
  const review = parse(charitySnapshot.contents.get('review-policy.json'));
  assert.ok(Date.parse(now) - Date.parse(review.verified_at) <= 86400000, 'Charity source review older than 24 hours: fresh reviewed snapshot required');
  assert.ok(Date.parse(now) >= Date.parse(review.verified_at));
  organizations.dataset_kind = 'reviewed';
  for (const org of organizations.organizations) { org.status = 'active'; for (const link of org.links) link.status = 'active'; }
  const catalog = structuredClone(inputs.catalog);
  catalog.version = '2026.9.30'; catalog.revision = 6; catalog.approval_id = owner.approval_id;
  assert.equal(catalog.article_bindings.length, 1);
  Object.assign(catalog.article_bindings[0], { version: saints.version, revision: saints.revision, sha256: sha256(saintsBytes) });
  const linkReviews = [];
  for (const proposal of saintsSnapshot.candidate.proposed_article_links) {
    const day = saints.days.find(x => x.date === proposal.date);
    assert.ok(day.article_ids.includes(proposal.article_id));
    const occurrences = catalog.occurrences.filter(x => x.date === proposal.date && x.observance_id === proposal.observance_id && x.review_status === 'reviewed');
    assert.equal(occurrences.length, 1);
    const occurrence = occurrences[0];
    assert.equal(occurrence.julian_date, day.julian_date); assert.deepEqual(occurrence.calendar_title, day.calendar_title); assert.deepEqual(occurrence.calendar_source_ids, day.calendar_source_ids);
    assert.ok(!catalog.article_links.some(x => x.observance_id === proposal.observance_id));
    catalog.article_links.push({ observance_id: proposal.observance_id, article_binding_id: catalog.article_bindings[0].id, article_id: proposal.article_id, source_ids: [...occurrence.source_ids], review_status: 'reviewed' });
    linkReviews.push({ ...proposal, review: 'technical_identity_date_and_same_generation_binding', owner_proposal_accepted: true, date_and_title_match_approved_calendar: true, new_canonical_subject_created: false });
  }
  const catalogBytes = compact(catalog); assert.equal(parseCatalogPayload(catalogBytes).valid, true);
  const oldBrowser = payloadHost(base.files, base.set, 'calendar-browser-v1').payload;
  const browser = structuredClone(oldBrowser);
  browser.version = '2026.9.30'; browser.revision = 2; browser.approval_id = owner.approval_id;
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: sha256(catalogBytes) });
  const browserBytes = compact(browser); assert.equal(parseCalendarBrowserPayload(browserBytes).valid, true);
  const radio = parse(radioSnapshot.contents.get('candidate.json'));
  assert.equal(radio.valid_added.length, 30); assert.equal(radioSnapshot.candidate.owner_status, 'APPROVED_AS_RADIO_SOURCE_PROPOSALS_ONLY');
  assert.ok(radio.valid_added.every(x => x.service_assignment_status === 'UNRESOLVED' && x.production_eligible === false && x.validation_errors.length === 0 && !['2026-04-09', '2026-10-16'].includes(x.date)));
  // Radio remains source evidence in the local review report, never a new
  // runtime Gospel assignment or an extra private review file in public payloads.
  const files = new Map(base.files), documents = [], replacements = new Map(), prefix = `releases/${REFRESH_ID}`;
  for (const [id, type, payload, bytes, dependencies] of [
    ['organizations-v1', 'organizations', organizations, json(organizations), []],
    ['saints-v1', 'library', saints, saintsBytes, [{ module_id: saints.calendar_binding.module_id, version: saints.calendar_binding.version }]],
    ['liturgical-catalog-v1', 'library', catalog, catalogBytes, catalogDependencies(catalog)],
    ['calendar-browser-v1', 'library', browser, browserBytes, []]
  ]) {
    const root = `${prefix}/modules/${id}-${payload.version}-r${payload.revision}`, path = `data/${id}.json`;
    files.set(`${root}/${path}`, bytes);
    const manifestBytes = json({ schema_version: 'svetlost33-module-manifest-2', module_id: id, module_type: type, version: payload.version, revision: payload.revision, key_id: KEY_ID, capabilities: [id], dependencies, files: [record(path, bytes)] });
    const manifestPath = `${root}/manifest.json`, signaturePath = `${root}/manifest.sig`;
    files.set(manifestPath, manifestBytes); documents.push([manifestPath, signaturePath]);
    replacements.set(id, { module_id: id, module_type: type, version: payload.version, required: false, manifest_path: manifestPath, manifest_bytes: manifestBytes.length, manifest_sha256: sha256(manifestBytes), signature_path: signaturePath });
  }
  const set = { ...base.set, release_set_id: REFRESH_ID, sequence: REFRESH_SEQUENCE, modules: base.set.modules.map(x => replacements.get(x.module_id) ?? x) };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set); files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...base.index, sequence: REFRESH_SEQUENCE, issued_at: PREPARED_AT, channels: { production: { release_set_id: REFRESH_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes); documents.push([releasePath, `${prefix}/release-set.sig`], ['index.json', 'index.sig']);
  const payloads = { saints, organizations, catalog, browser };
  const preflight = refreshPreflight({ files, set, indexBytes, payloads, now });
  const request = { schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: REFRESH_ID, sequence: REFRESH_SEQUENCE, key_id: KEY_ID,
    expected_public_key_sha256: PUBLIC_KEY_SHA256, source_index_sha256: S10_INDEX_SHA256, source_release_sha256: S10_RELEASE_SHA256,
    owner_approval_path: OWNER_PATH, owner_approval_sha256: OWNER_SHA256, minimum_clients: set.min_clients,
    preserved_module_ids: PRESERVED_IDS, replaced_module_ids: REPLACED_IDS,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    production_signing_and_activation_require_coordinator_go: true, source_freshness_deadline: '2026-10-01T10:55:30Z',
    documents_to_sign: documents.map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    payloads: [...replacements].map(([id, entry]) => ({ module_id: id, ...parse(files.get(entry.manifest_path)).files[0] })),
    preflight,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  const report = { status: 'UNSIGNED_TECHNICAL_PROMOTION_NOT_PUBLISHED', public_payloads_contain_private_review_notes: false,
    metadata_only_promotions: ['saints approval/version/revision', 'organizations draft-to-reviewed/active only', 'catalog exact saints binding plus two owner-approved article links', 'browser exact catalog binding and technical version only'],
    canonical_link_reviews: linkReviews, source_limitations: owner.candidates.filter(x => !x.id.startsWith('feast-')).map(x => ({ id: x.id, limitations: x.source_limitations_preserved })),
    radio_proposals: { count: radio.valid_added.length, classification: 'radio_only_not_liturgical_assignment', runtime_calendar_modified: false, source_candidate_sha256: sha256(radioSnapshot.contents.get('candidate.json')), valid_dates: radio.valid_added.map(x => x.date), service_assignment_status: 'UNRESOLVED' },
    omitted: ['seven media backgrounds pending separate OTA compatibility', 'charity logos and payment rails', 'paused liturgical text', '2027 content', 'new radio runtime annual decisions'],
    remaining_gates: ['independent candidate review', 'both native exact final bytes acceptance', 'freshness check at signing/publication', 'explicit coordinator signing and activation', 'public HTTPS readback and hashes'], preflight };
  files.set('signing-request.json', json(request));
  // This local report is not part of files and must not be copied to production.
  return { files, request, report, payloads, set, base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 2 && args[0] === '--out', 'Usage: prepare-shared-refresh-release-v2.mjs --out <new-unsigned-directory>');
  const plan = await createSharedRefreshPlan();
  await assertNoSymlinkPath(args[1], { allowMissing: true }); await writeNewTree(args[1], plan.files);
  console.log(JSON.stringify({ request: plan.request, report: plan.report }, null, 2));
}
