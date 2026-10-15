import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGospelIndex, parseRadioHtml, referenceErrors, reviewObservation, sourceURL } from '../scripts/radio-monitor-core-v2.mjs';
const root = new URL('../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/gospels.sr-Cyrl.json', import.meta.url);
const index = buildGospelIndex(JSON.parse(await readFile(root)));
const reference = 'Јеванђеље по Јовану, зачало 3. 1,29-34';
const row = (date, value = reference) => `<tr id="Datum${date.replaceAll('-', '')}"><td>дан</td><td>датум</td><td>${value}</td></tr>`;
const page = (year, body) => `<h1>Тумачења Јеванђеља за ${year}. годину</h1><table>${body}</table>`;
const at = '2026-09-30T05:17:00Z';

test('explicit year supports 2026 and 2027 without reusing old dates', () => {
  assert(sourceURL(2027).endsWith('Godina=2027'));
  assert.equal(parseRadioHtml(page(2027, row('2027-01-01')), 2027, index)[0].date, '2027-01-01');
  assert.throws(() => parseRadioHtml(page(2026, row('2026-01-01')), 2027, index));
  assert.throws(() => parseRadioHtml(page(2027, row('2026-01-01')), 2027, index));
  assert.throws(() => sourceURL('2027'));
});
test('strict real dates, duplicate dates and HTML shape reject', () => {
  for (const day of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01']) {
    assert.throws(() => parseRadioHtml(page(2026, row(day)), 2026, index));
  }
  assert.equal(parseRadioHtml(page(2028, row('2028-02-29')), 2028, index).length, 1);
  assert.throws(() => parseRadioHtml(page(2026, row('2026-01-01') + row('2026-01-01')), 2026, index));
  assert.throws(() => parseRadioHtml(page(2026, '<tr id="Datum20260101"><td>shape</td></tr>'), 2026, index));
  assert.throws(() => parseRadioHtml(page(2026, ''), 2026, index));
});
test('every requested verse, reversed ranges and missing interior chapters are checked', () => {
  assert.deepEqual(referenceErrors(reference, index), []);
  assert.deepEqual(referenceErrors('Јеванђеље по Матеју, зачало 1. 1,24-2,3;2,5-6', index), []);
  assert(referenceErrors('Јеванђеље по Луки, зачало 109. 19,39-71', index).length);
  assert(referenceErrors('Јеванђеље по Јовану, зачало 3. 1,34-29', index).length);
  assert(referenceErrors('Јеванђеље по Матеју, зачало 1. 3,2-1,3', index).length);
  const missingVerse = new Map(index); missingVerse.set('JHN:1', new Set([...index.get('JHN:1')].filter(n => n !== 31)));
  assert(referenceErrors(reference, missingVerse).some(error => error.code === 'missing_interior_verse'));
  const missingChapter = new Map(index); missingChapter.delete('MAT:2');
  assert(referenceErrors('Јеванђеље по Матеју, зачало 1. 1,24-3,3', missingChapter).some(error => error.code === 'missing_chapter'));
});
test('supplemental blessing is not a confirmed liturgical assignment', () => {
  const rows = parseRadioHtml(page(2026, row('2026-02-23', `Данас нема читања али ћемо по благослову прочитати<br>${reference}`)), 2026, index);
  assert.equal(rows[0].supplemental_blessing, true);
  const result = reviewObservation(null, rows, { year: 2026, checkedAt: at });
  assert.equal(result.candidate.release_allowed, false);
  assert.equal(result.candidate.production_ready, false);
});
test('added changed removed rows, unchanged success and replay notification dedup', () => {
  const rows = parseRadioHtml(page(2026, row('2026-01-01') + row('2026-01-02')), 2026, index);
  const initial = reviewObservation(null, rows, { year: 2026, checkedAt: at });
  assert.equal(initial.candidate.diff.added.length, 2);
  const unchanged = reviewObservation(initial.state, rows, { year: 2026, checkedAt: '2026-10-01T05:17:00Z' });
  assert.equal(unchanged.candidate, null); assert.equal(unchanged.notification_needed, false);
  const next = parseRadioHtml(page(2026, row('2026-01-01', reference.replace('29-34', '29-35')) + row('2026-01-03')), 2026, index);
  const changed = reviewObservation(unchanged.state, next, { year: 2026, checkedAt: at });
  assert.deepEqual(Object.values(changed.candidate.diff).map(value => value.length), [1, 1, 1]);
  const replay = reviewObservation({ ...unchanged.state, seen_fingerprints: changed.state.seen_fingerprints }, next, { year: 2026, checkedAt: at });
  assert.equal(replay.notification_needed, false);
});
test('failed parsing cannot mutate last good state; cross-year state rejected', () => {
  const rows = parseRadioHtml(page(2026, row('2026-01-01')), 2026, index);
  const old = reviewObservation(null, rows, { year: 2026, checkedAt: at }).state;
  const snapshot = JSON.stringify(old);
  assert.throws(() => parseRadioHtml('broken html', 2026, index));
  assert.equal(JSON.stringify(old), snapshot);
  assert.throws(() => reviewObservation(old, [{ ...rows[0], date: '2027-01-01' }], { year: 2027, checkedAt: at }));
});

test('a later valid reference cannot hide a preceding invalid range in the same chunk', () => {
  const invalid = 'Јеванђеље по Луки, зачало 109. 19,39-71';
  assert(referenceErrors(`${invalid} ${reference}`, index).length > 0);
  assert(referenceErrors(`unexpected prefix ${reference}`, index).length > 0);
});
test('malformed Datum row IDs cannot silently disappear beside a valid row', () => {
  const good = row('2026-01-01');
  for (const id of ['Datum202602300', 'Datum2026023', 'Datum2026xx30', 'Datum']) {
    assert.throws(() => parseRadioHtml(page(2026, good + `<tr id="${id}"><td>a</td><td>b</td><td>${reference}</td></tr>`), 2026, index));
    assert.throws(() => parseRadioHtml(page(2026, good + `<tr id = "${id}"><td>a</td><td>b</td><td>${reference}</td></tr>`), 2026, index));
  }
  assert.equal(parseRadioHtml(page(2026, good.replace('id=', 'id = ')), 2026, index).length, 1);
  assert.throws(() => parseRadioHtml(page(2026, good + '<tr id="Datum20260102"><td>unfinished'), 2026, index));
});
test('reference validation failure produces a review candidate but never advances last good state', () => {
  const rows = parseRadioHtml(page(2026, row('2026-01-01')), 2026, index);
  const baseline = reviewObservation(null, rows, { year: 2026, checkedAt: at }).state;
  const invalid = parseRadioHtml(page(2026, row('2026-01-01', 'Јеванђеље по Луки, зачало 109. 19,39-71')), 2026, index);
  const first = reviewObservation(baseline, invalid, { year: 2026, checkedAt: '2026-10-01T05:17:00Z' });
  assert.equal(first.validation_failed, true);
  assert.equal(first.candidate.validation_failed, true);
  assert.deepEqual(first.state.rows, baseline.rows);
  assert.equal(first.state.last_success_at, at);
  const second = reviewObservation(first.state, invalid, { year: 2026, checkedAt: '2026-10-02T05:17:00Z' });
  assert(second.candidate);
  assert.equal(second.notification_needed, false);
  assert.equal(second.state.last_success_at, at);
  const firstEverBad = reviewObservation(null, invalid, { year: 2026, checkedAt: at });
  assert.deepEqual(firstEverBad.state.rows, []);
  assert.equal(firstEverBad.state.last_success_at, null);
});
