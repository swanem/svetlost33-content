import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, json, sha256 } from './prepare-charity-release-v2.mjs';
import { CALENDAR_BINDING } from './export-saints-pilot-v1.mjs';
import { articleWordCount, parseSaintsPayload, toLatin } from './validate-saints-v1.mjs';
import { validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';

export const EXPANSION_VERSION = '2026.9.21';
export const EXPANSION_REVISION = 2;
export const EXPANSION_APPROVAL_ID = 'saints-expansion-2026-09-21-owner-r2';
export const EXPANSION_APPROVAL_PATH = 'approvals/saints-expansion-2026-09-21/owner-publication-approval.json';
export const EXPANSION_APPROVAL_SHA256 = '9fbf94f2ad68366e0157b7aec3754d84acdde883362fb297f1b0afec12efb20b';
export const EXPANSION_DRAFT = 'drafts/saints-expansion-2026-09-21';
export const EXPANSION_INPUTS = Object.freeze({
  manuscript: { path: `${EXPANSION_DRAFT}/TEKSTOVI.md`, sha256: '0f912a46cff2f1558018d43d8e2c564d5b0d44e56fb7ab2eafd7971c1676d0ba' },
  metadata: { path: `${EXPANSION_DRAFT}/articles.json`, sha256: 'd711be392023892c05844c1011796b05360984f4479716b801c3687bc7bf6692' },
  sources: { path: `${EXPANSION_DRAFT}/sources.json`, sha256: '62e76ae799a2e7d2f7a5b4af718fba961fbad46dbb8c17462e91e0351c7ff26f' },
  coverage: { path: `${EXPANSION_DRAFT}/coverage.json`, sha256: '05b8cf4c969e457e725fceb76bb518aa28c3a62461fa8e5dfe8966bbdbe9aeeb' },
  previous: { path: 'releases/v2/production/releases/shared-saints-2026-09-19-m0v2-s6/modules/saints-v1-2026.9.19-r1/data/saints-v1.json', sha256: 'ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000' },
  calendar: { path: 'releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json', sha256: CALENDAR_BINDING.sha256 },
  catalog: { path: 'modules/liturgical-catalog-v1/2026.9.20-r2/data/liturgical-catalog-v1.json', sha256: '18a581b5bb1a3c881d48a9af3fc3e05596d3528c82ba29bfe53cedd54ec7f910' }
});
export const EXPANSION_ARTICLE_IDS = Object.freeze(['dedication-resurrection-jerusalem', 'exaltation-cross', 'greatmartyr-niketas-goth', 'dorotheus-egypt', 'faith-hope-love-sophia', 'eumenius-gortyna', 'trophimus-sabbatius-dorymedon']);
const localized = value => ({ 'sr-Cyrl': value, 'sr-Latn': toLatin(value) });

export async function loadExpansionInputs(root = ROOT) {
  const inputs = {};
  for (const [key, record] of Object.entries(EXPANSION_INPUTS)) {
    const bytes = await readFile(resolve(root, record.path));
    assert.equal(sha256(bytes), record.sha256, `Exact expansion input: ${key}`);
    inputs[key] = key === 'manuscript' ? bytes.toString('utf8') : JSON.parse(bytes);
  }
  return inputs;
}

function articleText(manuscript, id) {
  const marker = `<!-- article:${id} -->`;
  assert.equal(manuscript.split(marker).length, 2, `Unique manuscript marker: ${id}`);
  const chunk = manuscript.split(/^## /mu).find(section => section.includes(marker));
  assert.ok(chunk);
  const title = chunk.split('\n')[0].split(' — ').slice(1).join(' — ');
  assert.ok(title);
  const sections = ['Кратко', 'За читање', 'Шта издвајамо'].map(heading => {
    assert.equal(chunk.split(`### ${heading}\n\n`).length, 2, `Unique heading: ${id}/${heading}`);
    return chunk.split(`### ${heading}\n\n`)[1].split('\n### ')[0].trim();
  });
  assert.doesNotMatch(sections.join(' '), /[A-Za-z]/u, 'Single Cyrillic master');
  const cyrl = { title, intro: sections[0], body: sections[1].split(/\n\s*\n/u), takeaway: sections[2] };
  return { 'sr-Cyrl': cyrl, 'sr-Latn': { title: toLatin(title), intro: toLatin(cyrl.intro), body: cyrl.body.map(toLatin), takeaway: toLatin(cyrl.takeaway) } };
}

// Pure editorial transformation. It does not authenticate, sign, write or publish.
// The release loader separately checks the exact owner approval and its hashes.
export function transformSaintsExpansion(inputs) {
  const { previous, metadata, manuscript, sources, calendar, catalog } = inputs;
  assert.deepEqual(metadata.articles.map(article => article.id), EXPANSION_ARTICLE_IDS);
  assert.equal(previous.articles.length, 7); assert.equal(previous.days.length, 7);
  assert.deepEqual(previous.calendar_binding, CALENDAR_BINDING);
  const payload = structuredClone(previous);
  payload.version = EXPANSION_VERSION; payload.revision = EXPANSION_REVISION;
  payload.approval_id = EXPANSION_APPROVAL_ID; payload.review_status = 'approved';
  const calendarSourceIds = new Set(previous.sources.filter(source => source.kind === 'calendar').map(source => source.id));
  for (const [index, article] of metadata.articles.entries()) {
    const date = new Date(Date.UTC(2026, 8, 26 + index)).toISOString().slice(0, 10);
    assert.equal(article.date, date);
    const day = calendar.days.find(item => item.date === date);
    assert.ok(day); assert.equal(day.julian_date, article.julian_date);
    assert.equal(day.commemoration.status, 'SOURCE_RECORDED');
    assert.equal(day.commemoration.complete_saint_list_verified, false);
    for (const id of day.commemoration.source_ids) if (!calendarSourceIds.has(id)) {
      const source = calendar.sources.find(item => item.id === id); assert.ok(source);
      payload.sources.push({ id, kind: 'calendar', title: source.title, url: source.url,
        publisher: previous.sources.find(item => item.id === 'eparhija-month-09').publisher,
        original_author: null, published_on: null, reviewed_on: sources.checked_on });
      calendarSourceIds.add(id);
    }
    payload.articles.push({ id: article.id, revision: 1, type: article.type, subtype: article.subtype,
      source_ids: [...article.source_ids], content: articleText(manuscript, article.id) });
    payload.days.push({ date, julian_date: day.julian_date, calendar_title: localized(day.commemoration.title_cyrl),
      calendar_source_ids: [...day.commemoration.source_ids], article_ids: [article.id], complete_saint_list: false, calendar_notes: [] });
  }
  const used = new Set(metadata.articles.flatMap(article => article.source_ids));
  for (const source of sources.sources.filter(item => used.has(item.id))) {
    assert.ok(!payload.sources.some(item => item.id === source.id), `Unique source: ${source.id}`);
    payload.sources.push({ id: source.id, kind: 'article', title: source.title_original, url: source.url,
      publisher: source.publisher_original, original_author: source.original_author,
      published_on: source.published_on, reviewed_on: source.checked_on });
  }
  assert.deepEqual(payload.articles.slice(0, 7), previous.articles);
  assert.deepEqual(payload.days.slice(0, 7), previous.days);
  assert.deepEqual(payload.sources.slice(0, previous.sources.length), previous.sources);
  const bytes = json(payload); assert.equal(parseSaintsPayload(bytes).valid, true);
  const updatedCatalog = structuredClone(catalog);
  updatedCatalog.revision = 3; updatedCatalog.approval_id = EXPANSION_APPROVAL_ID;
  assert.equal(updatedCatalog.article_bindings.length, 1);
  const binding = updatedCatalog.article_bindings[0];
  assert.equal(binding.module_id, 'saints-v1'); assert.equal(binding.sha256, EXPANSION_INPUTS.previous.sha256);
  binding.version = payload.version; binding.revision = payload.revision; binding.sha256 = sha256(bytes);
  assert.deepEqual(validateCatalogPayload(updatedCatalog), { valid: true, reason: null });
  return { payload, bytes, catalog: updatedCatalog, catalogBytes: json(updatedCatalog),
    wordCounts: payload.articles.map(article => ({ id: article.id, 'sr-Cyrl': articleWordCount(article.content['sr-Cyrl']), 'sr-Latn': articleWordCount(article.content['sr-Latn']) })) };
}

export async function buildSaintsExpansion(root = ROOT) {
  const approvalBytes = await readFile(resolve(root, EXPANSION_APPROVAL_PATH));
  assert.equal(sha256(approvalBytes), EXPANSION_APPROVAL_SHA256, 'Exact publication approval');
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.approval_id, EXPANSION_APPROVAL_ID);
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.equal(approval.approver_role, 'project_owner');
  assert.equal(approval.statement, 'objavi sadržaj i nastavi');
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.deepEqual(approval.manuscript, EXPANSION_INPUTS.manuscript);
  assert.deepEqual(approval.new_article_ids, EXPANSION_ARTICLE_IDS);
  assert.deepEqual(approval.source_inputs, EXPANSION_INPUTS);
  assert.equal(approval.clerical_review, null);
  assert.equal(approval.scope.remaining_18_unwritten_days_approved, false);
  const result = transformSaintsExpansion(await loadExpansionInputs(root));
  for (const [key, payload, bytes] of [['saints', result.payload, result.bytes], ['catalog', result.catalog, result.catalogBytes]]) {
    assert.deepEqual(approval.payloads[key], { version: payload.version, revision: payload.revision, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { ...result, approval, approvalBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--check', 'Usage: node scripts/export-saints-expansion-v1.mjs --check');
  const result = await buildSaintsExpansion();
  console.log(JSON.stringify({ status: 'PASS', saints: { articles: result.payload.articles.length, days: result.payload.days.length, bytes: result.bytes.length, sha256: sha256(result.bytes) }, catalog: { bytes: result.catalogBytes.length, sha256: sha256(result.catalogBytes) }, word_counts: result.wordCounts, signed: false, published: false }, null, 2));
}
