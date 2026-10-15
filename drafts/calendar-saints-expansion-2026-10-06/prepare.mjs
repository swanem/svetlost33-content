#!/usr/bin/env node
// Offline additive draft export. No network, keys, signing, release or approval writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, access, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows, popularAliases, identityNotes } from './master.mjs';
import { parseCatalogPayload } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { parseCalendarBrowserPayload } from '../../scripts/validate-calendar-browser-v1.mjs';
import { parseSaintsPayload, toLatin } from '../../scripts/validate-saints-v1.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const PROFILE = 'spc-rs-ba-julian-v1';
export const BASE_ID = 'shared-calendar-saints-2026-10-02-m0v2-s12';
export const BASE_INDEX_HASH = 'a0d50c23036db203035419f4ba169ddb6005223799ed3ac4e89e03dd9f7733e9';
export const BASE_SET_HASH = '78142e24f74812be9859b88163203de23517a9ed40a16c0f5ee085e25354255d';
export const PUBLIC_RECEIPT_PATH = '../svetlost33-github/docs/contracts/calendar-saints-expansion-2026-10-06/public-baseline-s12-2026-10-06.json';
export const PUBLIC_RECEIPT_HASH = '4c75bc9c1721ca677d11d256f15159d81c683eef68baa641b0ba24b10182de28';
export const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const counts = c => Object.fromEntries(['sources', 'subjects', 'observances', 'occurrences', 'article_links'].map(key => [key, c[key].length]));
const LIMITS = { sources: 256, subjects: 256, observances: 512, occurrences: 2048, article_links: 256 };
const PINS = {
  'calendar-2026-r1': 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c',
  'saints-v1': 'ca3e4fd02ca79e97d53e0e456b2ccaaeb81ebc3b740a71b3eb72049bf01331b5',
  'liturgical-catalog-v1': 'd973f659da3a1e084739afe70a6a31daea390c32f5508ecdaa56a3fc3e7b4af3',
  'calendar-browser-v1': '20d3d0ad3d9a352c87d05425e8673460c62c9a0cf4043988c48e4c0da3d61fae',
};

export async function loadBase() {
  const inputs = [];
  const capture = async path => { const bytes = await readFile(resolve(ROOT, path)); inputs.push(record(path, bytes)); return bytes; };
  const prefix = 'releases/v2/production';
  const indexBytes = await capture(`${prefix}/index.json`);
  assert.equal(hash(indexBytes), BASE_INDEX_HASH, 'Local discovery advanced; rebase/review, never overwrite it');
  const setBytes = await capture(`${prefix}/releases/${BASE_ID}/release-set.json`);
  assert.equal(hash(setBytes), BASE_SET_HASH);
  const index = JSON.parse(indexBytes), set = JSON.parse(setBytes);
  assert.equal(index.sequence, 12); assert.equal(index.channels.production.release_set_id, BASE_ID);
  assert.equal(index.channels.production.sha256, BASE_SET_HASH);
  const modules = {};
  for (const [id, expectedHash] of Object.entries(PINS)) {
    const entry = set.modules.find(item => item.module_id === id);
    assert.ok(entry);
    const path = `${prefix}/${entry.manifest_path}`, bytes = await capture(path), manifest = JSON.parse(bytes);
    assert.equal(hash(bytes), entry.manifest_sha256); assert.equal(bytes.length, entry.manifest_bytes);
    assert.equal(manifest.files.length, 1);
    const file = manifest.files[0], payloadPath = `${dirname(path)}/${file.path}`, payloadBytes = await capture(payloadPath);
    assert.equal(hash(payloadBytes), expectedHash); assert.equal(file.sha256, expectedHash); assert.equal(file.bytes, payloadBytes.length);
    modules[id] = { manifest, file, path: payloadPath, bytes: payloadBytes, payload: JSON.parse(payloadBytes) };
  }
  // Preserve the original review scope/limitations in hash-bound local source records.
  for (const path of [
    'drafts/saints-completion-2026-09-21/sources.json',
    'drafts/saints-next-window-2026-09-30/sources.json',
    'approvals/saints-completion-2026-09-21/owner-publication-approval.json',
    'approvals/new-content-2026-09-30/owner-approval.json',
    'approvals/calendar-saints-window-2026-10-02/owner-approval.json',
  ]) await capture(path);
  assert.equal(parseSaintsPayload(modules['saints-v1'].bytes).valid, true);
  assert.equal(modules['saints-v1'].payload.review_status, 'approved');
  assert.equal(modules['saints-v1'].payload.articles.length, 62);
  return { inputs, modules, index, set };
}

export async function prepare() {
  const base = await loadBase(), calendar = base.modules['calendar-2026-r1'].payload;
  const receiptBytes = await readFile(resolve(ROOT, PUBLIC_RECEIPT_PATH));
  assert.equal(hash(receiptBytes), PUBLIC_RECEIPT_HASH);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.status, 'PASS'); assert.equal(receipt.index_sha256, BASE_INDEX_HASH);
  assert.equal(receipt.release_set_id, BASE_ID); assert.equal(receipt.release_sha256, BASE_SET_HASH);
  const publicBaseline = { ...record(PUBLIC_RECEIPT_PATH, receiptBytes), status: 'COORDINATOR_PUBLIC_S12_READBACK_PASS',
    completed_at: receipt.completed_at, verified_files: receipt.fetched_files, profile_checks: receipt.shared_profile_checks,
    candidate_approval: false, candidate_publication: false, native_acceptance: false };
  const saints = base.modules['saints-v1'].payload, previous = base.modules['liturgical-catalog-v1'].payload;
  const beforeBrowser = base.modules['calendar-browser-v1'].payload;
  const catalog = structuredClone(previous);
  Object.assign(catalog, { version: '2026.10.6', revision: 8, review_status: 'pending', approval_id: null });
  const inventory = [], additions = { sources: [], subjects: [], observances: [], occurrences: [], article_links: [] };
  const add = (key, value) => { catalog[key].push(value); additions[key].push(structuredClone(value)); };
  const calendarBinding = catalog.calendar_bindings.find(b => b.year === 2026 && b.calendar_profile_id === PROFILE);
  const articleBinding = catalog.article_bindings.find(b => b.module_id === 'saints-v1');
  assert.equal(calendarBinding.sha256, PINS['calendar-2026-r1']);
  assert.equal(articleBinding.sha256, PINS['saints-v1']);
  for (const row of rows) {
    const day = saints.days.find(item => item.date === row.date), annual = calendar.days.find(item => item.date === row.date);
    const article = saints.articles.find(item => item.id === row.article_id);
    assert.ok(day && annual && article, `Missing ${row.date}`);
    assert.deepEqual(day.article_ids, [row.article_id]);
    assert.equal(annual.commemoration.status, 'SOURCE_RECORDED');
    assert.equal(annual.commemoration.complete_saint_list_verified, false);
    assert.equal(day.julian_date, annual.julian_date);
    assert.deepEqual(day.calendar_title, localized(annual.commemoration.title_cyrl));
    assert.deepEqual(day.calendar_source_ids, annual.commemoration.source_ids);
    const sourceRecords = article.source_ids.map(id => { const source = saints.sources.find(s => s.id === id); assert.equal(source?.kind, 'article'); return source; });
    const sourceIds = [...new Set([...day.calendar_source_ids, ...article.source_ids])];
    const oldSubject = previous.subjects.find(item => item.id === row.subject_id);
    const oldObservance = previous.observances.find(item => item.id === row.observance_id);
    const oldOccurrence = previous.occurrences.find(item => item.observance_id === row.observance_id && item.date === row.date);
    const oldLink = previous.article_links.find(item => item.observance_id === row.observance_id && item.article_id === row.article_id);
    const kind = article.type === 'saint' ? 'saint_commemoration' : article.type === 'group' ? 'group_commemoration' : article.subtype === 'commemoration_of_event' ? 'event' : 'feast';
    if (oldObservance) { assert.equal(oldObservance.kind, kind); assert.deepEqual(oldObservance.subject_ids, row.subject_id ? [row.subject_id] : []); }
    if (oldSubject && article.type !== 'feast') assert.equal(oldSubject.type, article.type);
    if (oldOccurrence) { assert.equal(oldOccurrence.julian_date, day.julian_date); assert.deepEqual(oldOccurrence.calendar_title, day.calendar_title); }
    // Do not silently assign a second identity to an existing mapped date.
    assert.deepEqual(previous.occurrences.filter(item => item.date === row.date).map(item => item.observance_id), oldOccurrence ? [row.observance_id] : []);
    const popular = popularAliases[row.observance_id];
    if (popular) assert.ok(day.calendar_title['sr-Cyrl'].includes(popular), `Alias lacks exact calendar evidence: ${popular}`);
    const aliases = popular ? ['sr-Cyrl', 'sr-Latn'].map(locale => ({ text: localized(popular)[locale], locale, kind: 'popular', source_ids: day.calendar_source_ids })) : [];
    const proposed = {
      subject: row.subject_id === null ? 'none_for_feast' : oldSubject ? 'reuse' : 'add',
      observance: oldObservance ? 'reuse' : 'add', occurrence: oldOccurrence ? 'reuse' : 'add', article_link: oldLink ? 'reuse' : 'add',
    };
    inventory.push({ ...row, julian_date: day.julian_date, calendar_title: day.calendar_title,
      article_title: article.content['sr-Cyrl'].title, article_type: article.type,
      identity_basis: 'Exact approved article title/type and its original church source records; exact approved day-to-article join.',
      identity_note: identityNotes[row.article_id] ?? (article.type === 'group' ? 'Један групни идентитет; без аутоматског издвајања појединаца.' : 'Канонско име из постојећег одобреног текста.'),
      operations: proposed, occurrence_id: oldOccurrence?.id ?? `occ-${row.observance_id}-2026`,
      existing_aliases: [...(oldSubject?.aliases ?? []), ...(oldObservance?.aliases ?? [])], proposed_aliases: aliases,
      calendar_sources: day.calendar_source_ids.map(id => previous.sources.find(s => s.id === id)), article_sources: sourceRecords,
      source_status: 'REUSED_PRIOR_REVIEW_NO_NEW_WEB_CHECK',
      candidate_status: row.package === 'A' ? (oldLink ? 'ALREADY_LINKED_IN_S12' : 'PENDING_METADATA_REVIEW') : 'INVENTORIED_AWAITING_PACKAGE_A_REVIEW',
      unresolved_identity_or_date: [],
    });
    if (row.package !== 'A' || oldLink) continue;
    for (const source of sourceRecords) if (!catalog.sources.some(s => s.id === source.id)) {
      add('sources', { id: source.id, title: source.title, url: source.url, publisher: source.publisher,
        original_author: source.original_author, checked_on: source.reviewed_on, review_status: 'reviewed', rights_status: 'recorded_elsewhere' });
    }
    const name = Object.fromEntries(['sr-Cyrl', 'sr-Latn'].map(locale => [locale, article.content[locale].title]));
    if (proposed.subject === 'add') add('subjects', { id: row.subject_id, type: article.type, name, aliases: [], source_ids: sourceIds, review_status: 'pending' });
    if (!oldObservance) add('observances', { id: row.observance_id, kind, name,
      description: localized(article.type === 'feast' ? 'Празнични спомен' : article.type === 'group' ? 'Спомен групе светих' : 'Спомен светитеља'),
      subject_ids: row.subject_id ? [row.subject_id] : [], aliases, source_ids: sourceIds, review_status: 'pending' });
    if (!oldOccurrence) add('occurrences', { id: `occ-${row.observance_id}-2026`, observance_id: row.observance_id,
      calendar_binding_id: calendarBinding.id, date: row.date, julian_date: day.julian_date,
      calendar_title: day.calendar_title, calendar_source_ids: day.calendar_source_ids, source_ids: sourceIds, review_status: 'pending' });
    add('article_links', { observance_id: row.observance_id, article_binding_id: articleBinding.id, article_id: row.article_id, source_ids: sourceIds, review_status: 'pending' });
  }
  const coverage = catalog.coverage.find(item => item.year === 2026 && item.calendar_profile_id === PROFILE);
  coverage.mapped_dates = new Set([...catalog.occurrences, ...catalog.day_reviews].filter(item => item.calendar_binding_id === calendarBinding.id).map(item => item.date)).size;
  coverage.occurrences = catalog.occurrences.filter(item => item.calendar_binding_id === calendarBinding.id).length;
  const catalogBytes = json(catalog);
  assert.equal(parseCatalogPayload(catalogBytes).valid, true);
  const browser = structuredClone(beforeBrowser);
  Object.assign(browser, { version: '2026.10.6', revision: 4, review_status: 'pending', approval_id: null });
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: hash(catalogBytes) });
  const browserBytes = json(browser);
  assert.equal(parseCalendarBrowserPayload(browserBytes).valid, true);
  const delta = { schema_version: 'svetlost33-ks01-package-a-delta-1', status: 'PENDING_NOT_APPROVED_NOT_A_RELEASE',
    prepared_on: '2026-10-06', window: ['2026-10-09', '2026-10-31'], base_release_set_id: BASE_ID,
    base_index_sha256: BASE_INDEX_HASH, base_release_set_sha256: BASE_SET_HASH,
    candidate_version_is_local_proposal: true, release_sequence_reserved: false,
    before: counts(previous), additions: Object.fromEntries(Object.entries(additions).map(([k,v]) => [k,v.length])), after: counts(catalog),
    alias_additions: additions.observances.flatMap(o => o.aliases.map(a => ({ observance_id: o.id, ...a }))),
    reused_occurrences: inventory.filter(r => r.package === 'A' && r.operations.occurrence === 'reuse').map(r => ({ date: r.date, occurrence_id: r.occurrence_id })),
    already_linked: inventory.filter(r => r.package === 'A' && r.operations.article_link === 'reuse').map(r => ({ date: r.date, article_id: r.article_id })),
    records: additions, new_articles: 0, approved_saints_bytes_changed: false, annual_bytes_changed: false,
    browser_memberships_changed: false, browser_archive_changed: false, settings_migration_changed: false,
    source_checked_dates_advanced: false, new_web_review: false, owner_approval: null,
    capacity: { catalog_bytes: catalogBytes.length, catalog_byte_limit: 524288, browser_bytes: browserBytes.length, browser_byte_limit: 1048576,
      counts: counts(catalog), count_limits: LIMITS, saints_articles: saints.articles.length, saints_bytes: base.modules['saints-v1'].bytes.length, saints_article_limit: 64, saints_byte_limit: 262144 },
    open_gates: ['Fresh public baseline recheck immediately before any future signing/publication', 'Review/approval of exact new identities and links',
      'Package A acceptance before package B candidate', 'Native exact generation acceptance before any activation',
      'Any approval promotion changes bytes: regenerate the browser hash binding and recheck', 'Separate signing/publication authority'],
  };
  const review = ['# KS-01: paket A za pregled', '',
    'Pripremljeno 06.10.2026. Status: pending; nema odobrenja, potpisa ili objave.', '',
    'Paket A povezuje 23 datuma od 09–31.10. Postojeća veza za 27.10. ostaje ista. Za 12.10. dodaje se samo veza ka postojećem članku. Dodato je 20 subjekata, 21 spomen, 21 godišnja pojava i 22 veze ka člancima. Svih 62 teksta i godišnji kalendar ostaju isti.', '',
    'Osnova je S12, potvrđen javnim HTTPS čitanjem koordinatora 06.10.2026. Tačan receipt i njegov hash su u public-baseline-reference.json (50 datoteka, 24 profila). Ta provera potvrđuje osnovu, ne odobrava niti objavljuje ovaj kandidat.', '',
    'Novi identiteti, spomeni, pojave i veze ostaju pending. Novi bibliografski zapisi prenose postojeće reviewed_on datume kao checked_on; to nije nova provera sajta. recorded_elsewhere pokazuje na postojeće zapise o pravima/odobrenju, ne dodeljuje javnu licencu. Nisu sačuvani novi HTML snimci niti izmišljena crkvena recenzija.', '',
    'Kalendar zadržava svoje tačne nazive. Dopunjeni identiteti za Grigorija, Jakova Alfejevog, Filipa đakona i Lukijana potiču iz odobrenih članaka i njihovih izvora. Grupa ostaje grupa. Pokrov nema izmišljeni person-subject. Novi aliasi Томиндан/Srđevdan postoje doslovno u godišnjem kalendaru i izvezeni su na oba pisma.', '',
    'Browser dobija samo tačan binding na ovaj pending katalog. Spisak odabranih praznika i cela istorijska arhivska dodela ostaju isti; Pokrov se ne dodaje automatski u tu zasebno pregledanu listu.', '',
    '## Inventar 42 datuma', '', '| Datum | Postojeći članak | Subjekt / spomen | Potrebna dopuna | Status |', '|---|---|---|---|---|',
    ...inventory.map(r => `| ${r.date} | ${r.article_title} (${r.article_id}) | ${r.subject_id ?? 'bez subjekta'} / ${r.observance_id} | ${Object.entries(r.operations).filter(([,v])=>v==='add').map(([k])=>k).join(', ') || 'već povezano'} | ${r.candidate_status} |`), '',
    'Svaki red u inventory.json ima tačan julijanski datum, izvorni kalendarski naziv, izvore sa originalnim datumima pregleda, alias-e i belešku o identitetu. Nema otvorenog neslaganja identiteta/datuma u ovom ponovnom korišćenju; sve nove kanonske veze i dalje čekaju sadržajni pregled.', '',
    'Paket B (01–19.11.) za sada je inventar. Priprema se posle prihvatanja paketa A. Izvori za novembar ostaju vezani za ranije odobrene godišnje bajtove; ranija nedostupnost kalendarskog URL-a i odsustvo HTML snimaka ostaju vidljiva ograničenja.', '',
    `Limiti: katalog ${catalogBytes.length}/524288 B; browser ${browserBytes.length}/1048576 B; saints ${base.modules['saints-v1'].bytes.length}/262144 B i 62/64 članka. Proširenje kapaciteta nije deo ovog paketa.`, '',
    'Native pretraga, detalj, Sačuvano, Moja slava, offline/restart i stvarno prihvatanje generacije još nisu provereni ovom Node pripremom. Nema promene 2027, posta, Jevanđelja, slika ili korisničkih podešavanja.', '',
  ].join('\n');
  const files = new Map([
    ['inventory.json', json({ schema_version: 'svetlost33-ks01-inventory-1', baseline: 'PUBLIC_S12_CONFIRMED_BY_SEPARATE_COORDINATOR_RECEIPT', rows: inventory })],
    ['package-a.catalog.pending.json', catalogBytes], ['package-a.browser.pending.json', browserBytes],
    ['package-a.delta.json', json(delta)], ['PREGLED.md', Buffer.from(review)],
    ['source-provenance.json', json({ schema_version: 'svetlost33-ks01-provenance-1', inputs: base.inputs,
      source_date_policy: 'Historical reviewed_on copied exactly; no fresh web check, source snapshot, independent rights or clerical claim.',
      new_source_records: additions.sources.map(s => ({ catalog_source_id: s.id, catalog_checked_on: s.checked_on,
        original_approved_source: saints.sources.find(source => source.id === s.id),
        source_payload: record(base.modules['saints-v1'].path, base.modules['saints-v1'].bytes),
        prior_source_registry: s.id.startsWith('comp-') ? 'drafts/saints-completion-2026-09-21/sources.json' : 'drafts/saints-next-window-2026-09-30/sources.json' })),
      public_baseline_confirmation: 'public-baseline-reference.json', new_web_review_performed: false })],
    ['public-baseline-reference.json', json(publicBaseline)],
  ]);
  return { base, previous, beforeBrowser, calendar, saints, catalog, browser, inventory, delta, files, publicBaseline };
}

async function main() {
  assert.ok(process.argv.length === 3 && ['--write-new', '--check'].includes(process.argv[2]), 'Usage: prepare.mjs --write-new | --check');
  const prepared = await prepare();
  assert.equal((await lstat(HERE)).isSymbolicLink(), false);
  if (process.argv[2] === '--write-new') {
    for (const path of prepared.files.keys()) { let exists = true; try { await access(resolve(HERE, path)); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; } assert.equal(exists, false, `Refusing overwrite: ${path}`); }
    for (const [path, bytes] of prepared.files) await writeFile(resolve(HERE, path), bytes, { flag: 'wx' });
  } else for (const [path, bytes] of prepared.files) assert.deepEqual(await readFile(resolve(HERE, path)), bytes, `Non-reproducible: ${path}`);
  console.log(JSON.stringify({ status: 'PASS_PENDING_PACKAGE_A_ONLY', mode: process.argv[2], artifacts: [...prepared.files].map(([p,b]) => record(p,b)), counts: prepared.delta.after }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
