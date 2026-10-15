import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { parseSaintsPayload, validateSaintsPayload, toLatin, articleWordCount, SAINTS_LIMITS } from '../../scripts/validate-saints-v1.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

export async function verifyManifest() {
  const manifest = await readJSON(resolve(here, 'manifest.json'));
  assert.equal(manifest.publication_authorized, false);
  assert.equal(manifest.owner_approval, null);
  const expected = ['README.md', 'inventory.json', 'manuscript.json', 'sources.json', 'inspect.mjs', 'inspect.test.mjs', 'validation.json', 'export-review.mjs', 'PREGLED.md'];
  assert.deepEqual(manifest.files.map(x => x.path).sort(), [...expected].sort());
  for (const file of manifest.files) {
    const path = resolve(here, file.path);
    assert.equal((await lstat(path)).isSymbolicLink(), false);
    const bytes = await readFile(path);
    assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha256(bytes), file.sha256, file.path);
  }
  return manifest;
}

export async function loadInputs() {
  const inventory = await readJSON(resolve(here, 'inventory.json'));
  const manuscript = await readJSON(resolve(here, 'manuscript.json'));
  const sources = await readJSON(resolve(here, 'sources.json'));
  const originals = [];
  for (const file of inventory.source_files) {
    assert.ok(!file.path.includes('..') && file.path.startsWith('releases/v2/production/releases/'));
    const path = resolve(root, file.path);
    assert.equal((await lstat(path)).isSymbolicLink(), false);
    const bytes = await readFile(path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
    originals.push(JSON.parse(bytes));
  }
  return { inventory, manuscript, sources, calendar: originals[0], baseline: originals[1], catalog: originals[2] };
}

/** Builds only an in-memory DRAFT preview. It neither writes nor authenticates a release. */
export function inspectCandidate(inputs) {
  const { inventory, manuscript, sources, calendar, baseline, catalog } = structuredClone(inputs);
  assert.equal(inventory.status, 'LOCAL_EDITORIAL_CANDIDATE_NOT_APPROVED');
  for (const input of [inventory, manuscript]) {
    assert.equal(input.owner_approval, null); assert.equal(input.clerical_review, null); assert.equal(input.publication_authorized, false);
  }
  assert.equal(manuscript.review_status, 'DRAFT');
  assert.equal(manuscript.authorship.verbatim_quote_words, 0);
  assert.equal(baseline.articles.length, 32);
  assert.equal(baseline.days.length, 32);
  assert.equal(inventory.days.length, 30);
  const dates = calendar.days.filter(x => x.date >= inventory.window.start && x.date <= inventory.window.end);
  assert.equal(dates.length, 30);
  assert.deepEqual(inventory.days.map(x => x.date), dates.map(x => x.date));
  const oldIds = new Set(baseline.articles.map(x => x.id));
  const newIds = new Set(manuscript.articles.map(x => x.id));
  assert.equal(newIds.size, manuscript.articles.length);
  assert.ok(manuscript.articles.every(x => !oldIds.has(x.id)), 'new IDs may not replace existing articles');
  const sourceIds = new Set(sources.biography_sources.map(x => x.source.id));
  assert.equal(sourceIds.size, sources.biography_sources.length);
  assert.ok(sources.biography_sources.every(x => x.source.kind === 'article'
    && x.source.reviewed_on === '2026-09-30' && x.evidence.access_status === 'OPENED_PRIMARY_CHURCH_PAGE'
    && x.evidence.verbatim_quote_words === 0 && x.evidence.source_text_reproduced === false));
  assert.ok(sources.biography_sources.every(x => ['www.oca.org', 'mitropolija.com', 'zvonce.spc.rs'].includes(new URL(x.source.url).hostname)), 'only reviewed primary church publishers in this candidate');
  const days = [], gaps = [], canonicalLinkProposals = [];
  for (let n = 0; n < dates.length; n++) {
    const day = dates[n], item = inventory.days[n];
    assert.equal(item.julian_date, day.julian_date);
    assert.equal(item.calendar_title_cyrl, day.commemoration.title_cyrl);
    assert.deepEqual(item.calendar_source_ids, day.commemoration.source_ids);
    const canonicalIds = catalog.occurrences.filter(x => x.date === day.date && x.review_status === 'reviewed').map(x => x.observance_id);
    assert.deepEqual(item.active_canonical_observance_ids, canonicalIds);
    if (item.article_id === null) {
      assert.equal(item.manuscript_status, 'GAP_NOT_YET_PREPARED'); assert.ok(item.gap_reason);
      assert.deepEqual(item.biography_source_ids, []); gaps.push(day.date); continue;
    }
    assert.equal(item.manuscript_status, 'DRAFT_SOURCE_CHECKED_NOT_APPROVED'); assert.equal(item.gap_reason, null);
    assert.deepEqual(item.rights_provenance, { kind: 'ORIGINAL_AI_ASSISTED_EDITORIAL_SUMMARY', source_text_quoted: false, owner_exact_text_review: 'PENDING', clerical_review: null });
    const article = manuscript.articles.find(x => x.id === item.article_id);
    assert.ok(article, `missing manuscript for ${day.date}`);
    assert.deepEqual(item.biography_source_ids, article.source_ids);
    assert.ok(article.source_ids.every(id => sourceIds.has(id)));
    for (const id of article.source_ids) {
      const evidence = sources.biography_sources.find(x => x.source.id === id).evidence;
      assert.equal(evidence.church_month_day, day.julian_date.slice(5), `identity/date mismatch for ${id}`);
    }
    for (const observanceId of canonicalIds) {
      assert.ok(catalog.observances.some(x => x.id === observanceId && x.review_status === 'reviewed'));
      assert.equal(item.canonical_link_status, 'EXISTING_ID_LINK_REVIEW_PENDING');
      canonicalLinkProposals.push({ article_id: article.id, observance_id: observanceId, review_status: 'pending', published: false });
    }
    if (!canonicalIds.length) assert.equal(item.canonical_link_status, 'NO_ACTIVE_ID_LINK_PROPOSED');
    days.push({ date: day.date, julian_date: day.julian_date,
      calendar_title: { 'sr-Cyrl': day.commemoration.title_cyrl, 'sr-Latn': toLatin(day.commemoration.title_cyrl) },
      calendar_source_ids: day.commemoration.source_ids, article_ids: [article.id], complete_saint_list: false, calendar_notes: [] });
  }
  assert.equal(days.length, manuscript.articles.length, 'one selected article per prepared day; no orphan articles');
  const addedSources = sources.biography_sources.map(x => x.source);
  assert.ok(addedSources.every(s => !baseline.sources.some(x => x.id === s.id)), 'old source metadata may not be replaced');
  const calendarSources = [...new Set(days.flatMap(x => x.calendar_source_ids))].filter(id => !baseline.sources.some(x => x.id === id)).map(id => {
    const source = calendar.sources.find(x => x.id === id); assert.ok(source);
    return { id, kind: 'calendar', title: source.title, url: source.url,
      publisher: 'Епархија аустријска Српске православне цркве', original_author: null, published_on: null, reviewed_on: '2026-09-30' };
  });
  // saints-v1 requires a string even in drafts. This is an explicit pending locator, NOT an approval record.
  const payload = { ...baseline, version: '2026.9.30', revision: 1, approval_id: 'pending-saints-next-window-2026-09-30', review_status: 'draft',
    sources: [...baseline.sources, ...calendarSources, ...addedSources],
    articles: [...baseline.articles, ...manuscript.articles], days: [...baseline.days, ...days] };
  assert.deepEqual(payload.articles.slice(0, 32), baseline.articles);
  assert.deepEqual(payload.days.slice(0, 32), baseline.days);
  assert.deepEqual(payload.sources.slice(0, baseline.sources.length), baseline.sources);
  assert.deepEqual(payload.calendar_binding, baseline.calendar_binding);
  assert.deepEqual(validateSaintsPayload(payload), { valid: true, reason: null }, 'existing saints-v1 shape/prose checks');
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  assert.ok(bytes.length <= SAINTS_LIMITS.bytes);
  assert.equal(parseSaintsPayload(bytes).valid, true);
  const report = {
    status: 'LOCAL_DRAFT_VALID_NOT_AUTHENTICATED_OR_APPROVED', production_authorized: false,
    owner_approval: null, wire_approval_id_is_pending_locator_only: true,
    calendar_binding_sha256: payload.calendar_binding.sha256, preserved_articles: 32,
    new_articles: manuscript.articles.length, total_articles: payload.articles.length, article_limit: SAINTS_LIMITS.articles,
    prepared_window_days: days.length, window_days: 30, remaining_gaps: gaps, complete_saint_list: false,
    compact_preview_bytes: bytes.length, byte_limit: SAINTS_LIMITS.bytes, preview_sha256: sha256(bytes),
    canonical_link_proposals: canonicalLinkProposals,
    word_counts: manuscript.articles.map(x => ({ id: x.id, cyrl: articleWordCount(x.content['sr-Cyrl']), latn: articleWordCount(x.content['sr-Latn']) })),
    source_refresh_limits: sources.calendar_refresh.filter(x => x.status.includes('FAILED')),
    remaining_gates: ['human_editorial_review', 'exact_manuscript_owner_approval', 'canonical_link_review_if_added', 'separate_release_and_native_compatibility', 'separate_production_authorization'],
  };
  return { payload, bytes, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'read-only inspector accepts no write/publish arguments');
  const manifest = await verifyManifest();
  const { report } = inspectCandidate(await loadInputs());
  assert.equal(report.preview_sha256, manifest.preview_sha256);
  assert.equal(report.compact_preview_bytes, manifest.preview_bytes);
  assert.deepEqual(report, await readJSON(resolve(here, 'validation.json')));
  console.log(JSON.stringify(report, null, 2));
}
