#!/usr/bin/env node
// Local review artifacts only. No release output, keys, network or approval mutation.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manuscripts } from './manuscript.mjs';
import { loadBase, hash, json, PUBLIC_RECEIPT_PATH, PUBLIC_RECEIPT_HASH } from '../calendar-saints-expansion-2026-10-06/prepare.mjs';
import { toLatin, articleWordCount } from '../../scripts/validate-saints-v1.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const STATUS = 'PENDING_HUMAN_TEXT_IDENTITY_RIGHTS_AND_PUBLICATION_REVIEW';
const loc = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const count = c => Object.fromEntries(['sources', 'subjects', 'observances', 'occurrences', 'article_links'].map(k => [k, c[k].length]));
const PROTECTED = {
  'drafts/calendar-saints-expansion-2026-10-06/handoff.json': '5c6c7664c8dec4ec72959ad59a0916ec9154670162c5523eee315f8146f96bf6',
  'fixtures/ks01-capacity-2026-10-06/generated/handoff.json': '1e47b55ff442628eb0445ecbb0456d48b511ec449912b55a154d4ab9a12e0c33',
  'drafts/ks01-capacity-shared-implementation-2026-10-06/handoff.json': '1838ab2e80bb693eea1e069ec9194476e84ac9cca836c7b00b47f75e12944d04',
};

// Exact annual rows, never arithmetic conversion from a website's commemoration.
export function assertAnnualMapping(mapping, calendar) {
  const matches = calendar.days.filter(d => d.date === mapping.date);
  assert.equal(matches.length, 1);
  const day = matches[0];
  assert.equal(day.commemoration.status, 'SOURCE_RECORDED');
  assert.equal(day.commemoration.complete_saint_list_verified, false);
  assert.equal(mapping.julian_date, day.julian_date);
  assert.deepEqual(mapping.calendar_title, loc(day.commemoration.title_cyrl));
  assert.deepEqual(mapping.calendar_source_ids, day.commemoration.source_ids);
}

export async function prepare() {
  const base = await loadBase();
  const calendar = base.modules['calendar-2026-r1'].payload;
  const beforeSaints = base.modules['saints-v1'].payload;
  const beforeCatalog = base.modules['liturgical-catalog-v1'].payload;
  const beforeBrowser = base.modules['calendar-browser-v1'].payload;
  const protectedInputs = [];
  for (const [path, expected] of Object.entries({ ...PROTECTED, [PUBLIC_RECEIPT_PATH]: PUBLIC_RECEIPT_HASH })) {
    const bytes = await readFile(resolve(ROOT, path));
    assert.equal(hash(bytes), expected, `Protected input: ${path}`);
    protectedInputs.push(record(path, bytes));
  }
  const sourceRecords = manuscripts.map(m => ({
    id: `ks01-b1-${m.id}`, kind: 'article', title: m.source[0], url: m.source[1],
    publisher: 'Orthodox Church in America', original_author: null, published_on: null, reviewed_on: '2026-10-06',
  }));
  sourceRecords.push({ id: 'ks01-b1-catherine-spc-date', kind: 'article',
    title: 'У Бресју код Косово Поља прослављена Света великомученица Екатарина',
    url: 'https://www.spc.rs/sr/news/5643.u-bresju-kod-kosovo-polja-proslavljena-sveta-velikomucenica-ekatarina.html',
    publisher: 'Информативна служба Српске православне цркве', original_author: null,
    published_on: '2021-12-08', reviewed_on: '2026-10-06' });
  // The existing catalog's calendar source date remains historical. Adding its
  // bibliographic projection to a local saints preview does not assert a fresh fetch.
  const decemberSource = beforeCatalog.sources.find(s => s.id === 'eparhija-month-12');
  assert.ok(decemberSource?.checked_on);
  const calendarSourceAddition = { id: decemberSource.id, kind: 'calendar', title: decemberSource.title,
    url: decemberSource.url, publisher: decemberSource.publisher, original_author: decemberSource.original_author,
    published_on: null, reviewed_on: decemberSource.checked_on };
  const saints = structuredClone(beforeSaints);
  Object.assign(saints, { version: '2026.10.6', revision: 5,
    review_status: 'draft', approval_id: 'ks01-block1-draft-not-owner-approval' });
  saints.sources.push(...sourceRecords, calendarSourceAddition);
  const catalog = structuredClone(beforeCatalog);
  Object.assign(catalog, { version: '2026.10.6', revision: 8, review_status: 'pending', approval_id: null });
  const additions = { sources: [], subjects: [], observances: [], occurrences: [], article_links: [] };
  const add = (key, value) => { additions[key].push(value); catalog[key].push(value); };
  for (const s of sourceRecords) add('sources', { id: s.id, title: s.title, url: s.url, publisher: s.publisher,
    original_author: s.original_author, checked_on: s.reviewed_on, review_status: 'pending', rights_status: 'pending' });
  const calendarBinding = catalog.calendar_bindings.find(x => x.year === 2026);
  const articleBinding = catalog.article_bindings.find(x => x.module_id === 'saints-v1');
  const inventory = [], newArticles = [], newDays = [];
  for (const m of manuscripts) {
    assert.equal(beforeSaints.articles.some(a => a.id === m.id), false);
    assert.equal(beforeSaints.days.some(d => d.date === m.date), false);
    const day = calendar.days.find(d => d.date === m.date);
    assert.ok(day);
    const source_ids = [`ks01-b1-${m.id}`];
    if (m.id === 'catherine-alexandria-martyr') source_ids.push('ks01-b1-catherine-spc-date');
    const cyrl = { title: m.title, intro: m.intro, body: m.body, takeaway: m.takeaway };
    const latn = { title: toLatin(m.title), intro: toLatin(m.intro), body: m.body.map(toLatin), takeaway: toLatin(m.takeaway) };
    assert.doesNotMatch([m.title, m.intro, ...m.body, m.takeaway].join(' '), /[A-Za-z]/u);
    const article = { id: m.id, revision: 1, type: m.type, subtype: m.type === 'feast' ? 'feast' : null,
      source_ids, content: { 'sr-Cyrl': cyrl, 'sr-Latn': latn } };
    const mapping = { date: m.date, julian_date: day.julian_date, calendar_title: loc(day.commemoration.title_cyrl),
      calendar_source_ids: [...day.commemoration.source_ids], article_ids: [m.id], complete_saint_list: false, calendar_notes: [] };
    assertAnnualMapping(mapping, calendar);
    saints.articles.push(article); newArticles.push(article);
    saints.days.push(mapping); newDays.push(mapping);
    const subjectId = Object.hasOwn(m, 'subject_id') ? m.subject_id : `${m.type === 'group' ? 'group' : 'saint'}-${m.id}`;
    const observanceId = m.observance_id ?? `obs-${m.id}`;
    const existingObs = beforeCatalog.observances.find(x => x.id === observanceId);
    const existingSubject = beforeCatalog.subjects.find(x => x.id === subjectId);
    const existingOccurrence = beforeCatalog.occurrences.find(x => x.observance_id === observanceId && x.date === m.date);
    const proofSources = [...mapping.calendar_source_ids, ...source_ids];
    const kind = m.type === 'feast' ? 'feast' : `${m.type}_commemoration`;
    if (existingObs) {
      assert.equal(existingObs.kind, kind);
      assert.deepEqual(existingObs.subject_ids, subjectId ? [subjectId] : []);
    } else {
      if (subjectId && !existingSubject) add('subjects', { id: subjectId, type: m.type,
        name: loc(m.title), aliases: [], source_ids: proofSources, review_status: 'pending' });
      add('observances', { id: observanceId, kind, name: loc(m.title),
        description: loc(m.type === 'group' ? 'Спомен групе светих' : 'Спомен светитеља'),
        subject_ids: subjectId ? [subjectId] : [], aliases: [], source_ids: proofSources, review_status: 'pending' });
    }
    assert.deepEqual(beforeCatalog.occurrences.filter(x => x.date === m.date).map(x => x.id), existingOccurrence ? [existingOccurrence.id] : []);
    if (existingOccurrence) assertAnnualMapping(existingOccurrence, calendar);
    else add('occurrences', { id: `occ-${observanceId}-2026`, observance_id: observanceId,
      calendar_binding_id: calendarBinding.id, date: mapping.date, julian_date: mapping.julian_date,
      calendar_title: mapping.calendar_title, calendar_source_ids: mapping.calendar_source_ids,
      source_ids: proofSources, review_status: 'pending' });
    add('article_links', { observance_id: observanceId, article_binding_id: articleBinding.id,
      article_id: m.id, source_ids: proofSources, review_status: 'pending' });
    inventory.push({ date: m.date, julian_date: mapping.julian_date, calendar_title: mapping.calendar_title,
      calendar_source_ids: mapping.calendar_source_ids, article_id: m.id, subject_id: subjectId,
      observance_id: observanceId, occurrence_id: existingOccurrence?.id ?? `occ-${observanceId}-2026`,
      operation: { article: 'new_pending', subject: subjectId === null ? 'none_for_feast' : existingSubject ? 'reuse' : 'add_pending',
        observance: existingObs ? 'reuse' : 'add_pending', occurrence: existingOccurrence ? 'reuse' : 'add_pending', article_link: 'add_pending' },
      source_ids, identity_note: m.note ?? 'Идентитет је предложен на основу наведеног конкретног црквеног извора; чека људски преглед.',
      canonical_source_commemoration_month_day: m.source[1].match(/\/(11)\/(\d{2})(?:\/|$)/u).slice(1).join('-'),
      date_evidence: { kind: 'EXACT_APPROVED_ANNUAL_ROW_NOT_COMPUTED', calendar_payload_sha256: base.modules['calendar-2026-r1'].file.sha256,
        source_records: mapping.calendar_source_ids.map(id => calendar.sources.find(s => s.id === id)),
        fresh_calendar_web_fetch: false, source_recorded_2026: true, complete_saint_list: false },
      owner_approval: null, clerical_review: null, rights_review: 'pending', unresolved_identity_or_date: [],
      prose_status: STATUS, takeaway_status: 'ORIGINAL_EDITORIAL_REFLECTION_NOT_QUOTATION',
      claims: [{ locations: ['intro', 'body'], kind: 'source_based_summary_with_explicit_tradition_attribution', source_ids: [source_ids[0]] },
        { locations: ['takeaway'], kind: 'editorial_reflection', source_ids: [] }],
      word_counts: { 'sr-Cyrl': articleWordCount(cyrl), 'sr-Latn': articleWordCount(latn) } });
  }
  const saintsBytes = json(saints);
  Object.assign(articleBinding, { version: saints.version, revision: saints.revision, sha256: hash(saintsBytes) });
  const coverage = catalog.coverage.find(x => x.year === 2026);
  coverage.mapped_dates = new Set([...catalog.occurrences, ...catalog.day_reviews].filter(x => x.calendar_binding_id === calendarBinding.id).map(x => x.date)).size;
  coverage.occurrences = catalog.occurrences.filter(x => x.calendar_binding_id === calendarBinding.id).length;
  const catalogBytes = json(catalog);
  const browser = structuredClone(beforeBrowser);
  Object.assign(browser, { version: '2026.10.6', revision: 4, review_status: 'pending', approval_id: null });
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: hash(catalogBytes) });
  const browserBytes = json(browser);
  for (const [label, result] of [['saints', profile.saints.parseSaintsPayload(saintsBytes)],
    ['catalog', profile.catalog.parseCatalogPayload(catalogBytes)], ['browser', profile.browser.parseCalendarBrowserPayload(browserBytes)]]) assert.equal(result.valid, true, `${label}: ${result.reason}`);
  const totals = { dates: 21, existing_articles_reused: 0, new_pending_articles: 21, unknown_identity_or_date: 0,
    content_approval_pending: 21, independent_rights_clearance: 0, real_articles_after_local_merge: 83,
    reused_observances: 2, reused_occurrences: 2, new_subjects: 19, new_observances: 19, new_occurrences: 19, new_article_links: 21 };
  const sourceRegistry = { document_kind: 'PRIMARY_SOURCE_ACCESS_LOG_NOT_APPROVAL_OR_LICENSE', checked_on: '2026-10-06',
    access_method: 'Direct web-tool opens of church pages; extracted article body read during this task, including delegated source research.',
    page_snapshot_saved: false, raw_html_sha256: null, http_status_independently_recorded: false,
    publication_date_policy: 'OCA URL years and commemoration dates are not publication dates; unavailable author/publication fields remain null.',
    calendar_policy: '2026 civil and Julian dates/titles/source IDs copied only from pinned approved annual bytes; no new annual-site fetch or arithmetic occurrence generation.',
    sources: sourceRecords.map(s => ({ ...s, access_status: 'PRIMARY_CHURCH_PAGE_BODY_OPENED', human_review: 'pending', rights_status: 'pending',
      scope: s.id.endsWith('spc-date') ? 'SPC event on 2021-12-07, publication 2021-12-08; contextual Serbian practice, not the 2026 occurrence authority.' : 'Identity and life/tradition summary; displayed November commemoration is a cross-check only.' })),
    calendar_source_addition: { record: calendarSourceAddition, origin: 'Unmodified existing S12 catalog record projected to saints source shape; historical checked_on retained.',
      original_catalog_record: decemberSource } };
  const master = { schema_version: 'svetlost33-ks01-year-end-block1-editorial-master-1', status: STATUS,
    prepared_on: '2026-10-06', window: ['2026-11-20', '2026-12-10'], counts: totals,
    owner_approval: null, clerical_review: null, rights_clearance: null, signed: false, published: false,
    warning: 'PENDING ORIGINAL EDITORIAL DRAFT. Not church-approved, owner-approved, signed, released or automatically publishable. Synthetic capacity fixtures are not real content.',
    scope: 'First later-content block only; no Package A/B promotion or 11–31 December preparation.',
    prose_policy: 'Original Serbian summaries, 100–200 words including separate editorial takeaway; deterministic Latin, no copied source quotations.',
    review_labels: { intro: loc('Кратко'), body: loc('За читање'), takeaway: loc('Шта издвајамо') },
    before_articles: beforeSaints.articles.map(a => ({ id: a.id, title: a.content['sr-Cyrl'].title, action: 'preserve_unchanged' })),
    sources: 'sources.json', rows: inventory, articles: newArticles };
  const delta = { schema_version: 'svetlost33-ks01-year-end-block1-delta-1', status: STATUS, owner_approval: null,
    base_release_set_id: base.set.release_set_id ?? base.index.channels.production.release_set_id,
    base_inputs: base.inputs, protected_inputs: protectedInputs,
    new_article_master: 'master.json#/articles', new_article_ids: newArticles.map(a => a.id), new_day_mappings: newDays,
    new_saints_source_ids: [...sourceRecords, calendarSourceAddition].map(s => s.id),
    catalog_before: count(beforeCatalog), catalog_additions: count(additions), catalog_after: count(catalog), catalog_records: additions,
    proposed_article_binding: articleBinding, proposed_browser_catalog_binding: browser.catalog_binding,
    preview_only: { payloads_materialized_to_runtime_files: false, saints: record('IN_MEMORY_ONLY/saints-v1.draft.json', saintsBytes),
      catalog: record('IN_MEMORY_ONLY/liturgical-catalog-v1.pending.json', catalogBytes), browser: record('IN_MEMORY_ONLY/calendar-browser-v1.pending.json', browserBytes),
      local_versions_not_reserved: true, separate_from_package_a_b: true,
      future_merge_must_rebase_against_accepted_generation: true, profile: profile.id },
    untouched: ['62 approved article objects/IDs/prose/sources/days', 'approved annual bytes', 'S12 payloads/index/signatures', 'Package A pending draft',
      'capacity fixtures and test-only approvals', 'browser feast membership/archive', '2027', 'fasting/Gospel facts', 'native code/builds/settings'],
    open_gates: ['Human review of all 21 new exact bilingual texts, identities and links', 'Rights/permission review; no new license asserted',
      'Package A acceptance before Package B; later block is independent preparation only', 'Second later-content block 11–31 December not prepared here',
      'Actual combined candidate measurement and exact dependency regeneration', 'Compatible native acceptance and separately authorized immutable signing/publication'] };
  const files = new Map([['master.json', json(master)], ['delta.json', json(delta)], ['sources.json', json(sourceRegistry)]]);
  return { base, calendar, beforeSaints, beforeCatalog, beforeBrowser, saints, saintsBytes, catalog, catalogBytes, browser, browserBytes,
    newArticles, newDays, sourceRecords, inventory, additions, totals, files, protectedInputs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(process.argv.length === 3 && ['--write-new', '--check'].includes(mode));
  const p = await prepare();
  if (mode === '--write-new') {
    for (const name of p.files.keys()) {
      let exists = true; try { await access(resolve(HERE, name)); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; }
      assert.equal(exists, false, `Refuse overwrite ${name}`);
    }
    for (const [name, bytes] of p.files) await writeFile(resolve(HERE, name), bytes, { flag: 'wx' });
  } else for (const [name, bytes] of p.files) assert.deepEqual(await readFile(resolve(HERE, name)), bytes, name);
  console.log(JSON.stringify({ status: 'PASS_PENDING_ONLY', mode, ...p.totals,
    files: [...p.files].map(([name, bytes]) => record(name, bytes)) }, null, 2));
}
