#!/usr/bin/env node
// Scoped, offline PENDING artifacts. Runtime payloads exist only in memory.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manuscripts } from './manuscript.mjs';
import { prepare as prepareBlock1, assertAnnualMapping } from '../saints-year-end-block1-2026-10-06/prepare.mjs';
import { hash, json } from '../calendar-saints-expansion-2026-10-06/prepare.mjs';
import { toLatin, articleWordCount } from '../../scripts/validate-saints-v1.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const B1 = 'drafts/saints-year-end-block1-2026-10-06';
export const BLOCK1_HASH = '13e19c3406397d5bf30ab0e03c8e060d4ae8fafd1be38583b76dc18615777ca1';
const STATUS = 'PENDING_HUMAN_TEXT_IDENTITY_RIGHTS_AND_PUBLICATION_REVIEW';
const loc = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const counts = c => Object.fromEntries(['sources', 'subjects', 'observances', 'occurrences', 'article_links'].map(k => [k, c[k].length]));

function finalize(saints, catalog, browser) {
  const saintsBytes = json(saints);
  const binding = catalog.article_bindings.find(x => x.module_id === 'saints-v1');
  Object.assign(binding, { version: saints.version, revision: saints.revision, sha256: hash(saintsBytes) });
  const coverage = catalog.coverage.find(x => x.year === 2026);
  const records = [...catalog.occurrences, ...catalog.day_reviews].filter(x => x.calendar_binding_id === coverage.calendar_binding_id);
  coverage.mapped_dates = new Set(records.map(x => x.date)).size;
  coverage.occurrences = catalog.occurrences.filter(x => x.calendar_binding_id === coverage.calendar_binding_id).length;
  const catalogBytes = json(catalog);
  Object.assign(browser.catalog_binding, { version: catalog.version, revision: catalog.revision, sha256: hash(catalogBytes) });
  const browserBytes = json(browser);
  for (const [name, result] of [['saints', profile.saints.parseSaintsPayload(saintsBytes)],
    ['catalog', profile.catalog.parseCatalogPayload(catalogBytes)], ['browser', profile.browser.parseCalendarBrowserPayload(browserBytes)]]) {
    assert.equal(result.valid, true, `${name}: ${result.reason}`);
  }
  return { saints, catalog, browser, saintsBytes, catalogBytes, browserBytes };
}

export async function prepare() {
  const handoffBytes = await readFile(resolve(ROOT, B1, 'handoff.json'));
  assert.equal(hash(handoffBytes), BLOCK1_HASH, 'Block1 remains pinned; any reviewed revision needs an explicit block2 rebase.');
  const block1Pins = [record(`${B1}/handoff.json`, handoffBytes)];
  for (const entry of JSON.parse(handoffBytes).artifacts) {
    const path = `${B1}/${entry.path}`, bytes = await readFile(resolve(ROOT, path));
    assert.equal(hash(bytes), entry.sha256, `Frozen block1: ${path}`);
    block1Pins.push(record(path, bytes));
  }
  const first = await prepareBlock1();
  const base = first.base, calendar = first.calendar, beforeSaints = first.beforeSaints;
  const beforeCatalog = first.beforeCatalog, beforeBrowser = first.beforeBrowser;
  const sources = [], articles = [], days = [], rows = [];
  const additions = { sources: [], subjects: [], observances: [], occurrences: [], article_links: [] };
  const saints = structuredClone(beforeSaints), catalog = structuredClone(beforeCatalog), browser = structuredClone(beforeBrowser);
  Object.assign(saints, { version: '2026.10.6', revision: 6, review_status: 'draft', approval_id: 'ks01-block2-draft-not-owner-approval' });
  Object.assign(catalog, { version: '2026.10.6', revision: 9, review_status: 'pending', approval_id: null });
  Object.assign(browser, { version: '2026.10.6', revision: 5, review_status: 'pending', approval_id: null });
  const calendarSource = first.saints.sources.find(x => x.id === 'eparhija-month-12');
  assert.equal(calendarSource.reviewed_on, '2026-09-15');
  saints.sources.push(structuredClone(calendarSource));
  const add = (key, value) => { additions[key].push(value); catalog[key].push(value); };
  const calendarBinding = catalog.calendar_bindings.find(x => x.year === 2026);
  const articleBinding = catalog.article_bindings.find(x => x.module_id === 'saints-v1');
  for (const m of manuscripts) {
    const source_ids = [];
    for (const [index, source] of [m.source, ...(m.extra_sources ?? [])].entries()) {
      const id = `ks01-b2-${m.id}${index ? `-${index + 1}` : ''}`;
      const s = { id, kind: 'article', title: source[0], url: source[1],
        publisher: source[2] ?? (index === 0 ? m.publisher : null) ?? 'Orthodox Church in America',
        original_author: null, published_on: index === 0 ? m.published_on ?? null : null, reviewed_on: '2026-10-06' };
      sources.push(s); saints.sources.push(s); source_ids.push(id);
      add('sources', { id, title: s.title, url: s.url, publisher: s.publisher, original_author: null,
        checked_on: s.reviewed_on, review_status: 'pending', rights_status: 'pending' });
    }
    assert.equal(first.saints.articles.some(x => x.id === m.id), false, 'No duplicate of approved62 or prior pending21');
    const cyrl = { title: m.title, intro: m.intro, body: m.body, takeaway: m.takeaway };
    assert.doesNotMatch([m.title, m.intro, ...m.body, m.takeaway].join(' '), /[A-Za-z]/u);
    const latn = { title: toLatin(m.title), intro: toLatin(m.intro), body: m.body.map(toLatin), takeaway: toLatin(m.takeaway) };
    const article = { id: m.id, revision: 1, type: m.type, subtype: m.type === 'feast' ? 'feast' : null,
      source_ids, content: { 'sr-Cyrl': cyrl, 'sr-Latn': latn } };
    const day = calendar.days.find(x => x.date === m.date);
    assert.ok(day);
    const mapping = { date: m.date, julian_date: day.julian_date, calendar_title: loc(day.commemoration.title_cyrl),
      calendar_source_ids: [...day.commemoration.source_ids], article_ids: [m.id], complete_saint_list: false, calendar_notes: [] };
    assertAnnualMapping(mapping, calendar);
    articles.push(article); saints.articles.push(article); days.push(mapping); saints.days.push(mapping);
    const subjectId = Object.hasOwn(m, 'subject_id') ? m.subject_id : `${m.type === 'group' ? 'group' : 'saint'}-${m.id}`;
    const observanceId = m.observance_id ?? `obs-${m.id}`;
    const oldSubject = catalog.subjects.find(x => x.id === subjectId);
    const oldObs = catalog.observances.find(x => x.id === observanceId);
    const oldOccurrence = catalog.occurrences.find(x => x.date === m.date && x.observance_id === observanceId);
    const kind = m.type === 'feast' ? 'feast' : `${m.type}_commemoration`;
    const proofSources = [...mapping.calendar_source_ids, ...source_ids];
    if (oldObs) { assert.equal(oldObs.kind, kind); assert.deepEqual(oldObs.subject_ids, subjectId ? [subjectId] : []); }
    else {
      if (subjectId && !oldSubject) add('subjects', { id: subjectId, type: m.type, name: loc(m.title), aliases: [], source_ids: proofSources, review_status: 'pending' });
      add('observances', { id: observanceId, kind, name: loc(m.title), description: loc(m.type === 'feast' ? 'Празнични спомен' : m.type === 'group' ? 'Спомен групе светих' : 'Спомен светитеља'),
        subject_ids: subjectId ? [subjectId] : [], aliases: [], source_ids: proofSources, review_status: 'pending' });
    }
    assert.deepEqual(beforeCatalog.occurrences.filter(x => x.date === m.date).map(x => x.id), oldOccurrence ? [oldOccurrence.id] : []);
    if (oldOccurrence) assertAnnualMapping(oldOccurrence, calendar);
    else add('occurrences', { id: `occ-${observanceId}-2026`, observance_id: observanceId, calendar_binding_id: calendarBinding.id,
      date: mapping.date, julian_date: mapping.julian_date, calendar_title: mapping.calendar_title,
      calendar_source_ids: mapping.calendar_source_ids, source_ids: proofSources, review_status: 'pending' });
    add('article_links', { observance_id: observanceId, article_binding_id: articleBinding.id, article_id: m.id, source_ids: proofSources, review_status: 'pending' });
    rows.push({ date: m.date, julian_date: mapping.julian_date, calendar_title: mapping.calendar_title,
      calendar_source_ids: mapping.calendar_source_ids, article_id: m.id, subject_id: subjectId, observance_id: observanceId,
      occurrence_id: oldOccurrence?.id ?? `occ-${observanceId}-2026`,
      operation: { article: 'new_pending', subject: subjectId === null ? 'none_for_feast' : oldSubject ? 'reuse' : 'add_pending',
        observance: oldObs ? 'reuse' : 'add_pending', occurrence: oldOccurrence ? 'reuse' : 'add_pending', article_link: 'add_pending' },
      source_ids, source_commemoration_crosschecks: [m.source, ...(m.extra_sources ?? [])].map(s => ({ url: s[1],
        month_day: s[1].includes('oca.org') ? s[1].match(/\/(11|12)\/(\d{2})(?:\/|$)/u).slice(1).join('-') : null,
        authority_for_2026_civil_date: false })),
      identity_note: m.note ?? 'Конкретни наведени црквени извор; идентитет и текст чекају људски преглед.',
      date_evidence: { kind: 'EXACT_PINNED_APPROVED_ANNUAL_ROW_NOT_COMPUTED', payload_sha256: base.modules['calendar-2026-r1'].file.sha256,
        source_records: mapping.calendar_source_ids.map(id => calendar.sources.find(s => s.id === id)), fresh_calendar_web_fetch: false },
      unresolved_identity_or_date: [], excluded_detail_questions: m.open_questions ?? [],
      owner_approval: null, clerical_review: null, rights_review: 'pending', prose_status: STATUS,
      claims: [{ locations: ['intro', 'body'], kind: 'source_based_summary_with_explicit_tradition_attribution', source_ids },
        { locations: ['takeaway'], kind: 'original_editorial_reflection_not_quotation', source_ids: [] }],
      word_counts: { 'sr-Cyrl': articleWordCount(cyrl), 'sr-Latn': articleWordCount(latn) } });
  }
  const standalone = finalize(saints, catalog, browser);
  // Separately labelled measurement only; previous pending prose is not promoted.
  const combinedSaints = structuredClone(first.saints), combinedCatalog = structuredClone(first.catalog), combinedBrowser = structuredClone(first.browser);
  Object.assign(combinedSaints, { version: saints.version, revision: saints.revision, approval_id: 'ks01-both-blocks-draft-no-approval' });
  combinedSaints.sources.push(...structuredClone(sources)); combinedSaints.articles.push(...structuredClone(articles)); combinedSaints.days.push(...structuredClone(days));
  Object.assign(combinedCatalog, { version: catalog.version, revision: catalog.revision });
  for (const key of Object.keys(additions)) combinedCatalog[key].push(...structuredClone(additions[key]));
  Object.assign(combinedBrowser, { version: browser.version, revision: browser.revision });
  const combined = finalize(combinedSaints, combinedCatalog, combinedBrowser);
  const totals = { dates: 21, existing_articles_reused: 0, new_pending_articles: 21, unknown_identity_or_date: 0,
    content_approval_pending: 21, excluded_detail_questions: 1, independent_rights_clearance: 0,
    reused_subjects: 1, reused_observances: 1, reused_occurrences: 1, new_subjects: 19, new_observances: 20, new_occurrences: 20, new_article_links: 21,
    standalone_real_articles: 83, combined_real_articles: 104, combined_new_pending_articles: 42, still_approved_original_articles: 62 };
  const sourceRegistry = { document_kind: 'PRIMARY_SOURCE_ACCESS_NOT_APPROVAL_OR_LICENSE', checked_on: '2026-10-06',
    sources: sources.map(s => ({ ...s, access_status: 'PRIMARY_CHURCH_PAGE_BODY_DIRECTLY_OPENED', human_review: 'pending', rights_status: 'pending' })),
    html_snapshot_saved: false, raw_html_sha256: null, access_method: 'Web-tool direct opens and extracted source body read during this task; no subagent research for block2.',
    publication_policy: 'Only Mitropolija page explicitly dated20.12.2021 has published_on. OCA calendar URL years are not publication dates.',
    calendar_source_projection: { record: calendarSource, original_checked_on_preserved: true, fresh_web_fetch: false },
    source_conflicts_not_silently_resolved: [{ article_id: 'gregory-gornjak', issue: 'Place and exact year of repose differ/are uncertain; omitted from prose.', blocks_identity_or_date: false }],
    access_failures: 'Some 2026/all-lives and alternate-year URLs cache-missed; successful directly opened exact URLs are the only cited records. No failed URL is claimed as a read.',
    calendar_authority: 'Pinned approved2026 annual rows only; no arithmetic conversion, inferred annual recurrence, new fasting rule or Gospel assignment.' };
  const master = { schema_version: 'svetlost33-ks01-year-end-block2-editorial-master-1', status: STATUS,
    prepared_on: '2026-10-06', window: ['2026-12-11', '2026-12-31'], counts: totals,
    owner_approval: null, clerical_review: null, rights_clearance: null, signed: false, published: false,
    warning: 'PENDING original editorial content, not church/owner approval or a release. The first block and existing62 are immutable inputs; synthetic capacity prose is not used.',
    prose_policy: '100–200 words including separate original editorial takeaway; Latin derived deterministically from Cyrillic.',
    review_labels: { intro: loc('Кратко'), body: loc('За читање'), takeaway: loc('Шта издвајамо') },
    reuse_inventory: { checked_approved_article_ids: beforeSaints.articles.map(x => x.id), checked_pending_block1_article_ids: first.newArticles.map(x => x.id),
      rejected_as_wrong_observance: [{ existing_article_id: 'joachim-and-anna', date: '2026-12-22', reason: 'group article explicitly refers to September post-Nativity commemoration, not this conception feast' }],
      checked_wrong_identity_pairs: [['sabbas-sanctified', 'saint-sava-serbian'], ['menas-hermogenes-eugraphus-alexandria', 'menas-egypt-martyr'],
        ['daniel-prophet', 'daniel-stylite-constantinople'], ['eustratius-sebaste-martyr', 'greatmartyr-eustathius']],
      reused_catalog_observance: 'obs-nicholas-december', not_automatically_linked: 'obs-nicholas-relics-transfer' },
    sources: 'sources.json', rows, articles };
  const measurements = view => ({ articles: view.saints.articles.length, saints: record('IN_MEMORY_ONLY/saints-v1.json', view.saintsBytes),
    catalog: record('IN_MEMORY_ONLY/liturgical-catalog-v1.json', view.catalogBytes), browser: record('IN_MEMORY_ONLY/calendar-browser-v1.json', view.browserBytes),
    counts: counts(view.catalog), article_binding: view.catalog.article_bindings.find(x => x.module_id === 'saints-v1'), browser_catalog_binding: view.browser.catalog_binding });
  const delta = { schema_version: 'svetlost33-ks01-year-end-block2-delta-1', status: STATUS, owner_approval: null,
    base_inputs: base.inputs, protected_block1_inputs: block1Pins, previous_protected_inputs: first.protectedInputs,
    new_article_master: 'master.json#/articles', new_article_ids: articles.map(x => x.id), new_day_mappings: days,
    new_source_records: sources, calendar_source_addition_for_standalone_only: calendarSource,
    catalog_records: additions, catalog_before: counts(beforeCatalog), catalog_additions: counts(additions),
    standalone_S12_plus_block2: measurements(standalone), combined_S12_plus_both_pending_blocks: measurements(combined),
    combined_status: 'IN_MEMORY_MEASUREMENT_ONLY_62_APPROVED_PLUS42_PENDING_NOT_A_RELEASE',
    runtime_payload_files_written: false, candidate_versions_not_reserved: true,
    profile: profile.id, decision_sha256: profile.decision_sha256,
    untouched: ['Approved62 raw articles/IDs/days/sources', 'annual2026 bytes', 'S12', 'block1 frozen artifacts', 'Package A', 'Package B not generated',
      'test-only capacity fixtures', 'browser membership/archive', '2027', 'fasting/Gospel facts', 'native builds/code/settings'],
    open_gates: ['Independent human text/identity/link review of block2 and pending block1', 'Rights review, no new license asserted',
      'Resolve any reviewer findings by explicit revision, never silent frozen-master edits', 'Package A acceptance before Package B generation',
      'Real final whole-generation merge after approvals, exact bindings and compatible native acceptance', 'Separate signing/publication authority'] };
  const files = new Map([['master.json', json(master)], ['delta.json', json(delta)], ['sources.json', json(sourceRegistry)]]);
  return { first, base, calendar, beforeSaints, beforeCatalog, beforeBrowser, sources, articles, days, rows, additions, totals,
    standalone, combined, files, block1Pins };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]; assert.ok(process.argv.length === 3 && ['--write-new', '--check'].includes(mode));
  const p = await prepare();
  if (mode === '--write-new') {
    for (const name of p.files.keys()) { let exists = true; try { await access(resolve(HERE, name)); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; } assert.equal(exists, false, `Refuse overwrite ${name}`); }
    for (const [name, bytes] of p.files) await writeFile(resolve(HERE, name), bytes, { flag: 'wx' });
  } else for (const [name, bytes] of p.files) assert.deepEqual(await readFile(resolve(HERE, name)), bytes, name);
  console.log(JSON.stringify({ status: 'PASS_PENDING_ONLY', counts: p.totals,
    files: [...p.files].map(([name, bytes]) => record(name, bytes)) }, null, 2));
}
