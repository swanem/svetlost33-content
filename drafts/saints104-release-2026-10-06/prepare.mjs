#!/usr/bin/env node
// Approved-copy assembler only. Production discovery and pending originals are read-only.
import assert from 'node:assert/strict';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, PUBLIC_KEY_SHA256, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_CAPABILITIES, CALENDAR_BROWSER_PROFILES } from '../../scripts/prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { SAINTS_MODULE } from '../../scripts/validate-saints-v1.mjs';
import { CATALOG_MODULE } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE } from '../../scripts/validate-calendar-browser-v1.mjs';
import { validateOrganizationsRegistry } from '../../scripts/validate-organizations-v1.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const RELEASE_ID = 'shared-saints104-2026-10-06-m0v2-s13';
export const SEQUENCE = 13;
export const PREPARED_AT = '2026-10-06T16:04:00Z';
export const APPROVAL_PATH = 'approvals/saints104-2026-10-06/owner-publication-approval.json';
export const APPROVAL_SHA = '3cd32c026190cbf30054f52d0ff742cf2d1bc53b7013348cbe662e1325902629';
export const APPROVAL_ID = 'saints104-2026-10-06-owner-r1';
export const OBSERVATION_PATH = 'drafts/saints104-release-2026-10-06/public-baseline-s12.json';
export const OBSERVATION_SHA = '2f84403ed6493fb833504e2a4998fd9e937d59595a8180bfcd9909802de81b96';
export const S12_ID = 'shared-calendar-saints-2026-10-02-m0v2-s12';
export const S12_INDEX_SHA = 'a0d50c23036db203035419f4ba169ddb6005223799ed3ac4e89e03dd9f7733e9';
export const S12_RELEASE_SHA = '78142e24f74812be9859b88163203de23517a9ed40a16c0f5ee085e25354255d';
export const S12_ARCHIVE = `discovery-archive/${S12_ID}`;
export const PUBLIC_COMMIT = '16f1fe741aaad2450fe66a0832c28c1b3e891502';
export const PRESERVED = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1'];
export const REPLACED = ['saints-v1', 'liturgical-catalog-v1', 'calendar-browser-v1'];
export const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const exact = (a, b, keys, label) => { for (const key of keys) assert.equal(a[key], b[key], `${label}: ${key}`); };
const safe = path => {
  assert.ok(typeof path === 'string' && path.length <= 240 && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(p => p && p !== '.' && p !== '..'), `Unsafe path: ${path}`);
  return path;
};

/** Re-read the exact owner-attested manuscripts/reviews, including transitive frozen handoff artifacts. */
export async function approvedInputs() {
  const pins = new Map();
  const pinned = async (path, hash) => {
    const bytes = await readRefreshInput(resolve(ROOT, safe(path)));
    assert.equal(sha256(bytes), hash, `Exact approved input: ${path}`);
    pins.set(path, record(path, bytes)); return bytes;
  };
  const owner = parse(await pinned(APPROVAL_PATH, APPROVAL_SHA));
  assert.equal(owner.status, 'USER_AUTHORIZED_EXACT_NEW_COLLECTION_PUBLICATION_AFTER_TECHNICAL_ACCEPTANCE');
  assert.equal(owner.approved_copy_only, true); assert.equal(owner.preserve_original_pending_drafts, true);
  assert.equal(owner.clerical_review, null); assert.equal(owner.independent_legal_clearance, null);
  const review = 'drafts/saints-year-end-review-2026-10-06';
  for (const block of [1, 2]) {
    const dir = `drafts/saints-year-end-block${block}-2026-10-06`;
    const handoff = parse(await pinned(`${dir}/handoff.json`, owner.pins_verified_by_root[`block${block}_handoff`]));
    await pinned(`${dir}/root-content-review-r1.json`, owner.pins_verified_by_root[`block${block}_independent_review`]);
    for (const file of handoff.artifacts) await pinned(`${dir}/${safe(file.path)}`, file.sha256);
  }
  for (const name of ['PREGLED-CIRILICA.md', 'PREGLED-LATINICA.md']) await pinned(`${review}/${name}`, owner.pins_verified_by_root[name]);
  const question = await readRefreshInput(resolve(ROOT, owner.resolves_question_in));
  assert.deepEqual(parse(question).pins, owner.pins_verified_by_root);
  pins.set(owner.resolves_question_in, record(owner.resolves_question_in, question));
  // The pure master is imported only after its owner-pinned source and data were checked.
  const { prepare } = await import('../saints-year-end-block2-2026-10-06/prepare.mjs');
  const draft = await prepare();
  for (const [name, expected] of [['saints', '34aaa713f61e57990b0d3f85e62c69f5bda661f4db08f569cf6a9d6635006832'],
    ['catalog', 'cca6c025c025797f5e0bcc50b89903bbedaa9d10ad094eccfc1335b529d8d7e0'], ['browser', 'cf12a20df56122ec1130017841a7d6d2de90af934463e1054cc257c0c98dd8e7']]) {
    assert.equal(sha256(draft.combined[`${name}Bytes`]), expected, `Frozen real master: ${name}`);
  }
  return { owner, draft, protected_inputs: [...pins.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}

/** Exact 50-file HTTPS inventory + real existing RSA graph validation, not caller authentication flags. */
export async function loadS12({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  const observationBytes = await readRefreshInput(resolve(ROOT, OBSERVATION_PATH));
  assert.equal(sha256(observationBytes), OBSERVATION_SHA);
  const observation = parse(observationBytes);
  assert.equal(observation.status, 'PASS'); assert.equal(observation.fetched_files, 50);
  assert.equal(observation.shared_profile_checks, 24); assert.equal(observation.discovery_pair_rechecked, true);
  assert.equal(observation.index_sha256, S12_INDEX_SHA);
  const files = new Map();
  for (const item of observation.files) {
    const path = archived && ['index.json', 'index.sig'].includes(item.path) ? `${S12_ARCHIVE}/${item.path}` : item.path;
    const bytes = await readRefreshInput(resolve(sourceDirectory, safe(path)));
    assert.equal(bytes.length, item.bytes, `Pinned S12 bytes: ${path}`);
    assert.equal(sha256(bytes), item.sha256, `Pinned S12 hash: ${path}`); files.set(path, bytes);
  }
  assert.equal(sha256(files.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256);
  const indexPath = archived ? `${S12_ARCHIVE}/index.json` : 'index.json';
  const indexSignaturePath = archived ? `${S12_ARCHIVE}/index.sig` : 'index.sig';
  const index = parse(files.get(indexPath)); assert.equal(index.sequence, 12);
  assert.equal(index.channels.production.sha256, S12_RELEASE_SHA);
  const set = parse(files.get(index.channels.production.path));
  assert.deepEqual(set.modules.map(x => x.module_id), [...PRESERVED, ...REPLACED]);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    const result = await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      minimumSequence: 12, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES, indexPath, indexSignaturePath });
    assert.equal(result.releaseSetId, S12_ID); assert.equal(result.verifiedModules, 7);
  }
  files.set(`${S12_ARCHIVE}/index.json`, files.get(indexPath));
  files.set(`${S12_ARCHIVE}/index.sig`, files.get(indexSignaturePath));
  files.delete('index.json'); files.delete('index.sig');
  return { files, set, index, observation };
}

export function host(files, set, id, path = `data/${id}.json`) {
  const entry = set.modules.find(x => x.module_id === id); assert.ok(entry);
  const bytes = files.get(entry.manifest_path); assert.equal(sha256(bytes), entry.manifest_sha256);
  const manifest = parse(bytes), item = manifest.files.find(x => x.path === path); assert.ok(item);
  const raw = files.get(`${dirname(entry.manifest_path)}/${path}`);
  assert.equal(raw.length, item.bytes); assert.equal(sha256(raw), item.sha256);
  return { module_id: id, version: manifest.version, revision: manifest.revision, path, sha256: sha256(raw), payload: parse(raw) };
}

/** Local domain simulation; these contexts are never serialized as native authentication evidence. */
export function preflight({ files, set, indexBytes, payloads, now }) {
  const { saints, catalog, browser } = payloads;
  const generation = { id: set.release_set_id, sequence: set.sequence, decision_sha256: sha256(indexBytes) };
  const bound = binding => {
    const value = host(files, set, binding.module_id, binding.path);
    exact(value, binding, ['module_id', 'version', 'revision', 'path', 'sha256'], 'Exact same-generation payload binding');
    return { ...value, generation, authenticated: true };
  };
  const calendarContexts = catalog.calendar_bindings.map(binding => { const h = bound(binding); return { ...h, year: h.payload.civil_year, days: h.payload.days }; });
  const articleContexts = catalog.article_bindings.map(binding => { const h = bound(binding); return { ...h, review_status: h.payload.review_status, calendar_binding: h.payload.calendar_binding, articles: h.payload.articles.map(x => ({ id: x.id, type: x.type })) }; });
  const catalogContext = { generation, contentAuthenticated: true, moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, generation, dependencies: profile.catalog.catalogDependencies(catalog) }, calendarContexts, articleContexts };
  assert.deepEqual(profile.catalog.evaluateCatalog(catalog, catalogContext), { eligible: true, reason: null });
  const calendar = bound(saints.calendar_binding);
  for (const day of saints.days) assert.equal(profile.saints.evaluateSaintsDay(saints, { contentAuthenticated: true,
    moduleContext: { ...SAINTS_MODULE, version: saints.version, revision: saints.revision }, calendarAuthenticated: true,
    calendarContext: { ...calendar, days: calendar.payload.days }, date: day.date }).eligible, true, day.date);
  for (const link of catalog.article_links) assert.ok(articleContexts.some(h => h.articles.some(a => a.id === link.article_id)));
  const projection = (id, locale) => {
    const entry = set.modules.find(x => x.module_id === id), manifest = parse(files.get(entry.manifest_path));
    const read = name => parse(files.get(`${dirname(entry.manifest_path)}/data/${name}.${locale}.json`));
    const identity = { module_id: id, version: entry.version, revision: manifest.revision, manifest_sha256: entry.manifest_sha256 };
    return id === 'daily-cycles-r1' ? { ...identity, days: read('legacy-cycle').days.map(day => ({ id: day.id, cycle_day: day.cycle_day, slots: day.slots.map(slot => ({ id: slot.id, phase: slot.phase, psalm_id: slot.quote.psalm_id, verse_numbers: slot.quote.verse_numbers, prayer_id: slot.prayer_id })) })) }
      : { ...identity, psalms: read('psalms').psalms.map(p => ({ id: p.id, verse_numbers: p.verses.map(x => x.number) })), prayer_ids: read('prayers').prayers.map(x => x.id) };
  };
  const projected = ['sr-Cyrl', 'sr-Latn'].map(locale => ({ library: projection('library-annual-2026-r1', locale), cycles: projection('daily-cycles-r1', locale) }));
  assert.deepEqual(projected[0], projected[1]);
  const archiveContexts = browser.archive_bindings.map(binding => {
    for (const name of ['library', 'cycles']) exact(projected[0][name], binding[`${name}_binding`], ['module_id', 'version', 'revision', 'manifest_sha256'], 'Archive binding');
    return { ...projected[0], generation, authenticated: true, review_status: 'approved', binding_id: binding.id };
  });
  const browserContext = { generation, contentAuthenticated: true, moduleContext: { ...CALENDAR_BROWSER_MODULE, version: browser.version, revision: browser.revision, generation, dependencies: [] }, catalogContext: { ...bound(browser.catalog_binding), context: catalogContext }, archiveContexts };
  assert.deepEqual(profile.browser.evaluateCalendarBrowser(browser, browserContext), { eligible: true, reason: null });
  for (const locale of ['sr-Cyrl', 'sr-Latn']) assert.equal(profile.browser.upcomingBrowserFeasts(browser, browserContext, { from_date: '2026-01-01', locale }).items.length, 21);
  for (const day of browser.archive_days) {
    const result = profile.browser.resolveBrowserArchiveDay(browser, browserContext, { date: day.date });
    assert.equal(result.state, day.status); assert.ok(result.phases.every(x => x.state === 'available'));
  }
  const org = host(files, set, 'organizations-v1').payload;
  const result = validateOrganizationsRegistry(org, { now, contentAuthenticated: true, paymentSessionFresh: true,
    clientCapabilities: ['organizations-v1'], moduleContext: { module_type: 'organizations', required: false, capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json', version: org.version, revision: org.revision } });
  assert.equal(result.registry_eligible, true); assert.ok(result.organizations.every(o => o.links.every(l => l.enabled)));
  assert.equal(profile.catalog.evaluateCatalog(catalog).reason, 'content_not_authenticated');
  assert.equal(profile.browser.evaluateCalendarBrowser(browser).reason, 'content_not_authenticated');
  return { state: 'EDITORIAL_SIMULATION_ONLY', runtime_authenticated: false, profile: profile.id,
    saints_articles: saints.articles.length, saints_sources: saints.sources.length, saints_days: saints.days.length,
    catalog_sources: catalog.sources.length, subjects: catalog.subjects.length, observances: catalog.observances.length,
    occurrences: catalog.occurrences.length, article_links: catalog.article_links.length,
    feast_memberships: browser.feast_memberships.length, archive_days: browser.archive_days.length, organizations: org.organizations.length };
}

export async function createPlan({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  assert.ok(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(PREPARED_AT), 'Preparation time');
  const base = await loadS12({ sourceDirectory, now, archived });
  const approved = await approvedInputs(), { owner, draft } = approved;
  assert.ok(Date.parse(owner.recorded_at_utc) <= Date.parse(PREPARED_AT));
  for (const [id, name] of [['saints-v1', 'beforeSaints'], ['liturgical-catalog-v1', 'beforeCatalog'], ['calendar-browser-v1', 'beforeBrowser']]) assert.deepEqual(host(base.files, base.set, id).payload, draft[name]);
  const { saints, catalog, browser } = structuredClone(draft.combined);
  for (const [value, revision] of [[saints, 5], [catalog, 8], [browser, 4]]) Object.assign(value, { version: '2026.10.6', revision, review_status: 'approved', approval_id: APPROVAL_ID });
  // Only the separately approved new editorial records change review flags; all rights/provenance stay exact.
  for (const kind of ['sources', 'subjects', 'observances', 'occurrences', 'article_links']) {
    for (const row of catalog[kind].slice(draft.beforeCatalog[kind].length)) { assert.equal(row.review_status, 'pending'); row.review_status = 'reviewed'; }
    assert.deepEqual(catalog[kind].slice(0, draft.beforeCatalog[kind].length), draft.beforeCatalog[kind]);
  }
  assert.deepEqual(saints.articles, draft.combined.saints.articles); assert.equal(saints.articles.length, 104);
  assert.deepEqual(saints.articles.slice(0, 62), draft.beforeSaints.articles);
  assert.deepEqual(saints.sources, draft.combined.saints.sources); assert.deepEqual(saints.days, draft.combined.saints.days);
  const saintsBytes = json(saints);
  Object.assign(catalog.article_bindings.find(x => x.module_id === 'saints-v1'), { version: saints.version, revision: saints.revision, sha256: sha256(saintsBytes) });
  const catalogBytes = json(catalog);
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: sha256(catalogBytes) });
  const browserBytes = json(browser);
  for (const [name, result] of [['saints', profile.saints.parseSaintsPayload(saintsBytes)], ['catalog', profile.catalog.parseCatalogPayload(catalogBytes)], ['browser', profile.browser.parseCalendarBrowserPayload(browserBytes)]]) assert.equal(result.valid, true, `${name}: ${result.reason}`);
  const files = new Map(base.files), replacements = new Map(), documents = [], prefix = `releases/${RELEASE_ID}`;
  for (const [id, value, bytes, dependencies] of [['saints-v1', saints, saintsBytes, [{ module_id: saints.calendar_binding.module_id, version: saints.calendar_binding.version }]],
    ['liturgical-catalog-v1', catalog, catalogBytes, profile.catalog.catalogDependencies(catalog)], ['calendar-browser-v1', browser, browserBytes, []]]) {
    const root = `${prefix}/modules/${id}-${value.version}-r${value.revision}`, path = `data/${id}.json`;
    const manifestPath = `${root}/manifest.json`, signaturePath = `${root}/manifest.sig`;
    files.set(`${root}/${path}`, bytes);
    const manifest = json({ schema_version: 'svetlost33-module-manifest-2', module_id: id, module_type: 'library', version: value.version,
      revision: value.revision, key_id: KEY_ID, capabilities: [id], dependencies,
      files: [{ ...record(path, bytes), content_type: 'application/json', encoding: 'utf-8' }] });
    files.set(manifestPath, manifest); documents.push([manifestPath, signaturePath]);
    replacements.set(id, { module_id: id, module_type: 'library', version: value.version, required: false,
      manifest_path: manifestPath, manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), signature_path: signaturePath });
  }
  const set = { ...base.set, release_set_id: RELEASE_ID, sequence: SEQUENCE, min_clients: { android: 66, ios: '0.1.14' }, modules: base.set.modules.map(entry => replacements.get(entry.module_id) ?? entry) };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set);
  files.set(releasePath, releaseBytes); documents.push([releasePath, `${prefix}/release-set.sig`]);
  const indexBytes = json({ ...base.index, sequence: SEQUENCE, issued_at: PREPARED_AT, channels: { production: {
    release_set_id: RELEASE_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes); documents.push(['index.json', 'index.sig']);
  const payloads = { saints, catalog, browser };
  const checks = preflight({ files, set, indexBytes, payloads, now });
  const publishPaths = [...files.keys()].filter(path => path === 'index.json' || path.startsWith(`${prefix}/`) || path.startsWith(`${S12_ARCHIVE}/`));
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: RELEASE_ID, sequence: SEQUENCE,
    key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256, source_public_commit: PUBLIC_COMMIT,
    source_index_sha256: S12_INDEX_SHA, source_release_sha256: S12_RELEASE_SHA,
    owner_approval_path: APPROVAL_PATH, owner_approval_sha256: APPROVAL_SHA, approval_id: APPROVAL_ID,
    public_base_observation_path: OBSERVATION_PATH, public_base_observation_sha256: OBSERVATION_SHA,
    minimum_clients: set.min_clients, preserved_module_ids: PRESERVED, replaced_module_ids: REPLACED,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    production_signing_requires_separate_coordinator_go: true, native_exact_generation_acceptance_required_before_publication: true,
    publication_requires_public_head_compare_and_swap: PUBLIC_COMMIT,
    publication_immutable_paths: publishPaths.filter(path => path !== 'index.json').sort(),
    documents_to_sign: documents.map(([path, signature_path]) => ({ ...record(path, files.get(path)), signature_path })),
    publication_allowlist: [...publishPaths, ...documents.map(([, signature]) => signature)].sort(),
    all_candidate_files: [...files].map(([path, bytes]) => record(path, bytes)).sort((a, b) => a.path.localeCompare(b.path, 'en')),
    protected_inputs: approved.protected_inputs, preflight: checks,
  };
  assert.equal(new Set(request.publication_allowlist).size, 15); assert.equal(request.publication_allowlist.length, 15);
  const report = { status: 'UNSIGNED_S13_APPROVED_COPY_NOT_PUBLISHED', release_set_id: RELEASE_ID, sequence: SEQUENCE,
    source_index_sha256: S12_INDEX_SHA, index_sha256: sha256(indexBytes), release_sha256: sha256(releaseBytes),
    saints: record('data/saints-v1.json', saintsBytes), catalog: record('data/liturgical-catalog-v1.json', catalogBytes), browser: record('data/calendar-browser-v1.json', browserBytes),
    preflight: checks, old_articles_preserved: 62, new_authorized_original_articles: 42,
    rights: owner.rights_basis, source_page_rights_fields_unchanged: true, clergy_review: null, independent_legal_clearance: null,
    original_pending_drafts_unchanged: true, test_fixture_reused: false, packages_A_B_included: false,
    approval_id_binding: { id: APPROVAL_ID, path: APPROVAL_PATH, sha256: APPROVAL_SHA },
    unsigned_documents: 5, publication_delta_files_after_signing: 15,
    remaining_gates: ['root exact source/candidate review and signing GO', 'fresh public discovery and HEAD compare-and-swap at publication', 'existing-key local signing', 'both native exact S12→S13 functional/security/memory/retention acceptance; no speed work', 'narrow atomic publication and exact HTTPS readback'],
    native_pass: false, signed: false, published: false };
  files.set('signing-request.json', json(request));
  return { files, request, report, base, set, payloads, approved };
}

/** Host-side test descriptor, never a runtime payload or a native acceptance receipt. */
export function nativeDescriptor(plan) {
  const describe = (files, set, indexBytes) => ({ release_set_id: set.release_set_id, sequence: set.sequence,
    minimum_android_code: set.min_clients.android, index_sha256: sha256(indexBytes),
    release_sha256: parse(indexBytes).channels.production.sha256,
    article_count: host(files, set, 'saints-v1').payload.articles.length,
    article_links: host(files, set, 'liturgical-catalog-v1').payload.article_links.length,
    modules: set.modules.map(entry => { const manifest = parse(files.get(entry.manifest_path));
      return { module_id: entry.module_id, version: manifest.version, revision: manifest.revision, dependencies: manifest.dependencies }; }) });
  return { key_id: KEY_ID, trusted_pem_sha256: PUBLIC_KEY_SHA256,
    accepted_at: PREPARED_AT, // Harness validation clock anchor; not an assertion that native acceptance occurred.
    old: describe(plan.base.files, plan.base.set, plan.base.files.get(`${S12_ARCHIVE}/index.json`)),
    candidate: describe(plan.files, plan.set, plan.files.get('index.json')) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--write']);
  const plan = await createPlan();
  await writeNewTree(resolve(HERE, 'unsigned-s13'), plan.files);
  await writeNewTree(resolve(HERE, 'preparation'), new Map([['report.json', json(plan.report)], ['protected-inputs-before.json', json(plan.request.protected_inputs)]]));
  console.log(JSON.stringify(plan.report, null, 2));
}
