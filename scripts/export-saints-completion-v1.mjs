import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, json, sha256 } from './prepare-charity-release-v2.mjs';
import { BASELINES, parseManuscript } from './prepare-saints-completion-draft.mjs';
import { articleWordCount, parseSaintsPayload, toLatin } from './validate-saints-v1.mjs';
import { validateCatalogPayload } from './validate-liturgical-catalog-v1.mjs';

export const COMPLETION_APPROVAL_ID = 'saints-completion-2026-09-21-owner-r3';
export const COMPLETION_APPROVAL_PATH = 'approvals/saints-completion-2026-09-21/owner-publication-approval.json';
export const COMPLETION_APPROVAL_SHA256 = '8a103bf8ba8508360d377236517660320708cf1221caf8c279fe91fefb78df06';
const DRAFT = 'drafts/saints-completion-2026-09-21';
export const COMPLETION_INPUTS = Object.freeze({
  manuscript: { path: `${DRAFT}/TEKSTOVI.md`, sha256: 'c7d7e8ea931ae9f88fed2e7c3678a6f895028c08dff72110dc55b08ddbb06609' },
  metadata: { path: `${DRAFT}/articles.json`, sha256: 'c058cf62ee3c40061a7a0906c417a5efcdc1b173f0ca86c39655c5532f2c0ae8' },
  sources: { path: `${DRAFT}/sources.json`, sha256: '6a5705620d8c95ff6fb5c9feac83ccfb610af3f1fad6df59320d66209bfa27aa' },
  coverage: { path: `${DRAFT}/coverage.json`, sha256: 'a1c42a8aa67ab0243b9b75144482d05f5827792b28645b890d6595907bed0d6b' },
  draft: { path: `${DRAFT}/saints-v1.draft.json`, sha256: 'c8df176dc5e5355f8eb355b94b1da59dd4ae215ba95ab7ef0bf24a29826fd21c' },
  previous: BASELINES.saints,
  calendar: BASELINES.calendar,
  catalog: BASELINES.catalog
});
export const COMPLETION_ARTICLE_IDS = Object.freeze([
  'greatmartyr-eustathius', 'apostle-quadratus', 'hieromartyr-phocas-sinope',
  'conception-john-forerunner', 'protomartyr-thecla', 'euphrosyne-alexandria',
  'john-theologian-repose', 'callistratus-companions', 'chariton-confessor',
  'cyriacus-anchorite-miholjdan', 'gregory-enlightener-armenia', 'protection-theotokos',
  'cyprian-antioch-justina', 'dionysius-areopagite', 'hierotheus-athens',
  'martyr-charitina-amisos', 'apostle-thomas', 'sergius-bacchus'
]);
const dateAt = (date, offset) => new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const localized = value => ({ 'sr-Cyrl': value, 'sr-Latn': toLatin(value) });

export async function loadCompletionInputs(root = ROOT) {
  const inputs = {};
  for (const [key, record] of Object.entries(COMPLETION_INPUTS)) {
    const bytes = await readFile(resolve(root, record.path));
    assert.equal(sha256(bytes), record.sha256, `Exact completion input: ${key}`);
    inputs[key] = key === 'manuscript' ? bytes.toString('utf8') : JSON.parse(bytes);
  }
  return inputs;
}

// Pure transformation of frozen editorial inputs, not publication authorization.
// The build entry point independently authenticates the exact owner approval.
export function transformSaintsCompletion(inputs) {
  const { manuscript, metadata, sources, coverage, draft, previous, calendar, catalog } = inputs;
  assert.equal(previous.articles.length, 14); assert.equal(previous.days.length, 14);
  assert.equal(previous.review_status, 'approved');
  assert.equal(draft.review_status, 'draft');
  assert.equal(draft.approval_id, 'saints-completion-2026-09-21-draft-r3');
  assert.equal(draft.version, '2026.9.21'); assert.equal(draft.revision, 3);
  assert.equal(draft.articles.length, 32); assert.equal(draft.days.length, 32);
  assert.equal(metadata.owner_approval, null); assert.equal(metadata.clerical_review, null);
  assert.deepEqual(metadata.articles.map(article => article.id), COMPLETION_ARTICLE_IDS);
  assert.equal(sources.sources.length, 27);
  assert.deepEqual(draft.articles.slice(0, 14), previous.articles);
  assert.deepEqual(draft.days.slice(0, 14), previous.days);
  assert.deepEqual(draft.calendar_binding, previous.calendar_binding);
  assert.deepEqual(draft.sources.slice(0, previous.sources.length), previous.sources);
  assert.deepEqual(draft.sources.slice(previous.sources.length), sources.sources.map(source => ({
    id: source.id, kind: 'article', title: source.title_original, url: source.url,
    publisher: source.publisher_original, original_author: source.original_author,
    published_on: source.published_on, reviewed_on: source.checked_on
  })));
  const sourceIds = new Set(sources.sources.map(source => source.id));
  assert.equal(sourceIds.size, 27);
  for (const [index, article] of metadata.articles.entries()) {
    const date = dateAt('2026-10-03', index);
    assert.equal(article.date, date);
    const day = calendar.days.find(item => item.date === date);
    assert.ok(day); assert.equal(article.julian_date, day.julian_date);
    assert.equal(day.commemoration.status, 'SOURCE_RECORDED');
    assert.equal(day.commemoration.complete_saint_list_verified, false);
    assert.ok(article.source_ids.length > 0 && article.source_ids.every(id => sourceIds.has(id)));
    assert.ok(article.claims.length > 0);
    for (const claim of article.claims) {
      const editorial = ['editorial_interpretation', 'editorial_reflection'].includes(claim.kind);
      assert.ok(claim.location && claim.label && claim.kind && Array.isArray(claim.source_ids));
      assert.ok((editorial || claim.source_ids.length > 0) && claim.source_ids.every(id => article.source_ids.includes(id)), `Claim evidence: ${article.id}`);
    }
    assert.ok(article.claims.some(claim => claim.source_ids.length > 0));
    assert.deepEqual(draft.articles[14 + index], {
      id: article.id, revision: 1, type: article.type, subtype: article.subtype,
      source_ids: article.source_ids, content: parseManuscript(manuscript, article.id)
    });
    assert.deepEqual(draft.days[14 + index], {
      date, julian_date: day.julian_date, calendar_title: localized(day.commemoration.title_cyrl),
      calendar_source_ids: day.commemoration.source_ids, article_ids: [article.id], complete_saint_list: false,
      calendar_notes: date === '2026-10-04' ? [{ kind: 'leavetaking', label: localized('Оданије Воздвижења'), related_article_id: 'exaltation-cross', source_ids: day.commemoration.source_ids }] : []
    });
  }
  assert.deepEqual(coverage.window, { from: '2026-09-21', to: '2026-10-20', days: 30, calendar_profile_id: 'spc-rs-ba-julian-v1' });
  assert.equal(coverage.days.length, 30);
  for (const [index, day] of coverage.days.entries()) {
    assert.equal(day.date, dateAt('2026-09-21', index));
    assert.ok(draft.days.some(item => item.date === day.date));
  }
  assert.ok(draft.days.every(day => day.date.startsWith('2026-') && day.complete_saint_list === false));
  const payload = structuredClone(draft);
  payload.review_status = 'approved'; payload.approval_id = COMPLETION_APPROVAL_ID;
  const bytes = json(payload);
  assert.equal(parseSaintsPayload(bytes).valid, true);
  const updatedCatalog = structuredClone(catalog);
  assert.equal(catalog.version, '2026.9.20'); assert.equal(catalog.revision, 3);
  assert.equal(catalog.article_bindings.length, 1);
  const binding = updatedCatalog.article_bindings[0];
  assert.equal(binding.module_id, 'saints-v1'); assert.equal(binding.sha256, COMPLETION_INPUTS.previous.sha256);
  updatedCatalog.revision = 4; updatedCatalog.approval_id = COMPLETION_APPROVAL_ID;
  binding.version = payload.version; binding.revision = payload.revision; binding.sha256 = sha256(bytes);
  assert.deepEqual(validateCatalogPayload(updatedCatalog), { valid: true, reason: null });
  return { payload, bytes, catalog: updatedCatalog, catalogBytes: json(updatedCatalog),
    wordCounts: payload.articles.map(article => ({ id: article.id, 'sr-Cyrl': articleWordCount(article.content['sr-Cyrl']), 'sr-Latn': articleWordCount(article.content['sr-Latn']) })) };
}

export async function buildSaintsCompletion(root = ROOT) {
  const approvalBytes = await readFile(resolve(root, COMPLETION_APPROVAL_PATH));
  assert.equal(sha256(approvalBytes), COMPLETION_APPROVAL_SHA256, 'Exact completion publication approval');
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.approval_id, COMPLETION_APPROVAL_ID);
  assert.equal(approval.status, 'APPROVED_FOR_SHARED_PUBLICATION');
  assert.equal(approval.approver_role, 'project_owner');
  assert.equal(approval.statement, 'odobravam dopunu za zajedničku objavu na iOS-u i Androidu');
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.deepEqual(approval.source_inputs, COMPLETION_INPUTS);
  assert.deepEqual(approval.manuscript, COMPLETION_INPUTS.manuscript);
  assert.deepEqual(approval.new_article_ids, COMPLETION_ARTICLE_IDS);
  assert.equal(approval.scope.new_articles, 18);
  assert.equal(approval.scope.occurrences_2027, 0);
  assert.equal(approval.scope.new_catalog_article_links, 0);
  assert.equal(approval.clerical_review, null);
  assert.equal(approval.independent_legal_verification, false);
  const result = transformSaintsCompletion(await loadCompletionInputs(root));
  for (const [key, payload, bytes] of [['saints', result.payload, result.bytes], ['catalog', result.catalog, result.catalogBytes]]) {
    assert.deepEqual(approval.payloads[key], { version: payload.version, revision: payload.revision, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { ...result, approval, approvalBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--check', 'Usage: node scripts/export-saints-completion-v1.mjs --check');
  const result = await buildSaintsCompletion();
  console.log(JSON.stringify({ status: 'PASS', saints: { articles: result.payload.articles.length, days: result.payload.days.length, bytes: result.bytes.length, sha256: sha256(result.bytes) }, catalog: { bytes: result.catalogBytes.length, sha256: sha256(result.catalogBytes) }, word_counts: result.wordCounts, signed: false, published: false }, null, 2));
}
