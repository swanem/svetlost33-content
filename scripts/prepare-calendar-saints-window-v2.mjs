#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, KEY_ID, PUBLIC_KEY_SHA256, json, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { readRefreshInput, refreshPreflight } from './prepare-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_CAPABILITIES, CALENDAR_BROWSER_PROFILES } from './prepare-calendar-browser-release-v2.mjs';
import { catalogDependencies, parseCatalogPayload } from './validate-liturgical-catalog-v1.mjs';
import { parseCalendarBrowserPayload } from './validate-calendar-browser-v1.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export const WINDOW_RELEASE_ID = 'shared-calendar-saints-2026-10-02-m0v2-s12';
export const WINDOW_SEQUENCE = 12;
export const WINDOW_PREPARED_AT = '2026-10-02T09:02:02Z';
export const S11_ID = 'shared-content-refresh-2026-09-30-m0v2-s11';
export const S11_INDEX_SHA256 = '36d39ce8882df55b66987afedcb8f080f31c2b8fd565a45561492aae5e2631ff';
export const S11_RELEASE_SHA256 = 'ef109fcdb5ef14baae8697664e447a1c17378030e57f1209cb3fa2510cbf13d3';
export const S11_ARCHIVE = `discovery-archive/${S11_ID}`;
export const WINDOW_APPROVAL_PATH = 'approvals/calendar-saints-window-2026-10-02/owner-approval.json';
export const WINDOW_APPROVAL_SHA256 = '15a5c33a13cfb572c2861e20463b49fd073164118375d86c97216472c2d1ae71';
export const WINDOW_PUBLIC_BASE_PATH = 'approvals/calendar-saints-window-2026-10-02/public-base-observation.json';
export const WINDOW_PUBLIC_BASE_SHA256 = '8ed99f2af511f93999c1d8a0e71a78aa0c763d70e54e0f2bd9496d81041874e6';
export const WINDOW_PRESERVED_IDS = ['library-annual-2026-r1', 'daily-cycles-r1', 'calendar-2026-r1', 'organizations-v1', 'saints-v1'];
export const WINDOW_REPLACED_IDS = ['liturgical-catalog-v1', 'calendar-browser-v1'];
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
const safe = path => {
  assert.ok(typeof path === 'string' && path.length <= 240 && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe source path: ${path}`);
  return path;
};
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

/** Pinned current S11 or its preserved archive. Real RSA verification, not trusted flags. */
export async function loadWindowS11Base({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  await assertNoSymlinkPath(sourceDirectory);
  const files = new Map();
  const capture = async path => {
    safe(path);
    if (!files.has(path)) files.set(path, await readRefreshInput(resolve(sourceDirectory, path)));
    return files.get(path);
  };
  const keyBytes = await capture('trusted-public-key.pem');
  assert.equal(sha256(keyBytes), PUBLIC_KEY_SHA256, 'Existing production trust anchor');
  const key = createPublicKey(keyBytes);
  const signed = async (path, signaturePath) => {
    const bytes = await capture(path), signature = await capture(signaturePath);
    assert.ok(signature.every(byte => byte < 128), 'ASCII signature');
    const encoded = signature.toString('ascii');
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\n$/u);
    assert.equal(Buffer.from(encoded.trim(), 'base64').toString('base64'), encoded.trim());
    assert.ok(verify('sha256', bytes, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(encoded.trim(), 'base64')), `Source signature: ${path}`);
    return parse(bytes);
  };
  const indexPath = archived ? `${S11_ARCHIVE}/index.json` : 'index.json';
  const indexSignaturePath = archived ? `${S11_ARCHIVE}/index.sig` : 'index.sig';
  assert.equal(sha256(await capture(indexPath)), S11_INDEX_SHA256, 'S11 source discovery advanced: replan required');
  const index = await signed(indexPath, indexSignaturePath);
  assert.equal(index.sequence, 11);
  assert.ok(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(index.issued_at) && Date.parse(now) < Date.parse(index.expires_at), 'Source discovery time/freshness');
  const pointer = index.channels.production;
  assert.equal(pointer.release_set_id, S11_ID); assert.equal(pointer.sha256, S11_RELEASE_SHA256);
  const releaseBytes = await capture(pointer.path);
  assert.equal(releaseBytes.length, pointer.bytes); assert.equal(sha256(releaseBytes), pointer.sha256);
  const set = await signed(pointer.path, pointer.signature_path);
  assert.deepEqual(set.modules.map(item => item.module_id), [...WINDOW_PRESERVED_IDS, ...WINDOW_REPLACED_IDS]);
  assert.deepEqual(set.approved_platforms, ['android', 'ios']);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  for (const entry of set.modules) {
    const raw = await capture(entry.manifest_path);
    assert.equal(raw.length, entry.manifest_bytes); assert.equal(sha256(raw), entry.manifest_sha256);
    const manifest = await signed(entry.manifest_path, entry.signature_path);
    for (const item of manifest.files) {
      safe(item.path);
      const bytes = await capture(`${dirname(entry.manifest_path)}/${item.path}`);
      assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
    }
  }
  // Full capabilities authenticate every payload; candidate tests separately exercise all 24 profiles.
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID,
      minimumSequence: 11, clientCapabilities: CALENDAR_BROWSER_CAPABILITIES, indexPath, indexSignaturePath });
  }
  files.set(`${S11_ARCHIVE}/index.json`, files.get(indexPath));
  files.set(`${S11_ARCHIVE}/index.sig`, files.get(indexSignaturePath));
  files.delete('index.json'); files.delete('index.sig');
  return { files, set, index };
}

function payload(base, id) {
  const entry = base.set.modules.find(item => item.module_id === id);
  const manifest = parse(base.files.get(entry.manifest_path));
  return parse(base.files.get(`${dirname(entry.manifest_path)}/data/${id}.json`));
}

export async function assertWindowApproval() {
  const raw = await readRefreshInput(resolve(ROOT, WINDOW_APPROVAL_PATH));
  assert.equal(sha256(raw), WINDOW_APPROVAL_SHA256, 'Exact additive owner approval');
  const owner = parse(raw);
  assert.deepEqual(owner.platforms, ['android', 'ios']);
  assert.equal(owner.candidate.status, 'APPROVED');
  assert.equal(owner.publication.authorized_after_successful_checks, true);
  assert.equal(owner.publication.production_signing_requires_coordinator_go, true);
  assert.equal(owner.publication.both_native_exact_generation_acceptance_required_before_activation, true);
  const candidate = await readRefreshInput(resolve(ROOT, safe(owner.candidate.path)));
  assert.equal(candidate.length, owner.candidate.bytes); assert.equal(sha256(candidate), owner.candidate.sha256);
  for (const kind of ['delta', 'handoff']) {
    assert.equal(sha256(await readRefreshInput(resolve(ROOT, safe(owner.candidate[`${kind}_path`])))), owner.candidate[`${kind}_sha256`]);
  }
  const observation = await readRefreshInput(resolve(ROOT, WINDOW_PUBLIC_BASE_PATH));
  assert.equal(sha256(observation), WINDOW_PUBLIC_BASE_SHA256, 'Exact public baseline observation');
  assert.equal(parse(observation).index_sha256, S11_INDEX_SHA256);
  assert.equal(parse(observation).commit, 'e59bfa36bed840e751f7dbe5e0b7fa1e86cbced0');
  return { owner, pending: parse(candidate) };
}

export async function createCalendarSaintsWindowPlan({ sourceDirectory = BASE, now = new Date().toISOString(), archived = false } = {}) {
  assert.ok(Number.isFinite(Date.parse(now)) && Date.parse(now) >= Date.parse(WINDOW_PREPARED_AT), 'Valid preparation time');
  const base = await loadWindowS11Base({ sourceDirectory, now, archived });
  const { owner, pending } = await assertWindowApproval();
  assert.ok(Date.parse(owner.recorded_at) <= Date.parse(now));
  assert.equal(pending.review_status, 'pending'); assert.equal(pending.approval_id, null);
  const catalog = structuredClone(pending);
  catalog.review_status = 'approved'; catalog.approval_id = owner.approval_id;
  const catalogBytes = json(catalog);
  assert.equal(parseCatalogPayload(catalogBytes).valid, true);
  const beforeCatalog = payload(base, 'liturgical-catalog-v1');
  for (const name of ['subjects', 'observances', 'occurrences', 'article_links']) assert.deepEqual(catalog[name].slice(0, beforeCatalog[name].length), beforeCatalog[name]);
  assert.deepEqual(catalog.calendar_bindings, beforeCatalog.calendar_bindings);
  assert.deepEqual(catalog.article_bindings, beforeCatalog.article_bindings);
  assert.deepEqual(catalog.sources, beforeCatalog.sources);
  assert.deepEqual([catalog.subjects.length, catalog.observances.length, catalog.occurrences.length, catalog.article_links.length], [18, 34, 32, 11]);
  const browser = structuredClone(payload(base, 'calendar-browser-v1'));
  Object.assign(browser, { version: '2026.10.2', revision: 3, approval_id: owner.approval_id });
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: sha256(catalogBytes) });
  const browserBytes = json(browser);
  assert.equal(parseCalendarBrowserPayload(browserBytes).valid, true);
  const files = new Map(base.files), replacements = new Map(), documents = [];
  const prefix = `releases/${WINDOW_RELEASE_ID}`;
  for (const [id, value, bytes, dependencies] of [
    ['liturgical-catalog-v1', catalog, catalogBytes, catalogDependencies(catalog)],
    ['calendar-browser-v1', browser, browserBytes, []],
  ]) {
    const root = `${prefix}/modules/${id}-${value.version}-r${value.revision}`;
    const path = `data/${id}.json`, manifestPath = `${root}/manifest.json`, signaturePath = `${root}/manifest.sig`;
    files.set(`${root}/${path}`, bytes);
    const manifest = json({ schema_version: 'svetlost33-module-manifest-2', module_id: id, module_type: 'library',
      version: value.version, revision: value.revision, key_id: KEY_ID, capabilities: [id], dependencies, files: [record(path, bytes)] });
    files.set(manifestPath, manifest); documents.push([manifestPath, signaturePath]);
    replacements.set(id, { module_id: id, module_type: 'library', version: value.version, required: false,
      manifest_path: manifestPath, manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), signature_path: signaturePath });
  }
  const set = { ...base.set, release_set_id: WINDOW_RELEASE_ID, sequence: WINDOW_SEQUENCE,
    modules: base.set.modules.map(entry => replacements.get(entry.module_id) ?? entry) };
  const releasePath = `${prefix}/release-set.json`, releaseBytes = json(set);
  files.set(releasePath, releaseBytes); documents.push([releasePath, `${prefix}/release-set.sig`]);
  const indexBytes = json({ ...base.index, sequence: WINDOW_SEQUENCE, issued_at: WINDOW_PREPARED_AT,
    channels: { production: { release_set_id: WINDOW_RELEASE_ID, path: releasePath, bytes: releaseBytes.length,
      sha256: sha256(releaseBytes), signature_path: `${prefix}/release-set.sig` } } });
  files.set('index.json', indexBytes); documents.push(['index.json', 'index.sig']);
  const payloads = { catalog, browser, saints: payload(base, 'saints-v1'), organizations: payload(base, 'organizations-v1') };
  const preflight = refreshPreflight({ files, set, indexBytes, payloads, now });
  const publishPaths = [...files.keys()].filter(path => path === 'index.json' || path.startsWith(`${prefix}/`) || path.startsWith(`${S11_ARCHIVE}/`));
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: WINDOW_RELEASE_ID, sequence: WINDOW_SEQUENCE,
    key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: S11_INDEX_SHA256, source_release_sha256: S11_RELEASE_SHA256,
    source_public_commit: 'e59bfa36bed840e751f7dbe5e0b7fa1e86cbced0',
    owner_approval_path: WINDOW_APPROVAL_PATH, owner_approval_sha256: WINDOW_APPROVAL_SHA256,
    public_base_observation_path: WINDOW_PUBLIC_BASE_PATH, public_base_observation_sha256: WINDOW_PUBLIC_BASE_SHA256,
    minimum_clients: set.min_clients, preserved_module_ids: WINDOW_PRESERVED_IDS, replaced_module_ids: WINDOW_REPLACED_IDS,
    signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32, signature_encoding: 'base64-with-final-newline',
    production_signing_and_activation_require_coordinator_go: true,
    native_exact_generation_acceptance_required_before_activation: true,
    public_baseline_recheck_required_at_signing_and_publication: true,
    documents_to_sign: documents.map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    publication_allowlist: [...publishPaths, ...documents.map(([, signature]) => signature)].sort(),
    publication_unsigned_files: publishPaths.sort().map(path => ({ path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    preflight,
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')),
  };
  assert.equal(new Set(request.publication_allowlist).size, request.publication_allowlist.length);
  assert.equal(request.publication_allowlist.length, 12);
  const report = {
    status: 'UNSIGNED_S12_CANDIDATE_NOT_PUBLISHED', source_release_set_id: S11_ID, source_index_sha256: S11_INDEX_SHA256,
    release_set_id: WINDOW_RELEASE_ID, sequence: WINDOW_SEQUENCE,
    index_sha256: sha256(indexBytes), release_sha256: sha256(releaseBytes), catalog_sha256: sha256(catalogBytes), browser_sha256: sha256(browserBytes),
    changes: { subjects: 6, observances: 7, occurrences: 7, existing_article_links: 7, new_articles: 0, annual_calendar_days: 0, archive_facts: 0, images: 0 },
    source_rights_and_review_dates_unchanged: true, public_payloads_contain_private_review_notes: false,
    preserved_unknowns: ['Seven daily Gospels 2026-10-02 through 2026-10-08 remain UNRESOLVED', '2026-10-02 fasting rule remains UNKNOWN'],
    preserved_published_articles: 62, preserved_prior_article_links: 4,
    preflight, unsigned_documents: documents.length, public_delta_files_after_signing: request.publication_allowlist.length,
    remaining_gates: ['coordinator exact candidate review', 'fresh public baseline recheck', 'production-key signing by root only',
      '24 exact production signature/profile checks', 'both native exact generation acceptance', 'atomic public discovery commit', 'HTTPS exact readback'],
  };
  files.set('signing-request.json', json(request));
  return { files, request, report, payloads, set, base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = new Map();
  for (let n = 0; n < args.length; n += 2) {
    assert.ok(['--source', '--out'].includes(args[n]) && args[n + 1] && !values.has(args[n]), 'Usage: --source <verified-S11-production-directory> --out <new-unsigned-directory>');
    values.set(args[n], args[n + 1]);
  }
  assert.equal(values.size, 2);
  const plan = await createCalendarSaintsWindowPlan({ sourceDirectory: values.get('--source') });
  await assertNoSymlinkPath(values.get('--out'), { allowMissing: true });
  await writeNewTree(values.get('--out'), plan.files);
  console.log(JSON.stringify({ request: plan.request, report: plan.report }, null, 2));
}
