import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, DRAFT, BASELINES, loadDraft, assembleDraft, parseManuscript, outputFiles, sha256 } from '../scripts/prepare-saints-completion-draft.mjs';
import { parseSaintsPayload, evaluateSaintsDay, toLatin } from '../scripts/validate-saints-v1.mjs';

const result = await loadDraft();
const args = () => structuredClone({ previous: result.inputs.saints, calendar: result.inputs.calendar, catalog: result.inputs.catalog, batches: result.batches });

test('completion preserves exact approved S8 articles, days, sources and calendar', async () => {
  for (const record of Object.values(BASELINES)) assert.equal(sha256(await readFile(resolve(ROOT, record.path))), record.sha256);
  assert.deepEqual(result.payload.articles.slice(0, 14), result.inputs.saints.articles);
  assert.deepEqual(result.payload.days.slice(0, 14), result.inputs.saints.days);
  assert.deepEqual(result.payload.sources.slice(0, result.inputs.saints.sources.length), result.inputs.saints.sources);
  assert.deepEqual(result.payload.calendar_binding, result.inputs.saints.calendar_binding);
});

test('all 30 requested civil dates are covered, 12 published and 18 pending', () => {
  assert.equal(result.coverage.days.length, 30);
  assert.equal(result.coverage.days[0].date, '2026-09-21');
  assert.equal(result.coverage.days.at(-1).date, '2026-10-20');
  assert.equal(result.coverage.days.filter(day => day.state === 'published_existing').length, 12);
  assert.equal(result.coverage.days.filter(day => day.state === 'draft_pending_review').length, 18);
  assert.equal(result.payload.articles.length, 32);
  assert.equal(result.payload.days.length, 32);
  assert.equal(result.coverage.counts.unwritten_days_in_window, 0);
});

test('all new draft texts fit existing parser and deterministic script rules', () => {
  assert.equal(parseSaintsPayload(result.bytes).valid, true);
  assert.ok(result.bytes.length <= 262144);
  for (const article of result.payload.articles.slice(14)) {
    const cyrl = article.content['sr-Cyrl'], latn = article.content['sr-Latn'];
    for (const key of ['title', 'intro', 'takeaway']) assert.equal(latn[key], toLatin(cyrl[key]));
    assert.deepEqual(latn.body, cyrl.body.map(toLatin));
  }
});

test('editorial takeaways remain original reflections, not invented source quotations', () => {
  for (const article of result.articles) {
    const reflection = article.claims.find(claim => ['editorial_interpretation', 'editorial_reflection'].includes(claim.kind));
    assert.ok(reflection);
    assert.deepEqual(reflection.source_ids, []);
    assert.ok(article.claims.some(claim => claim.source_ids.length > 0));
  }
});

test('unapproved draft cannot become eligible even with supplied authenticated context', () => {
  assert.equal(result.payload.review_status, 'draft');
  assert.deepEqual(evaluateSaintsDay(result.payload, { contentAuthenticated: true, calendarAuthenticated: true, date: '2026-10-12' }), { eligible: false, reason: 'unapproved' });
  assert.equal(result.coverage.owner_approval, null);
  for (const article of result.articles) assert.equal(article.owner_approval, null);
});

test('October4 keeps Quadratus and Cross leavetaking as distinct identities', () => {
  const day = result.payload.days.find(day => day.date === '2026-10-04');
  assert.equal(day.article_ids.length, 1);
  assert.equal(result.payload.articles.find(article => article.id === day.article_ids[0]).type, 'saint');
  assert.equal(day.calendar_notes[0].kind, 'leavetaking');
  assert.equal(day.calendar_notes[0].related_article_id, 'exaltation-cross');
  assert.equal(day.calendar_notes[0].label['sr-Cyrl'], 'Оданије Воздвижења');
  assert.deepEqual(day.calendar_source_ids, ['eparhija-month-10']);
});

test('only recorded existing catalog observance is noted, no synthetic Save links', () => {
  const newDays = result.coverage.days.filter(day => day.state === 'draft_pending_review');
  assert.deepEqual(newDays.flatMap(day => day.existing_observance_ids), ['obs-cyriacus-miholjdan']);
  assert.equal(result.inputs.catalog.article_links.length, 2);
  assert.ok(!Object.hasOwn(result.payload, 'article_links'));
});

test('rejects shifted calendar dates and mismatched source identity', () => {
  const a = args(); a.batches[0].metadata.articles[0].date = '2026-10-04';
  assert.throws(() => assembleDraft(a));
  const b = args(); b.batches[0].metadata.articles[0].julian_date = '2026-09-21';
  assert.throws(() => assembleDraft(b));
  const c = args(); c.batches[0].metadata.articles[0].source_ids = ['comp-unknown'];
  assert.throws(() => assembleDraft(c));
  const d = args(); d.batches[0].metadata.articles[0].claims[0].source_ids = [];
  assert.throws(() => assembleDraft(d));
});

test('rejects duplicate IDs, missing claims and unmatched prose sections', () => {
  const a = args(); a.batches[0].metadata.articles[0].id = a.previous.articles[0].id;
  assert.throws(() => assembleDraft(a));
  const b = args(); b.batches[0].metadata.articles[0].claims = [];
  assert.throws(() => assembleDraft(b));
  const c = args(); c.batches[0].manuscript = c.batches[0].manuscript.replace('### Кратко', '### Увод');
  assert.throws(() => assembleDraft(c));
});

test('rejects independently mixed Latin master and overlong text', () => {
  const id = result.batches[0].metadata.articles[0].id;
  assert.throws(() => parseManuscript(result.batches[0].manuscript.replace('### Кратко\n\n', '### Кратко\n\nLatin '), id));
  assert.throws(() => parseManuscript(result.batches[0].manuscript.replace('### Кратко\n\n', `### Кратко\n\n${'реч '.repeat(201)}`), id));
});

test('review files match deterministic exports and contain no signed release', async () => {
  for (const [name, bytes] of outputFiles(result)) assert.deepEqual(await readFile(resolve(ROOT, DRAFT, name)), bytes);
  const report = JSON.parse(await readFile(resolve(ROOT, DRAFT, 'validation.json')));
  assert.equal(report.signed, false); assert.equal(report.published, false); assert.equal(report.runtime_eligible, false);
  assert.equal(report.manuscript_sha256, sha256(result.manuscript));
  assert.ok(!outputFiles(result).has('index.json'));
  assert.ok(!outputFiles(result).has('release-set.json'));
});
