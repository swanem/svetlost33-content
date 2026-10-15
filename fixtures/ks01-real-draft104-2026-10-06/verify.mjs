#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { prepare } from '../../drafts/saints-year-end-block2-2026-10-06/prepare.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { HERE, ROOT, IDS, SETS, KEY_ID, CLIENTS, TEST_NOW, WARNING, hash, json, writeNew, testView, referenceContexts } from './generate.mjs';
import { startFixtureServer } from './serve.mjs';

assert.ok(process.argv.length === 3 && ['--check', '--write-evidence'].includes(process.argv[2]));
const get = path => readFile(resolve(HERE, path));
const handoffBytes = await get('handoff.json'), handoff = JSON.parse(handoffBytes), publicKey = await get('trusted-public-key.pem');
const prepared = await prepare(), promoted = testView(prepared.combined);
const checks = [], check = async (name, fn) => { await fn(); checks.push({ name, status: 'PASS' }); };
const capabilities = ['library-v1', 'cycle-v1', 'calendar-v1', 'explicit-unknown', 'sr-Cyrl', 'sr-Latn', 'saints-v1', 'liturgical-catalog-v1', 'calendar-browser-v1'];
const options = platform => ({ publicKeyPath: resolve(HERE, 'trusted-public-key.pem'), trustedKeyId: KEY_ID, now: TEST_NOW,
  platform, clientVersion: CLIENTS.expanded[platform], clientCapabilities: capabilities, channel: 'production', minimumSequence: 200 });
const platformResults = [], graphs = [];
await check('Frozen drafts, original handoffs, S12, old fixtures and source pins remain byte-identical', async () => {
  const protectedInputs = JSON.parse(await get('protected-inputs.json'));
  assert.deepEqual(protectedInputs.before, protectedInputs.after); assert.deepEqual(protectedInputs.before, handoff.inputs);
  for (const input of handoff.inputs) { const bytes = await readFile(resolve(ROOT, input.path)); assert.equal(bytes.length, input.bytes); assert.equal(hash(bytes), input.sha256, input.path); }
  for (const [path, expected] of Object.entries(handoff.generator_sources)) assert.equal(hash(await get(path)), expected, path);
  for (const kind of ['saints', 'catalog', 'browser']) assert.deepEqual(await get(`pending/${IDS[kind]}.json`), prepared.combined[`${kind}Bytes`]);
});
await check('Every output is hash-pinned, regular and confined; common public test key only', async () => {
  assert.equal(hash(publicKey), handoff.trusted_public_key_sha256); assert.ok(publicKey.toString().startsWith('-----BEGIN PUBLIC KEY-----'));
  assert.equal(handoff.key_id, KEY_ID); assert.equal(handoff.no_private_key_saved, true);
  for (const item of handoff.artifact_files) {
    assert.ok(resolve(HERE, item.path).startsWith(`${HERE}/`)); assert.ok(!/private/i.test(item.path));
    const stat = await lstat(resolve(HERE, item.path)); assert.ok(stat.isFile() && !stat.isSymbolicLink());
    const bytes = await get(item.path); assert.equal(bytes.length, item.bytes); assert.equal(hash(bytes), item.sha256, item.path);
  }
});
await check('Both complete six-module RSA graphs validate for Android/iOS, with a direct 200→201 chain and bounded old-client/replay/time failures', async () => {
  assert.deepEqual(handoff.install_chain.selectors, ['baseline62', 'realDraft104']); assert.deepEqual(handoff.install_chain.additional_predecessors, []);
  for (const set of SETS) for (const platform of ['android', 'ios']) {
    const root = resolve(HERE, set.name), opts = options(platform), result = await validateRelease(root, opts);
    assert.equal(result.modules, 6); assert.equal(result.sequence, set.sequence); assert.deepEqual(result.skippedOptionalModules, []);
    platformResults.push({ dataset: set.name, platform, result });
    if (set.expanded) await assert.rejects(validateRelease(root, { ...opts, clientVersion: CLIENTS.old[platform] }), e => e.code === 'CLIENT_VERSION');
    else assert.equal((await validateRelease(root, { ...opts, clientVersion: CLIENTS.old[platform] })).modules, 6);
    await assert.rejects(validateRelease(root, { ...opts, minimumSequence: set.sequence + 1 }), e => e.code === 'REPLAY');
    await assert.rejects(validateRelease(root, { ...opts, now: '2026-10-07T00:00:00Z' }), e => e.code === 'TIME');
  }
});
await check('Actual RSA-PSS authenticates every signed envelope and rejects mutated bytes; native raw trees contain no reference flags or keys', async () => {
  const key = { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 };
  for (const dataset of handoff.datasets) {
    const tree = new Map();
    for (const item of dataset.files) {
      assert.ok(!/contexts\.json|private|\.pem$/.test(item.path));
      const raw = await get(`${dataset.name}/${item.path}`); assert.equal(hash(raw), item.sha256); assert.equal(raw.length, item.bytes); tree.set(item.path, raw);
    }
    for (const [path, signaturePath] of [['index.json', 'index.sig'], ['release-set.json', 'release-set.sig'], ...dataset.modules.map(m => [m.manifest_path, m.signature_path])]) {
      const raw = tree.get(path), signature = Buffer.from(tree.get(signaturePath).toString().trim(), 'base64');
      assert.equal(verify('sha256', raw, key, signature), true, path);
      const altered = Buffer.from(raw); altered[altered.length - 1] ^= 1; assert.equal(verify('sha256', altered, key, signature), false);
    }
    const file = (id, path) => tree.get(`modules/${id}/${path}`), payload = (id, path) => JSON.parse(file(id, path));
    graphs.push({ dataset, tree, file, saints: payload(IDS.saints, 'data/saints-v1.json'), catalog: payload(IDS.catalog, 'data/liturgical-catalog-v1.json'),
      browser: payload(IDS.browser, 'data/calendar-browser-v1.json'), calendar: payload(IDS.calendar, 'data/calendar.2026.json') });
  }
});
await check('Exact schemas, module dependencies, calendar/article/catalog/archive hashes and unchanged S12 core payloads form coherent generations', async () => {
  for (const g of graphs) {
    const { dataset, file, saints, catalog, browser, calendar } = g;
    assert.equal(profile.saints.parseSaintsPayload(file(IDS.saints, 'data/saints-v1.json')).valid, true);
    assert.equal(profile.catalog.parseCatalogPayload(file(IDS.catalog, 'data/liturgical-catalog-v1.json')).valid, true);
    assert.equal(profile.browser.parseCalendarBrowserPayload(file(IDS.browser, 'data/calendar-browser-v1.json')).valid, true);
    const exactBinding = b => { const m = dataset.modules.find(m => m.module_id === b.module_id); assert.ok(m); assert.equal(b.version, m.version); assert.equal(b.revision, m.revision); assert.equal(b.sha256, hash(file(b.module_id, b.path))); };
    exactBinding(saints.calendar_binding); catalog.calendar_bindings.forEach(exactBinding); catalog.article_bindings.forEach(exactBinding); exactBinding(browser.catalog_binding);
    for (const m of dataset.modules) {
      const manifest = JSON.parse(g.tree.get(m.manifest_path));
      for (const dep of manifest.dependencies) assert.equal(dataset.modules.find(m => m.module_id === dep.module_id)?.version, dep.version);
      if ([IDS.library, IDS.cycles, IDS.calendar].includes(m.module_id)) for (const f of manifest.files) {
        const source = handoff.inputs.find(i => i.path.startsWith('releases/') && i.sha256 === f.sha256); assert.ok(source);
        assert.deepEqual(file(m.module_id, f.path), await readFile(resolve(ROOT, source.path)));
      }
    }
    for (const b of browser.archive_bindings) for (const field of ['library_binding', 'cycles_binding']) {
      const m = dataset.modules.find(m => m.module_id === b[field].module_id); assert.equal(b[field].manifest_sha256, m.manifest_sha256); assert.equal(b[field].version, m.version); assert.equal(b[field].revision, m.revision);
    }
    assert.equal(saints.articles.length, dataset.articles); assert.deepEqual(calendar, prepared.calendar);
  }
});
await check('Copy-only test approval preserves all 104 real article objects, sources, rights, dates and archive assignments; A/B are omitted', async () => {
  const provenance = JSON.parse(await get('provenance.json')); assert.deepEqual(provenance.test_only_changes, promoted.changes);
  assert.equal(provenance.content_approval, null); assert.equal(provenance.rights_clearance, null); assert.equal(provenance.new_pending_articles, 42);
  for (const g of graphs) {
    const original = g.dataset.expanded ? promoted : { saints: prepared.beforeSaints, catalog: prepared.beforeCatalog, browser: prepared.beforeBrowser };
    assert.deepEqual(g.saints, original.saints); assert.deepEqual(g.catalog, original.catalog);
    assert.deepEqual(g.saints.articles.slice(0, 62), prepared.beforeSaints.articles);
    if (g.dataset.expanded) { assert.deepEqual(g.saints.articles, prepared.combined.saints.articles); assert.deepEqual(g.saints.sources, prepared.combined.saints.sources); }
    const browser = structuredClone(original.browser);
    assert.equal(g.dataset.archive_manifest_rebindings.length, 2);
    for (const change of g.dataset.archive_manifest_rebindings) {
      const parts = change.pointer.split('/').slice(1); let target = browser;
      for (const part of parts.slice(0, -1)) target = target[part]; assert.equal(target[parts.at(-1)], change.before); target[parts.at(-1)] = change.after;
    }
    assert.deepEqual(g.browser, browser);
  }
  assert.equal(profile.saints.evaluateSaintsDay(prepared.combined.saints).reason, 'unapproved');
  assert.equal(profile.catalog.evaluateCatalog(prepared.combined.catalog).reason, 'unapproved');
  assert.equal(profile.browser.evaluateCalendarBrowser(prepared.combined.browser).reason, 'unapproved');
});
await check('Authenticated reference graph resolves every saints day, catalog occurrence/link and preserved archive day in both scripts; 2027 stays unavailable', async () => {
  for (const g of graphs) {
    const { dataset, tree, saints, catalog, browser, calendar } = g, refs = referenceContexts(tree, dataset);
    assert.deepEqual(await get(dataset.reference_contexts.path), json(refs));
    const saintContext = date => ({ contentAuthenticated: true, moduleContext: refs.saints_module, calendarAuthenticated: true, calendarContext: { ...saints.calendar_binding, days: calendar.days }, date });
    const browserContext = { generation: refs.generation, contentAuthenticated: true, moduleContext: refs.browser_module, archiveContexts: refs.archiveContexts,
      catalogContext: { ...refs.browser_catalog, payload: catalog, context: refs.catalog } };
    assert.equal(profile.catalog.evaluateCatalog(catalog, refs.catalog).eligible, true);
    for (const day of saints.days) { const result = profile.saints.evaluateSaintsDay(saints, saintContext(day.date)); assert.equal(result.eligible, true, day.date); assert.deepEqual(result.articles.map(a => a.id), day.article_ids); }
    const profileId = catalog.calendar_profiles[0].id;
    for (const occurrence of catalog.occurrences) assert.ok(profile.catalog.resolveCatalogDay(catalog, refs.catalog, { date: occurrence.date, calendar_profile_id: profileId }).occurrence_ids.includes(occurrence.id), occurrence.id);
    for (const locale of ['sr-Cyrl', 'sr-Latn']) {
      for (const link of catalog.article_links) {
        const obs = catalog.observances.find(o => o.id === link.observance_id), result = profile.catalog.searchCatalog(catalog, refs.catalog, { query: obs.name[locale], locale, year: 2026, calendar_profile_id: profileId });
        assert.ok(result.results.find(o => o.observance_id === obs.id)?.article_ids.includes(link.article_id), link.id);
      }
      assert.equal(profile.browser.upcomingBrowserFeasts(browser, browserContext, { from_date: '2026-10-06', locale }).state, 'matches');
    }
    for (const day of browser.archive_days) assert.equal(profile.browser.resolveBrowserArchiveDay(browser, browserContext, { date: day.date }).state, day.status, day.date);
    assert.equal(profile.catalog.resolveCatalogDay(catalog, refs.catalog, { date: '2027-01-01', calendar_profile_id: profileId }).state, 'year_unavailable');
    assert.equal(profile.saints.evaluateSaintsDay(saints, saintContext('2027-01-01')).reason, 'uncovered_date');
    g.refs = refs; g.browserContext = browserContext;
  }
});
await check('Fresh generation, duplicate/missing canonical day and altered catalog/article bindings fail closed without changing payloads', async () => {
  const { catalog, browser, refs, browserContext } = graphs.find(g => g.dataset.expanded);
  const wrongGen = structuredClone(refs.catalog); wrongGen.generation = { ...wrongGen.generation, sequence: wrongGen.generation.sequence + 1 };
  assert.equal(profile.catalog.evaluateCatalog(catalog, wrongGen).reason, 'generation_mismatch');
  const day = refs.catalog.calendarContexts[0].days.find(d => d.date === catalog.occurrences[0].date);
  for (const duplicate of [true, false]) {
    const bad = structuredClone(refs.catalog); bad.calendarContexts[0].days = duplicate ? [...bad.calendarContexts[0].days, day] : bad.calendarContexts[0].days.filter(d => d.date !== day.date);
    assert.equal(profile.catalog.evaluateCatalog(catalog, bad).reason, 'calendar_day_mismatch');
  }
  const badBrowser = structuredClone(browserContext); badBrowser.catalogContext.sha256 = '0'.repeat(64);
  assert.equal(profile.browser.upcomingBrowserFeasts(browser, badBrowser, { from_date: '2026-10-06', locale: 'sr-Cyrl' }).state, 'unavailable');
  const badArticles = structuredClone(refs.catalog); badArticles.articleContexts.forEach(h => { h.sha256 = '0'.repeat(64); });
  const obs = catalog.observances.find(o => o.id === catalog.article_links.at(-1).observance_id);
  const result = profile.catalog.searchCatalog(catalog, badArticles, { query: obs.name['sr-Cyrl'], locale: 'sr-Cyrl', year: 2026, calendar_profile_id: catalog.calendar_profiles[0].id });
  assert.ok(result.results.length); assert.ok(result.results.every(r => r.article_ids.length === 0));
});
await check('Loopback HTTP serves exact pinned raw transport only; sidecars/writes unavailable and server closes', async () => {
  const server = await startFixtureServer();
  try {
    for (const g of graphs) for (const path of ['index.json', 'index.sig', `modules/${IDS.saints}/data/saints-v1.json`]) {
      const response = await fetch(`${server.origin}/${g.dataset.name}/${path}`); assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), g.tree.get(path));
    }
    assert.equal((await fetch(`${server.origin}/reference/realDraft104.contexts.json`)).status, 404);
    assert.equal((await fetch(`${server.origin}/trusted-public-key.pem`)).status, 404);
    assert.equal((await fetch(`${server.origin}/realDraft104/index.json`, { method: 'POST' })).status, 405);
  } finally { server.server.closeAllConnections(); await server.close(); }
});
const receipt = { schema_version: 'svetlost33-ks01-real-draft104-verification-1', status: 'PASS_SHARED_REFERENCE_ONLY_NOT_NATIVE_ACCEPTANCE',
  warning: WARNING, handoff_sha256: hash(handoffBytes), trusted_public_key_sha256: hash(publicKey), fixed_test_time: TEST_NOW,
  assertion_groups: checks.length, assertions: checks, transport_profiles: platformResults, protected_inputs: handoff.inputs.length,
  graph_scope: 'Exact original62 plus real pending42, complete six-module graph; test review copies only; Package A/B not merged.',
  authentication_basis: 'Actual RSA-PSS verification of all envelopes plus exact raw length/hash before reference contexts are used.',
  native_acceptance: false, production_authorization: false, owner_content_approval: false, private_key_saved: false };
const receiptBytes = json(receipt);
if (process.argv[2] === '--write-evidence') await writeNew(new Map([['verification.json', receiptBytes]]));
else assert.deepEqual(await get('verification.json'), receiptBytes);
console.log(JSON.stringify({ status: receipt.status, assertion_groups: checks.length, handoff_sha256: hash(handoffBytes), verification_sha256: hash(receiptBytes),
  trusted_public_key_sha256: hash(publicKey), datasets: handoff.datasets.map(({ name, sequence, articles, index_sha256, payloads }) => ({ name, sequence, articles, index_sha256, payloads })) }, null, 2));
