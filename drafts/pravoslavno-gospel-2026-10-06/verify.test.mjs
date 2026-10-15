import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, json, sha256 } from '../../scripts/prepare-charity-release-v2.mjs';
import { evaluateBibleReference, adaptCalendarReading } from '../../scripts/validate-bible-reference-v1.mjs';
import { HERE, START, END, dates, dayOffset, urlFor, robotsPolicy } from './collect.mjs';
import { prepare, parsePage, parseHeading, validateReadings } from './prepare.mjs';

const p = await prepare();
const raw = async date => {
  const item = p.acquisition.records.find(r => r.id === date).result;
  return readFile(resolve(HERE, 'acquisition', item.path), 'utf8');
};

test('01 robots/horizon gates and actual bounded acquisition policy', () => {
  assert.equal(robotsPolicy(404, '').permitted, true);
  for (const code of [401, 403, 429, 500]) assert.equal(robotsPolicy(code, '').permitted, false);
  assert.equal(robotsPolicy(200, 'User-agent: *\nDisallow: /index.php').permitted, false);
  assert.equal(robotsPolicy(200, 'User-agent: *\nDisallow: /\nAllow: /index.php').permitted, true);
  assert.equal(robotsPolicy(200, 'User-agent: Svetlost33-reference-review\nDisallow: /\nUser-agent: *\nAllow: /').permitted, false);
  assert.equal(robotsPolicy(200, 'User-agent: *\nCrawl-delay: 2').interval_ms, 2000);
  assert.equal(robotsPolicy(200, 'User-agent: *\nCrawl-delay: 90').permitted, false);
  assert.equal(robotsPolicy(200, '<html>challenge</html>').permitted, false);
  assert.throws(() => urlFor('2026-11-06'), /horizon/u); assert.throws(() => urlFor('2026-10-05'), /horizon/u);
  assert.equal(p.acquisition.actual_belgrade_date, START); assert.deepEqual(p.acquisition.window, [START, END]);
  assert.equal(p.acquisition.records.length, 32); assert.equal(p.acquisition.records[0].id, 'robots');
  assert.equal(p.acquisition.records[0].result.http_status, 404);
  const attempts = p.acquisition.records.flatMap(r => r.attempts);
  assert.equal(attempts.length, 32);
  for (let n = 1; n < attempts.length; n++) assert.ok(Date.parse(attempts[n].fetched_at) - Date.parse(attempts[n - 1].fetched_at) >= 1000);
});

test('02 raw provenance byte/hash checks, exact URLs and deterministic candidate/delta', async () => {
  for (const item of p.acquisition.records.flatMap(r => r.attempts).filter(r => r.path)) {
    const bytes = await readFile(resolve(HERE, 'acquisition', item.path));
    assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256);
    assert.equal(item.url, item.effective_url);
  }
  for (const [path, bytes] of p.files) assert.deepEqual(await readFile(resolve(HERE, 'review', path)), bytes);
  assert.deepEqual((await prepare()).files, p.files);
});

test('03 all31 displayed dates and33 canonical references in both scripts; no gaps/conflicts', async () => {
  assert.equal(p.candidate.rows.length, 31); assert.equal(p.candidate.summary.gospel_readings, 33);
  assert.equal(p.candidate.summary.valid_source_dates, 31); assert.deepEqual(p.candidate.summary.gaps, []); assert.deepEqual(p.candidate.summary.conflicts, []);
  for (const row of p.candidate.rows) {
    assert.equal(parsePage(await raw(row.date), row.date).displayed_date, row.date);
    assert.deepEqual(validateReadings(row.source_readings, p.baseline.context), row.canonical_checks);
    for (const check of row.canonical_checks) assert.ok(check.locales['sr-Cyrl'].verse_keys.length > 0);
  }
  assert.deepEqual(p.candidate.rows[0].source_readings[0].segments, [{ start: { chapter: 5, verse: 12 }, end: { chapter: 5, verse: 16 } }]);
});

test('04 mismatched/ambiguous displayed dates, horizon refusals and unknown headings fail closed', async () => {
  const html = await raw(START);
  assert.throws(() => parsePage(html, '2026-10-07'), /displayed civil date/u);
  assert.throws(() => parsePage(`${html}<div>06.10.2026</div>`, START), /displayed civil date/u);
  assert.throws(() => parsePage('<div>06.10.2026</div>Само30дана', START), /bounded reading section/u);
  assert.throws(() => parsePage(html.replace('Лука, зачало 18.', 'Непознат, зачало 18.'), START), /Unsupported Gospel heading/u);
  assert.throws(() => parsePage(html.replace('<a name=teofan>', '').replace('<div style="clear:both; padding:6px;', '<div').replace('</body>', ''), START), /bounded reading section/u);
});

test('05 printed discontiguous/cross-chapter grammar preserved without sorting or silent repair', () => {
  const r = parseHeading('Свето Јеванђеље од Луке, зачало 4 (1,39-49; 56)');
  assert.deepEqual(r.segments, [{ start: { chapter: 1, verse: 39 }, end: { chapter: 1, verse: 49 } }, { start: { chapter: 1, verse: 56 }, end: { chapter: 1, verse: 56 } }]);
  const cross = parseHeading('Јеванђеље Јован, зачало 19. (5,30-6,2)');
  assert.deepEqual(cross.segments, [{ start: { chapter: 5, verse: 30 }, end: { chapter: 6, verse: 2 } }]);
  assert.equal(validateReadings([cross], p.baseline.context).length, 1);
  const outOfOrder = parseHeading('Јеванђеље Лука, зачало 4. (1,56; 1,39-49)');
  assert.throws(() => validateReadings([outOfOrder], p.baseline.context), /unordered_or_overlapping_ranges/u);
  assert.throws(() => parseHeading('Јеванђеље Лука, зачало 4. (39-49)'), /First segment/u);
  assert.throws(() => parseHeading('Јеванђеље Лука, зачало 4. (1,39 и следећи)'), /Unsupported printed range/u);
});

test('06 every intermediate canonical verse/source checked; missing/duplicate/out-of-bounds cannot pass', () => {
  const reference = adaptCalendarReading(p.candidate.rows[0].source_readings[0]);
  for (const kind of ['missing', 'duplicate']) {
    const context = structuredClone(p.baseline.context), chapter = context.books.find(b => b.book_id === 'LUK' && b.locale === 'sr-Cyrl').chapters.find(c => c.number === 5);
    if (kind === 'missing') chapter.verses = chapter.verses.filter(v => v.number !== 13);
    else chapter.verses.push(structuredClone(chapter.verses.find(v => v.number === 13)));
    assert.equal(evaluateBibleReference({ locale: 'sr-Cyrl', reference }, context).reason, 'missing_verse');
  }
  const invalid = structuredClone(reference); invalid.ranges[0].end.verse = 999;
  assert.equal(evaluateBibleReference({ locale: 'sr-Cyrl', reference: invalid }, p.baseline.context).reason, 'verse_out_of_bounds');
  const empty = structuredClone(reference); empty.ranges = [];
  assert.equal(evaluateBibleReference({ locale: 'sr-Cyrl', reference: empty }, p.baseline.context).reason, 'empty_ranges');
});

test('07 multiple readings, printed services and all zachala retained; no inferred service', () => {
  assert.deepEqual(p.candidate.summary.multi_reading_dates, ['2026-10-14', '2026-10-27']);
  assert.equal(p.candidate.summary.explicit_service_readings, 4);
  const feast = p.candidate.rows.find(r => r.date === '2026-10-14');
  assert.deepEqual(feast.source_readings[1].zachalo_numbers, [54, 58]);
  assert.deepEqual(feast.reading_provenance.map(r => r.explicit_service.source_label), ['Јутрење', 'Литургија']);
  const paraskeva = p.candidate.rows.find(r => r.date === '2026-10-27');
  assert.deepEqual(paraskeva.source_readings.map(r => r.book), ['Luke', 'Matthew']);
  assert.deepEqual(paraskeva.reading_provenance.map(r => r.explicit_service.source_label), ['Јутрења', 'Литургија']);
  for (const row of p.candidate.rows) for (const reading of row.source_readings) assert.equal(reading.service, 'unspecified');
  assert.equal(p.candidate.rows[0].reading_provenance[0].explicit_service, null);
});

test('08 untouched S13 facts and old observations; reference-only pending candidate with honest source incompatibility', async () => {
  for (const row of p.candidate.rows) {
    assert.deepEqual(row.before_gospel, p.baseline.calendar.days.find(d => d.date === row.date).gospel);
    assert.equal(row.before_gospel.status, 'UNRESOLVED');
    assert.deepEqual(row.proposed_gospel.source_observations.slice(0, row.before_gospel.source_observations.length), row.before_gospel.source_observations);
    assert.equal(row.proposed_gospel.status, 'SOURCE_RECORDED'); assert.equal(row.proposed_gospel.production_eligible, false);
    assert.equal(row.proposed_gospel.complete_service_schedule_verified, false);
    assert.equal(row.proposed_gospel.service_assignment_status, 'UNRESOLVED');
    assert.equal(row.canonical_checks.every(c => !c.existing_legacy_source_label_compatible), true);
  }
  assert.equal(p.candidate.summary.legacy_source_label_incompatibilities, 33);
  assert.doesNotMatch(json(p.candidate).toString(), /"(?:text|quote|body|intro|takeaway)"\s*:/u);
  for (const item of p.baseline.pins) assert.equal(sha256(await readFile(resolve(ROOT, item.path))), item.sha256);
});

test('09 continuous endpoint and minus10 calendar-day followup; unresolved later dates remain outside candidate', () => {
  assert.deepEqual(p.candidate.rows.map(r => r.date), dates);
  assert.equal(p.candidate.summary.last_contiguous_validated_source_date, END);
  assert.equal(p.candidate.summary.next_search_local_date, '2026-10-26');
  assert.equal(dayOffset(END, -10), '2026-10-26');
  assert.equal(p.candidate.summary.timezone, 'Europe/Belgrade'); assert.equal(p.candidate.summary.next_search_local_time, '09:00');
  assert.equal(p.candidate.rows.some(r => r.date > END), false);
  assert.equal(p.baseline.calendar.days.find(d => d.date === '2026-11-06').gospel.status, 'UNRESOLVED');
});
