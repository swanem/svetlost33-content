#!/usr/bin/env node
// Isolated local TEST ONLY artifacts. Never reads or exports a private key file.
import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, sign } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../../drafts/saints-year-end-block2-2026-10-06/prepare.mjs';
import { json, hash, IDS, BASE, RELEASE, CLIENTS, TEST_NOW } from '../ks01-signed-transport-2026-10-06/generate.mjs';
import { SAINTS_MODULE } from '../../scripts/validate-saints-v1.mjs';
import { CATALOG_MODULE, catalogDependencies } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE } from '../../scripts/validate-calendar-browser-v1.mjs';

export { json, hash, IDS, CLIENTS, TEST_NOW };
export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const KEY_ID = 'ks01-real-draft104-test-key-1';
export const WARNING = 'TEST_ONLY_REAL_DRAFT_PROSE_PENDING_NOT_OWNER_OR_CHURCH_APPROVAL_NEVER_PUBLISH';
export const APPROVAL = 'test-only-real-draft104-not-owner-approval';
export const DECISION = '../svetlost33-github/docs/contracts/calendar-saints-expansion-2026-10-06/capacity-decision-r2-104-first.json';
export const DECISION_SHA = '80ef86e00a07b71dad509864ccc21cb3775d8a641a4e2c259b872b13621d9806';
export const SETS = [
  { name: 'baseline62', articles: 62, sequence: 200, expanded: false },
  { name: 'realDraft104', articles: 104, sequence: 201, expanded: true },
];
export const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });

export async function writeNew(outputs) {
  for (const path of outputs.keys()) {
    assert.ok(resolve(HERE, path).startsWith(`${HERE}/`));
    await access(resolve(HERE, path)).then(() => assert.fail(`Refusing overwrite: ${path}`), e => { if (e.code !== 'ENOENT') throw e; });
  }
  for (const [path, bytes] of outputs) {
    const target = resolve(HERE, path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
}

/** Copy-only promotion. No prose, bibliographic dates, rights or underlying annual facts change. */
export function testView(combined) {
  const view = Object.fromEntries(['saints', 'catalog', 'browser'].map(k => [k, structuredClone(combined[k])]));
  const changes = [];
  const change = (kind, path, value) => {
    const parts = path.split('/').slice(1); let at = view[kind];
    for (const key of parts.slice(0, -1)) at = at[key];
    const key = parts.at(-1), before = at[key];
    if (JSON.stringify(before) !== JSON.stringify(value)) {
      changes.push({ payload: kind, pointer: path, before, after: value }); at[key] = value;
    }
  };
  for (const kind of ['saints', 'catalog', 'browser']) {
    change(kind, '/review_status', 'approved'); change(kind, '/approval_id', APPROVAL);
  }
  for (const key of ['sources', 'subjects', 'observances', 'occurrences', 'day_reviews', 'article_links']) {
    view.catalog[key].forEach((row, i) => { if (row.review_status === 'pending') change('catalog', `/${key}/${i}/review_status`, 'reviewed'); });
  }
  const articleIndex = view.catalog.article_bindings.findIndex(x => x.module_id === IDS.saints);
  assert.ok(articleIndex >= 0);
  change('catalog', `/article_bindings/${articleIndex}/sha256`, hash(json(view.saints)));
  change('browser', '/catalog_binding/sha256', hash(json(view.catalog)));
  return { ...view, changes };
}

/** Sidecar reference contexts are derived from exact transport bytes, never native trust inputs. */
export function referenceContexts(tree, dataset) {
  const manifests = new Map(dataset.modules.map(m => [m.module_id, { entry: m, manifest: JSON.parse(tree.get(m.manifest_path)) }]));
  const payload = (id, path) => JSON.parse(tree.get(`modules/${id}/${path}`));
  const saints = payload(IDS.saints, 'data/saints-v1.json'), catalog = payload(IDS.catalog, 'data/liturgical-catalog-v1.json');
  const browser = payload(IDS.browser, 'data/calendar-browser-v1.json'), calendar = payload(IDS.calendar, 'data/calendar.2026.json');
  const generation = { id: dataset.release_set_id, sequence: dataset.sequence, decision_sha256: dataset.index_sha256 };
  const catalogContext = { generation, contentAuthenticated: true,
    moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, dependencies: catalogDependencies(catalog), generation },
    calendarContexts: catalog.calendar_bindings.map(b => ({ ...b, generation, authenticated: true, days: calendar.days })),
    articleContexts: catalog.article_bindings.map(b => ({ ...b, generation, authenticated: true, review_status: saints.review_status,
      calendar_binding: saints.calendar_binding, articles: saints.articles.map(({ id, type }) => ({ id, type })) })) };
  const identity = id => { const { entry, manifest } = manifests.get(id); return { module_id: id, version: manifest.version, revision: manifest.revision, manifest_sha256: entry.manifest_sha256 }; };
  const archives = ['sr-Cyrl', 'sr-Latn'].map(locale => ({
    library: { ...identity(IDS.library), psalms: payload(IDS.library, `data/psalms.${locale}.json`).psalms.map(p => ({ id: p.id, verse_numbers: p.verses.map(v => v.number) })),
      prayer_ids: payload(IDS.library, `data/prayers.${locale}.json`).prayers.map(p => p.id) },
    cycles: { ...identity(IDS.cycles), days: payload(IDS.cycles, `data/legacy-cycle.${locale}.json`).days.map(d => ({ id: d.id, cycle_day: d.cycle_day,
      slots: d.slots.map(s => ({ id: s.id, phase: s.phase, psalm_id: s.quote.psalm_id, verse_numbers: s.quote.verse_numbers, prayer_id: s.prayer_id })) })) },
  }));
  assert.deepEqual(archives[0], archives[1]);
  return { warning: WARNING, trust: 'REFERENCE_ONLY. Verify raw signed transport first; native repositories must derive their own authenticated contexts.',
    generation, catalog: catalogContext,
    saints_module: { ...SAINTS_MODULE, version: saints.version, revision: saints.revision },
    browser_module: { ...CALENDAR_BROWSER_MODULE, version: browser.version, revision: browser.revision, dependencies: [], generation },
    browser_catalog: { ...browser.catalog_binding, generation, authenticated: true },
    archiveContexts: browser.archive_bindings.map(b => ({ binding_id: b.id, generation, authenticated: true, review_status: 'approved', ...archives[0] })) };
}

export async function generate() {
  const inputs = new Map();
  const get = async (path, expected) => {
    const raw = await readFile(resolve(ROOT, path)); if (expected) assert.equal(hash(raw), expected, path);
    inputs.set(path, record(path, raw)); return raw;
  };
  await get(DECISION, DECISION_SHA);
  const block1 = 'drafts/saints-year-end-block1-2026-10-06', block2 = 'drafts/saints-year-end-block2-2026-10-06';
  for (const [dir, pin] of [[block1, '13e19c3406397d5bf30ab0e03c8e060d4ae8fafd1be38583b76dc18615777ca1'],
    [block2, '54bb0a1475199c0aa0884c7a32409ca0aef9033967d4055c14717751b5f1cc8d']]) {
    const handoff = JSON.parse(await get(`${dir}/handoff.json`, pin));
    for (const item of handoff.artifacts) await get(`${dir}/${item.path}`, item.sha256);
    await get(`${dir}/root-content-review-r1.json`);
  }
  const packageA = 'drafts/calendar-saints-expansion-2026-10-06';
  const a = JSON.parse(await get(`${packageA}/handoff.json`, '5c6c7664c8dec4ec72959ad59a0916ec9154670162c5523eee315f8146f96bf6'));
  for (const [file, pin] of Object.entries(a.artifacts)) await get(`${packageA}/${file}`, pin);
  for (const file of ['approval-request.json', 'preview-receipt.json', 'PREGLED-CIRILICA.md', 'PREGLED-LATINICA.md']) await get(`drafts/saints-year-end-review-2026-10-06/${file}`);
  for (const file of ['handoff.json', 'verification.json', 'trusted-public-key.pem', 'generate.mjs', 'verify.mjs']) await get(`fixtures/ks01-signed-transport-2026-10-06/${file}`);
  const prepared = await prepare();
  for (const item of [...prepared.base.inputs, ...prepared.block1Pins, ...prepared.first.protectedInputs]) await get(item.path, item.sha256);
  const combinedPins = JSON.parse(await get(`${block2}/delta.json`)).combined_S12_plus_both_pending_blocks;
  for (const kind of ['saints', 'catalog', 'browser']) assert.equal(hash(prepared.combined[`${kind}Bytes`]), combinedPins[kind].sha256);
  const release = JSON.parse(await get(RELEASE, '78142e24f74812be9859b88163203de23517a9ed40a16c0f5ee085e25354255d'));
  const sourceModules = new Map();
  for (const id of Object.values(IDS)) {
    const entry = release.modules.find(x => x.module_id === id); assert.ok(entry);
    const path = `${BASE}/${entry.manifest_path}`, manifest = JSON.parse(await get(path, entry.manifest_sha256));
    const files = new Map(); for (const f of manifest.files) { const raw = await get(`${dirname(path)}/${f.path}`, f.sha256); assert.equal(raw.length, f.bytes); files.set(f.path, raw); }
    sourceModules.set(id, { entry, manifest, files });
  }
  const promoted = testView(prepared.combined);
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }));
  const signature = raw => Buffer.from(sign('sha256', raw, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64') + '\n');
  const outputs = new Map([['trusted-public-key.pem', publicPem]]), datasets = [];
  for (const kind of ['saints', 'catalog', 'browser']) outputs.set(`pending/${IDS[kind]}.json`, prepared.combined[`${kind}Bytes`]);
  for (const set of SETS) {
    const tree = new Map(), modules = new Map(), archiveChanges = [];
    const emit = (id, files, changes = {}) => {
      const base = sourceModules.get(id), manifest = { ...structuredClone(base.manifest), key_id: KEY_ID, ...changes };
      manifest.files = [...files].map(([path, raw]) => ({ ...record(path, raw), content_type: 'application/json', encoding: 'utf-8' }));
      const raw = json(manifest), prefix = `modules/${id}`;
      tree.set(`${prefix}/manifest.json`, raw); tree.set(`${prefix}/manifest.sig`, signature(raw));
      for (const [path, bytes] of files) tree.set(`${prefix}/${path}`, bytes);
      const entry = { module_id: id, module_type: manifest.module_type, version: manifest.version, required: base.entry.required,
        manifest_path: `${prefix}/manifest.json`, manifest_bytes: raw.length, manifest_sha256: hash(raw), signature_path: `${prefix}/manifest.sig` };
      modules.set(id, { entry, manifest });
    };
    for (const id of [IDS.library, IDS.cycles, IDS.calendar]) emit(id, sourceModules.get(id).files);
    const saintsRaw = set.expanded ? json(promoted.saints) : prepared.base.modules[IDS.saints].bytes;
    const catalogRaw = set.expanded ? json(promoted.catalog) : prepared.base.modules[IDS.catalog].bytes;
    const saints = JSON.parse(saintsRaw), catalog = JSON.parse(catalogRaw);
    const browser = structuredClone(set.expanded ? promoted.browser : prepared.beforeBrowser);
    assert.equal(saints.articles.length, set.articles);
    emit(IDS.saints, new Map([['data/saints-v1.json', saintsRaw]]), { version: saints.version, revision: saints.revision,
      dependencies: [{ module_id: saints.calendar_binding.module_id, version: saints.calendar_binding.version }] });
    emit(IDS.catalog, new Map([['data/liturgical-catalog-v1.json', catalogRaw]]), { version: catalog.version, revision: catalog.revision, dependencies: catalogDependencies(catalog) });
    browser.archive_bindings.forEach((b, i) => { for (const field of ['library_binding', 'cycles_binding']) {
      const target = modules.get(b[field].module_id), before = b[field].manifest_sha256;
      assert.equal(before, sourceModules.get(b[field].module_id).entry.manifest_sha256);
      b[field].manifest_sha256 = target.entry.manifest_sha256;
      archiveChanges.push({ pointer: `/archive_bindings/${i}/${field}/manifest_sha256`, before, after: b[field].manifest_sha256 });
    } });
    const browserRaw = json(browser);
    emit(IDS.browser, new Map([['data/calendar-browser-v1.json', browserRaw]]), { version: browser.version, revision: browser.revision });
    const releaseId = `test-ks01-real104-${set.name.toLowerCase()}-${set.sequence}`;
    const releaseBytes = json({ schema_version: 'svetlost33-release-set-2', release_set_id: releaseId, sequence: set.sequence,
      channel: 'production', key_id: KEY_ID, approved_platforms: ['android', 'ios'], min_clients: set.expanded ? CLIENTS.expanded : CLIENTS.old,
      modules: [...modules.values()].map(m => m.entry) });
    tree.set('release-set.json', releaseBytes); tree.set('release-set.sig', signature(releaseBytes));
    const indexBytes = json({ schema_version: 'svetlost33-m0-index-2', sequence: set.sequence, issued_at: '2026-10-06T00:00:00Z', expires_at: '2026-10-07T00:00:00Z',
      key_id: KEY_ID, channels: { production: { release_set_id: releaseId, path: 'release-set.json', bytes: releaseBytes.length, sha256: hash(releaseBytes), signature_path: 'release-set.sig' } } });
    tree.set('index.json', indexBytes); tree.set('index.sig', signature(indexBytes));
    const dataset = { ...set, release_set_id: releaseId, min_clients: set.expanded ? CLIENTS.expanded : CLIENTS.old,
      index_sha256: hash(indexBytes), release_sha256: hash(releaseBytes),
      modules: [...modules.values()].map(({ entry, manifest }) => ({ ...entry, revision: manifest.revision, payloads: manifest.files })),
      payloads: { saints: record('data/saints-v1.json', saintsRaw), catalog: record('data/liturgical-catalog-v1.json', catalogRaw), browser: record('data/calendar-browser-v1.json', browserRaw) },
      counts: { articles: saints.articles.length, saints_sources: saints.sources.length, saints_days: saints.days.length,
        ...Object.fromEntries(['sources', 'subjects', 'observances', 'occurrences', 'article_links'].map(k => [`catalog_${k}`, catalog[k].length])) },
      archive_manifest_rebindings: archiveChanges, files: [...tree].map(([path, raw]) => record(path, raw)) };
    for (const [path, raw] of tree) outputs.set(`${set.name}/${path}`, raw);
    const contextPath = `reference/${set.name}.contexts.json`, contextBytes = json(referenceContexts(tree, dataset));
    outputs.set(contextPath, contextBytes); dataset.reference_contexts = record(contextPath, contextBytes); datasets.push(dataset);
  }
  const provenance = { warning: WARNING, publishable: false, source: 'prepare().combined from the frozen year-end blocks', pending_input_payloads: combinedPins,
    content_approval: null, rights_clearance: null, clerical_approval: null, original_articles: 62, new_pending_articles: 42,
    test_only_changes: promoted.changes, rights_and_bibliographic_dates_unchanged: true, prose_and_ids_unchanged: true,
    package_A: 'Omitted from graph; earlier approval question remains pending.', package_B: 'Not generated; depends on A acceptance.',
    final_graph_gate: 'Final approved A/B/editorial merge changes this graph and must repeat relevant exact-graph validation/measurement before release.' };
  outputs.set('provenance.json', json(provenance));
  outputs.set('TEST-ONLY.json', json({ warning: WARNING, publishable: false, production_trust: false, owner_approval: false,
    signature: 'RSA-PSS SHA-256, 2048-bit, saltLength=32; one fresh ephemeral key for both profiles; private key never serialized',
    channel: 'production', channel_note: 'Wire-compatible label only; local fixture, never a production endpoint', fixed_test_time: TEST_NOW, clients: CLIENTS,
    native_authentication: 'Use raw dataset directories and common public key. Reference contexts are sidecars, never native trust substitutes.' }));
  const before = [...inputs.values()];
  const after = await Promise.all(before.map(async i => { const raw = await readFile(resolve(ROOT, i.path)); assert.equal(hash(raw), i.sha256); return record(i.path, raw); }));
  assert.deepEqual(after, before);
  outputs.set('protected-inputs.json', json({ status: 'PRE_POST_IDENTICAL', before, after }));
  const generatorSources = Object.fromEntries(await Promise.all(['generate.mjs', 'verify.mjs', 'serve.mjs', 'README.md'].map(async p => [p, hash(await readFile(resolve(HERE, p)))])));
  outputs.set('handoff.json', json({ schema_version: 'svetlost33-ks01-real-draft104-handoff-1', status: 'GENERATED_TEST_ONLY_VERIFY_BEFORE_NATIVE_USE', warning: WARNING,
    decision_sha256: DECISION_SHA, key_id: KEY_ID, trusted_public_key_sha256: hash(publicPem), fixed_test_time: TEST_NOW, channel: 'production', clients: CLIENTS,
    datasets, inputs: before, generator_sources: generatorSources, artifact_files: [...outputs].map(([p, b]) => record(p, b)),
    native_selectors: { baseline62: { directory: 'baseline62', sequence: 200, predecessor: null, expected_articles: 62 },
      realDraft104: { directory: 'realDraft104', sequence: 201, predecessor: 'baseline62', expected_articles: 104 } },
    install_chain: { isolated_store_required: true, selectors: ['baseline62', 'realDraft104'], sequences: [200, 201], final_sequence: 201,
      additional_predecessors: [], note: 'Complete six-module graphs; no Package A or synthetic104 predecessor. Use the same new test key and fixed test time for both.' },
    transport: 'Each baseline62/ or realDraft104/ directory is an independent raw relative-path map, compatible with ModularSignedPackage(files:) or a local HTTP-map downloader. Same test public key, pinned clock, no synthetic prose.',
    http: 'node serve.mjs --port 0; binds only 127.0.0.1 and only serves hash-checked allowlisted transport bytes. No server is left running by verification.',
    no_private_key_saved: true, owner_approval: false, native_acceptance: false, production_authorization: false,
    remaining_gates: ['Both native real authenticated install/project/retention checks', 'Matched baseline62/realDraft104 locked 1 warmup + 5 measured runs',
      'Existing separate pending approvals for A and 42 texts', 'B preparation after A acceptance', 'Exact final merged graph validation and relevant remeasurement', 'Separately authorized production release/signing/publication'],
    excluded: ['366 fixture or benchmark', 'A/B deltas', 'production trust or private keys', 'new content or source review', 'native builds', 'publication'] }));
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--write-new']);
  await access(resolve(HERE, 'handoff.json')).then(() => assert.fail('Frozen fixture exists; run verify.mjs --check instead'), e => { if (e.code !== 'ENOENT') throw e; });
  const outputs = await generate(); await writeNew(outputs);
  console.log(JSON.stringify({ status: 'GENERATED_TEST_ONLY', files: outputs.size, handoff_sha256: hash(outputs.get('handoff.json')), private_key_saved: false }));
}
