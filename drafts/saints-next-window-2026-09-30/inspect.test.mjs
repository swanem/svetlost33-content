import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderReview } from './export-review.mjs';
import { inspectCandidate, loadInputs, verifyManifest } from './inspect.mjs';
const inputs = await loadInputs();

test('full 30-day pinned inventory and bounded, deterministic draft preview', () => {
  const a = inspectCandidate(inputs), b = inspectCandidate(inputs);
  assert.equal(a.report.window_days, 30);
  assert.equal(a.report.prepared_window_days + a.report.remaining_gaps.length, 30);
  assert.deepEqual(a.bytes, b.bytes);
  assert.ok(a.report.total_articles <= 64);
  assert.ok(a.report.compact_preview_bytes <= 262144);
  assert.equal(a.payload.review_status, 'draft'); assert.equal(a.payload.approval_id, 'pending-saints-next-window-2026-09-30');
  assert.equal(a.report.owner_approval, null);
});
test('all 32 old articles, days, sources and calendar binding remain unchanged', () => {
  const { payload } = inspectCandidate(inputs);
  assert.deepEqual(payload.articles.slice(0, 32), inputs.baseline.articles);
  assert.deepEqual(payload.days.slice(0, 32), inputs.baseline.days);
  assert.deepEqual(payload.sources.slice(0, inputs.baseline.sources.length), inputs.baseline.sources);
  assert.deepEqual(payload.calendar_binding, inputs.baseline.calendar_binding);
});
test('only existing canonical IDs may be proposed, never automatically approved', () => {
  const links = inspectCandidate(inputs).report.canonical_link_proposals;
  assert.ok(links.every(x => ['obs-paraskeva', 'obs-demetrius'].includes(x.observance_id) && x.review_status === 'pending' && x.published === false));
  const bad = structuredClone(inputs); bad.inventory.days[0].active_canonical_observance_ids = ['invented-active-id'];
  assert.throws(() => inspectCandidate(bad));
});
test('no owner approval, clerical review or publication can be fabricated by candidate inputs', () => {
  for (const field of ['owner_approval', 'clerical_review', 'publication_authorized']) {
    const bad = structuredClone(inputs); bad.manuscript[field] = field === 'publication_authorized' ? true : 'invented';
    assert.throws(() => inspectCandidate(bad));
  }
});
test('exact date/title/source binding rejects drift', () => {
  for (const change of [x => { x.julian_date = '2026-10-09'; }, x => { x.calendar_title_cyrl += ' '; }, x => { x.calendar_source_ids = ['other']; }]) {
    const bad = structuredClone(inputs); change(bad.inventory.days[0]); assert.throws(() => inspectCandidate(bad));
  }
});
test('source identity date, missing source and prose/parity failures reject', () => {
  const mutations = [
    x => { x.sources.biography_sources[0].evidence.church_month_day = '10-09'; },
    x => { x.manuscript.articles[0].source_ids = ['missing-source']; },
    x => { x.manuscript.articles[0].content['sr-Latn'].intro += ' x'; },
    x => { x.manuscript.articles[0].content['sr-Cyrl'].body = []; },
    x => { x.manuscript.articles[0].id = x.baseline.articles[0].id; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(inputs); mutate(bad); assert.throws(() => inspectCandidate(bad)); }
});
test('inspector is pure and leaves all input objects unchanged', () => {
  const before = structuredClone(inputs); inspectCandidate(inputs); assert.deepEqual(inputs, before);
});
test('readable review exactly matches source manuscript, both scripts and all sources', async () => {
  const rendered = renderReview(inputs);
  assert.equal(await readFile(new URL('./PREGLED.md', import.meta.url), 'utf8'), rendered);
  assert.equal(await readFile(new URL('./manuscript.json', import.meta.url), 'utf8'), `${JSON.stringify(inputs.manuscript, null, 2)}\n`);
  for (const a of inputs.manuscript.articles) {
    for (const c of Object.values(a.content)) {
      for (const value of Object.values(c).flat()) assert.ok(rendered.includes(value));
    }
    for (const id of a.source_ids) assert.ok(rendered.includes(inputs.sources.biography_sources.find(x => x.source.id === id).source.url));
  }
});
test('reader prose does not contain internal preparation wording', () => {
  const wording = /кратки приказ|кратком приказу|овог сажетка|кратки сажетак|кратки текст|овај заједнички приказ|без тврдње о потпуном списку|понавља једноставно извештај/iu;
  for (const a of inputs.manuscript.articles) assert.doesNotMatch(Object.values(a.content['sr-Cyrl']).flat().join(' '), wording, a.id);
});
test('exact local manifest and deterministic preview hash match', async () => {
  const manifest = await verifyManifest(), { report } = inspectCandidate(inputs);
  assert.equal(manifest.preview_sha256, report.preview_sha256);
  assert.equal(manifest.preview_bytes, report.compact_preview_bytes);
  assert.equal(report.new_articles, 30); assert.deepEqual(report.remaining_gaps, []);
});
