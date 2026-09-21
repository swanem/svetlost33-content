import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleWordCount, toLatin, parseSaintsPayload } from './validate-saints-v1.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DRAFT = 'drafts/saints-completion-2026-09-21';
const S8 = 'releases/v2/production/releases/shared-saints-expansion-2026-09-21-m0v2-s8';
export const BASELINES = Object.freeze({
  saints: { path: `${S8}/modules/saints-v1-2026.9.21-r2/data/saints-v1.json`, sha256: 'e85c725d109a322c109e8455bf94c6ddd28c113e67cd77dde9f34642d3559a21' },
  calendar: { path: 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json', sha256: 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c' },
  catalog: { path: `${S8}/modules/liturgical-catalog-v1-2026.9.20-r3/data/liturgical-catalog-v1.json`, sha256: 'f202bff8a92f4d4f84a6c025ea67144bf61c2df3fe38030fc446de2116d82e8c' }
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const localized = value => ({ 'sr-Cyrl': value, 'sr-Latn': toLatin(value) });
const dateAt = (date, offset) => new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

export function parseManuscript(manuscript, id) {
  const marker = `<!-- article:${id} -->`;
  assert.equal(manuscript.split(marker).length, 2, `Unique marker: ${id}`);
  const chunk = manuscript.split(/^## /mu).find(part => part.includes(marker));
  const title = chunk.split('\n')[0].split(' — ').slice(1).join(' — ');
  assert.ok(title);
  const [intro, body, takeaway] = ['Кратко', 'За читање', 'Шта издвајамо'].map(heading => {
    const delimiter = `### ${heading}\n\n`;
    assert.equal(chunk.split(delimiter).length, 2, `Unique heading: ${id}/${heading}`);
    return chunk.split(delimiter)[1].split('\n### ')[0].trim();
  });
  assert.doesNotMatch(`${title} ${intro} ${body} ${takeaway}`, /[A-Za-z]/u, 'Only Cyrillic edited prose');
  const cyrl = { title, intro, body: body.split(/\n\s*\n/u), takeaway };
  const latn = { title: toLatin(title), intro: toLatin(intro), body: cyrl.body.map(toLatin), takeaway: toLatin(takeaway) };
  for (const text of [cyrl, latn]) assert.ok(articleWordCount(text) >= 100 && articleWordCount(text) <= 200, `100–200 words: ${id}: ${articleWordCount(text)}`);
  return { 'sr-Cyrl': cyrl, 'sr-Latn': latn };
}

// Offline editorial preview only: never grants approval, signs, publishes or updates a catalog.
export function assembleDraft({ previous, calendar, catalog, batches }) {
  assert.equal(previous.articles.length, 14);
  assert.equal(previous.days.length, 14);
  assert.equal(previous.review_status, 'approved');
  assert.equal(batches.length, 3);
  const payload = structuredClone(previous);
  payload.version = '2026.9.21';
  payload.revision = 3;
  payload.approval_id = 'saints-completion-2026-09-21-draft-r3';
  payload.review_status = 'draft';
  const articles = [], sources = [], wordCounts = [];
  const masterSections = [];
  for (const batch of batches) {
    assert.equal(batch.metadata.articles.length, 6);
    assert.equal(batch.manuscript.split(/^## /mu).length - 1, 6);
    for (const source of batch.metadata.sources) {
      assert.ok(source.id.startsWith('comp-'));
      assert.ok(!payload.sources.some(item => item.id === source.id), `Unique source: ${source.id}`);
      assert.ok(source.check_method && source.checked_on === '2026-09-21');
      assert.ok(source.url.startsWith('https://'));
      sources.push(source);
      payload.sources.push({ id: source.id, kind: 'article', title: source.title_original, url: source.url,
        publisher: source.publisher_original, original_author: source.original_author,
        published_on: source.published_on, reviewed_on: source.checked_on });
    }
    for (const article of batch.metadata.articles) {
      const date = dateAt('2026-10-03', articles.length);
      assert.equal(article.date, date);
      assert.ok(!payload.articles.some(item => item.id === article.id), `Unique article: ${article.id}`);
      const day = calendar.days.find(item => item.date === date);
      assert.equal(article.julian_date, day.julian_date);
      assert.equal(day.commemoration.status, 'SOURCE_RECORDED');
      assert.equal(day.commemoration.complete_saint_list_verified, false);
      assert.ok(article.source_ids.length > 0 && article.source_ids.every(id => sources.some(source => source.id === id)));
      assert.ok(article.claims.length > 0);
      for (const claim of article.claims) {
        const editorial = ['editorial_interpretation', 'editorial_reflection'].includes(claim.kind);
        assert.ok(claim.location && claim.label && claim.kind && Array.isArray(claim.source_ids), `Claim shape: ${article.id}`);
        assert.ok((editorial || claim.source_ids.length > 0) && claim.source_ids.every(id => article.source_ids.includes(id)), `Claim evidence: ${article.id}`);
      }
      assert.ok(article.claims.some(claim => claim.source_ids.length > 0), `At least one sourced claim: ${article.id}`);
      const content = parseManuscript(batch.manuscript, article.id);
      payload.articles.push({ id: article.id, revision: 1, type: article.type, subtype: article.subtype, source_ids: [...article.source_ids], content });
      const calendarNotes = date === '2026-10-04' ? [{ kind: 'leavetaking', label: localized('Оданије Воздвижења'), related_article_id: 'exaltation-cross', source_ids: [...day.commemoration.source_ids] }] : [];
      payload.days.push({ date, julian_date: day.julian_date, calendar_title: localized(day.commemoration.title_cyrl),
        calendar_source_ids: [...day.commemoration.source_ids], article_ids: [article.id], complete_saint_list: false, calendar_notes: calendarNotes });
      articles.push({ ...article, review_status: 'pending_human_review', owner_approval: null, clerical_review: null,
        takeaway_status: 'editorial_interpretation_not_saint_quotation', date_proof: `coverage.json#${date}` });
      wordCounts.push({ id: article.id, date, cyrl: articleWordCount(content['sr-Cyrl']), latn: articleWordCount(content['sr-Latn']) });
      masterSections.push(`## ${batch.manuscript.split(/^## /mu).find(part => part.includes(`<!-- article:${article.id} -->`)).trim()}`);
    }
  }
  assert.equal(articles.length, 18);
  assert.deepEqual(payload.articles.slice(0, 14), previous.articles);
  assert.deepEqual(payload.days.slice(0, 14), previous.days);
  assert.deepEqual(payload.sources.slice(0, previous.sources.length), previous.sources);
  assert.deepEqual(payload.calendar_binding, previous.calendar_binding);
  const bytes = json(payload);
  assert.equal(parseSaintsPayload(bytes).valid, true, `Draft schema, transliteration and byte limit: ${bytes.length}`);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = dateAt('2026-09-21', index);
    const day = calendar.days.find(item => item.date === date);
    const existing = previous.days.find(item => item.date === date);
    const candidate = payload.days.find(item => item.date === date);
    assert.ok(candidate, `Covered date: ${date}`);
    return { date, julian_date: day.julian_date, calendar_title_cyrl: day.commemoration.title_cyrl,
      calendar_status: day.commemoration.status, calendar_source_ids: [...day.commemoration.source_ids],
      complete_saint_list_verified: false, published_article_ids: existing?.article_ids ?? [],
      draft_article_ids: existing ? [] : candidate.article_ids,
      state: existing ? 'published_existing' : 'draft_pending_review',
      calendar_notes: candidate.calendar_notes,
      existing_observance_ids: catalog.occurrences.filter(item => item.date === date).map(item => item.observance_id) };
  });
  const coverage = { document_kind: 'editorial_30_day_coverage_not_runtime_calendar', prepared_on: '2026-09-21',
    window: { from: '2026-09-21', to: '2026-10-20', days: 30, calendar_profile_id: 'spc-rs-ba-julian-v1' },
    review_status: 'pending_human_review', owner_approval: null, baselines: BASELINES,
    counts: { published_days_in_window: 12, draft_days_in_window: 18, unwritten_days_in_window: 0,
      published_articles_total: 14, candidate_articles_total: 32 },
    complete_saint_list: false, coverage_2027: 'unchanged_not_expanded', days };
  const manuscript = '# Светитељи и празници — допуна преосталих 18 дана\n\n'
    + 'НАЦРТ ЗА ПРЕГЛЕД, НИЈЕ ОБЈАВЉЕНО. Период: 3–20. октобар 2026. Ови текстови затварају радни прозор 21. септембар — 20. октобар, а не целу годину или потпун списак светитеља.\n\n'
    + 'Оригинални уреднички сажеци, припремљени уз помоћ АИ према наведеним црквеним изворима. Житијска предања су тако означена. „Шта издвајамо” је уреднички осврт, не цитат светитеља или нова молитва. Латиница се изводи из истог ћириличног рукописа. Људски преглед тачног текста и одобрење објаве још нису дати.\n\n'
    + masterSections.join('\n\n') + '\n';
  return { payload, bytes, coverage, manuscript, articles, sources, wordCounts };
}

export async function loadDraft(root = ROOT) {
  const inputs = {};
  for (const [key, record] of Object.entries(BASELINES)) {
    const bytes = await readFile(resolve(root, record.path));
    assert.equal(sha256(bytes), record.sha256, `Exact baseline: ${key}`);
    inputs[key] = JSON.parse(bytes);
  }
  const batches = [], inputHashes = [];
  for (const batch of ['01', '02', '03']) {
    const mdPath = `${DRAFT}/batches/${batch}/TEKSTOVI.md`, metaPath = `${DRAFT}/batches/${batch}/metadata.json`;
    const md = await readFile(resolve(root, mdPath)), meta = await readFile(resolve(root, metaPath));
    inputHashes.push({ path: mdPath, sha256: sha256(md) }, { path: metaPath, sha256: sha256(meta) });
    batches.push({ manuscript: md.toString('utf8'), metadata: JSON.parse(meta) });
  }
  return { ...assembleDraft({ previous: inputs.saints, calendar: inputs.calendar, catalog: inputs.catalog, batches }), inputHashes, inputs, batches };
}

export function outputFiles(result) {
  const metadata = { document_kind: 'editorial_working_metadata_not_approval', prepared_on: '2026-09-21',
    review_status: 'pending_human_review', owner_approval: null, clerical_review: null,
    master: 'TEKSTOVI.md', master_locale: 'sr-Cyrl', latin_policy: 'Deterministic toLatin; no separately edited Latin master.',
    rights_basis: 'Prior project-owner assertion of rights; no independently verified new license or legal clearance.',
    authorship: 'Original editorial summaries with AI assistance; source publishers are not authors of these summaries.', articles: result.articles };
  const sources = { document_kind: 'source_registry_not_publication_permission', checked_on: '2026-09-21',
    calendar_proof: { ...BASELINES.calendar, url: 'https://www.eparhija.at/kalendar?m=2026-10',
      recheck: '2026-09-21 web_search_index_text corroborates all 18 title/day pairs; direct web_open cache miss. Bound local calendar remains unchanged.',
      scope: 'SPC date/title only; not verification of all saints, fasting details or Gospel service assignments.' },
    sources: result.sources };
  const report = { status: 'STRUCTURAL_PASS_PENDING_EDITORIAL_APPROVAL', generated_on: '2026-09-21',
    owner_approval: null, signed: false, published: false, runtime_eligible: false,
    baseline: BASELINES, inputs: result.inputHashes, manuscript_sha256: sha256(result.manuscript),
    payload: { path: 'saints-v1.draft.json', bytes: result.bytes.length, sha256: sha256(result.bytes),
      articles: result.payload.articles.length, days: result.payload.days.length, review_status: 'draft' },
    window: result.coverage.window, counts: result.coverage.counts, word_counts: result.wordCounts,
    preserved: { previous_14_articles: true, previous_14_days: true, previous_sources: true, calendar_binding: true, production_files_untouched: true },
    limitations: ['No native UI/upgrade testing of this draft.', 'No new canonically reviewed Save links.', 'Existing catalog article binding must be updated only during an approved shared release.', 'Human exact-text approval and independent clerical review are not supplied.'] };
  return new Map([['TEKSTOVI.md', Buffer.from(result.manuscript)], ['articles.json', json(metadata)], ['sources.json', json(sources)],
    ['coverage.json', json(result.coverage)], ['saints-v1.draft.json', result.bytes], ['validation.json', json(report)]]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(['--write-draft', '--check'].includes(process.argv[2]), 'Usage: node scripts/prepare-saints-completion-draft.mjs --write-draft|--check');
  const result = await loadDraft();
  for (const [name, bytes] of outputFiles(result)) {
    const destination = resolve(ROOT, DRAFT, name);
    if (process.argv[2] === '--write-draft') {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    } else assert.deepEqual(await readFile(destination), bytes, `Generated file is current: ${name}`);
  }
  console.log(JSON.stringify({ status: 'PASS', ...result.coverage.counts, bytes: result.bytes.length,
    manuscript_sha256: sha256(result.manuscript), signed: false, published: false, owner_approval: null }, null, 2));
}
