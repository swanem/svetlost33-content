#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { HERE, ROOT, CORPUS, IDS, SETS, KEY_ID, CLIENTS, TEST_NOW, WARNING, hash, json, writeNew } from './generate.mjs';

assert.ok(process.argv.length === 3 && ['--check', '--write-evidence'].includes(process.argv[2]));
const get = path => readFile(resolve(HERE, path));
const handoffBytes = await get('handoff.json'), handoff = JSON.parse(handoffBytes), publicKey = await get('trusted-public-key.pem');
assert.equal(hash(publicKey), handoff.trusted_public_key_sha256);
assert.ok(publicKey.toString().startsWith('-----BEGIN PUBLIC KEY-----'));
const checks = [], check = async (name, fn) => { await fn(); checks.push({ name, status: 'PASS' }); };
const capabilities = ['library-v1', 'cycle-v1', 'calendar-v1', 'explicit-unknown', 'sr-Cyrl', 'sr-Latn', 'saints-v1', 'liturgical-catalog-v1', 'calendar-browser-v1'];
const platformResults = [];
await check('Frozen source and corpus inputs remain byte-identical; only the new output directory was written', async () => {
  for (const input of handoff.inputs) { const bytes = await readFile(resolve(ROOT, input.path)); assert.equal(bytes.length, input.bytes); assert.equal(hash(bytes), input.sha256); }
  for (const [path, expected] of Object.entries(handoff.generator_sources)) assert.equal(hash(await get(path)), expected);
});
await check('All four raw signed transport trees validate for new Android/iOS; old test clients reject only expanded releases', async () => {
  for (const set of SETS) for (const platform of ['android', 'ios']) {
    const options = { publicKeyPath: resolve(HERE, 'trusted-public-key.pem'), trustedKeyId: KEY_ID, now: TEST_NOW,
      platform, clientVersion: CLIENTS.expanded[platform], clientCapabilities: capabilities, channel: 'production', minimumSequence: 100 };
    const result = await validateRelease(resolve(HERE, set.name), options);
    assert.equal(result.modules, 6); assert.equal(result.sequence, set.sequence); assert.deepEqual(result.skippedOptionalModules, []);
    platformResults.push({ dataset: set.name, platform, result });
    if (set.expanded) await assert.rejects(validateRelease(resolve(HERE, set.name), { ...options, clientVersion: CLIENTS.old[platform] }), error => error.code === 'CLIENT_VERSION');
    else assert.equal((await validateRelease(resolve(HERE, set.name), { ...options, clientVersion: CLIENTS.old[platform] })).modules, 6);
  }
});
await check('Every output file is hash-pinned; RSA-PSS rejects altered signed bytes; no context or private-key file is in any transport tree', async () => {
  for (const dataset of handoff.datasets) {
    for (const file of dataset.files) {
      assert.ok(!/contexts\.json|private|\.pem$/.test(file.path));
      const path = `${dataset.name}/${file.path}`, stat = await lstat(resolve(HERE, path)); assert.ok(stat.isFile() && !stat.isSymbolicLink());
      const bytes = await get(path); assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
    }
    const bytes = await get(`${dataset.name}/index.json`), signature = Buffer.from((await get(`${dataset.name}/index.sig`)).toString().trim(), 'base64');
    const key = { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 };
    assert.equal(verify('sha256', bytes, key, signature), true);
    const altered = Buffer.from(bytes); altered[altered.length - 1] ^= 1;
    assert.equal(verify('sha256', altered, key, signature), false);
  }
});
await check('Real unchanged annual/core bytes and all exact saints/catalog/archive bindings form one coherent graph in each signed generation', async () => {
  for (const dataset of handoff.datasets) {
    const manifests = new Map(), raw = new Map();
    for (const module of dataset.modules) {
      const manifest = JSON.parse(await get(`${dataset.name}/${module.manifest_path}`)); manifests.set(module.module_id, { module, manifest });
      for (const file of manifest.files) raw.set(`${module.module_id}:${file.path}`, await get(`${dataset.name}/${dirname(module.manifest_path)}/${file.path}`));
      for (const dep of manifest.dependencies) assert.equal(dataset.modules.find(m => m.module_id === dep.module_id)?.version, dep.version);
    }
    const file = (id, path) => raw.get(`${id}:${path}`), payload = (id, path) => JSON.parse(file(id, path));
    const saints = payload(IDS.saints, 'data/saints-v1.json'), catalog = payload(IDS.catalog, 'data/liturgical-catalog-v1.json'), browser = payload(IDS.browser, 'data/calendar-browser-v1.json'), calendar = payload(IDS.calendar, 'data/calendar.2026.json');
    assert.equal(profile.saints.parseSaintsPayload(file(IDS.saints, 'data/saints-v1.json')).valid, true);
    assert.equal(profile.catalog.parseCatalogPayload(file(IDS.catalog, 'data/liturgical-catalog-v1.json')).valid, true);
    assert.equal(profile.browser.parseCalendarBrowserPayload(file(IDS.browser, 'data/calendar-browser-v1.json')).valid, true);
    const exactBinding = binding => {
      const m = manifests.get(binding.module_id); assert.ok(m); assert.equal(binding.version, m.manifest.version); assert.equal(binding.revision, m.manifest.revision);
      assert.equal(binding.sha256, hash(file(binding.module_id, binding.path)));
    };
    exactBinding(saints.calendar_binding); catalog.calendar_bindings.forEach(exactBinding); catalog.article_bindings.forEach(exactBinding); exactBinding(browser.catalog_binding);
    const coreIds = [IDS.library, IDS.cycles, IDS.calendar];
    for (const id of coreIds) for (const f of manifests.get(id).manifest.files) {
      const original = handoff.inputs.find(i => i.path.startsWith('releases/') && i.sha256 === f.sha256); assert.ok(original, `${id}/${f.path}`);
      assert.deepEqual(file(id, f.path), await readFile(resolve(ROOT, original.path)));
    }
    for (const day of saints.days) {
      const canonical = calendar.days.find(d => d.date === day.date); assert.ok(canonical);
      assert.equal(day.julian_date, canonical.julian_date); assert.equal(day.calendar_title['sr-Cyrl'], canonical.commemoration.title_cyrl);
      assert.deepEqual(day.calendar_source_ids, canonical.commemoration.source_ids);
      assert.equal(canonical.commemoration.status, 'SOURCE_RECORDED'); assert.equal(canonical.commemoration.complete_saint_list_verified, false);
    }
    for (const occurrence of catalog.occurrences) {
      const day = calendar.days.find(d => d.date === occurrence.date); assert.ok(day);
      assert.equal(occurrence.julian_date, day.julian_date); assert.equal(occurrence.calendar_title['sr-Cyrl'], day.commemoration.title_cyrl);
      assert.deepEqual(occurrence.calendar_source_ids, day.commemoration.source_ids);
    }
    const types = { saint_commemoration: 'saint', group_commemoration: 'group', feast: 'feast', event: 'feast' };
    for (const link of catalog.article_links) {
      const article = saints.articles.find(a => a.id === link.article_id), obs = catalog.observances.find(o => o.id === link.observance_id);
      assert.ok(article && obs); assert.equal(article.type, types[obs.kind]);
    }
    for (const binding of browser.archive_bindings) for (const field of ['library_binding', 'cycles_binding']) {
      const b = binding[field], m = manifests.get(b.module_id); assert.ok(m); assert.equal(b.version, m.manifest.version); assert.equal(b.revision, m.manifest.revision);
      assert.equal(b.manifest_sha256, m.module.manifest_sha256);
    }
    for (const membership of browser.feast_memberships) {
      assert.ok(catalog.observances.some(o => o.id === membership.observance_id));
      for (const id of membership.occurrence_ids) assert.ok(catalog.occurrences.some(o => o.id === id && o.observance_id === membership.observance_id));
    }
    assert.equal(saints.articles.length, dataset.articles);
    if (dataset.articles > 62) assert.equal(new Set(catalog.article_links.filter(l => l.observance_id.startsWith('test-observance-')).map(l => l.article_id)).size, dataset.articles);
  }
});
await check('Corpus saints/catalog bytes are exact; only two documented archive manifest hashes change in browser; archive assignments are preserved', async () => {
  for (const dataset of handoff.datasets) {
    for (const id of [IDS.saints, IDS.catalog]) assert.deepEqual(await get(`${dataset.name}/modules/${id}/data/${id}.json`), await readFile(resolve(ROOT, CORPUS, dataset.source_dataset, `${id}.json`)));
    const original = JSON.parse(await readFile(resolve(ROOT, CORPUS, dataset.source_dataset, 'calendar-browser-v1.json')));
    const derived = JSON.parse(await get(`${dataset.name}/modules/${IDS.browser}/data/calendar-browser-v1.json`));
    for (const change of dataset.browser_derivative.changes) {
      const parts = change.json_pointer.split('/').slice(1); let target = original;
      for (const part of parts.slice(0, -1)) target = target[part];
      assert.equal(target[parts.at(-1)], change.before); target[parts.at(-1)] = change.after;
    }
    assert.deepEqual(derived, original); assert.equal(dataset.browser_derivative.changes.length, 2);
  }
});
const receipt = { schema_version: 'svetlost33-ks01-signed-transport-verification-1', status: 'PASS_SHARED_RSA_RAW_HASH_EXACT_GRAPH_REFERENCE_ONLY',
  warning: WARNING, handoff_sha256: hash(handoffBytes), trusted_public_key_sha256: hash(publicKey), fixed_test_time: TEST_NOW,
  assertions: checks, assertion_groups: checks.length, transport_profiles: platformResults,
  authentication_basis: 'Actual RSA-PSS verification of index/release/manifests and exact raw payload length/hash under a fresh test-only key; no contexts.json/authenticated fixture flags used.',
  graph_scope: 'Real immutable S12 core data; exact current corpus saints/catalog payloads; browser derivative changes only two core manifest hashes. Full 104/366 linked identities, real calendar dates, preserved archive assignments.',
  native_acceptance: false, production_authorization: false, private_key_saved: false,
  remaining_native_gates: handoff.native_gates };
if (process.argv[2] === '--write-evidence') await writeNew(new Map([['verification.json', json(receipt)]]));
console.log(JSON.stringify({ status: receipt.status, assertion_groups: checks.length, handoff_sha256: hash(handoffBytes), verification_sha256: hash(json(receipt)), datasets: handoff.datasets.map(({ name, sequence, articles, index_sha256 }) => ({ name, sequence, articles, index_sha256 })) }, null, 2));
