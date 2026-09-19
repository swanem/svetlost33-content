// Read-only editorial consistency check. Does not export, sign or publish content.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const pilot = JSON.parse(readFileSync(path.join(directory, 'pilot.json'), 'utf8'));
const markdown = readFileSync(path.join(directory, pilot.content_document), 'utf8');
const calendarBytes = readFileSync(path.join(repository, pilot.calendar_input.path));
const calendar = JSON.parse(calendarBytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const ids = values => new Set(values.map(value => value.id));

assert.equal(pilot.status, 'EDITORIALLY_APPROVED_IMPLEMENTATION');
for (const key of ['runtime_compatible', 'production_ready', 'published']) assert.equal(pilot[key], false);
const approval = JSON.parse(readFileSync(path.join(repository, pilot.human_editorial_approval.record), 'utf8'));
assert.equal(pilot.human_editorial_approval.status, 'APPROVED');
assert.equal(approval.status, 'APPROVED_FOR_IMPLEMENTATION');
assert.equal(sha256(markdown), pilot.human_editorial_approval.manuscript_sha256);
assert.equal(sha256(markdown), approval.manuscript.sha256);
assert.deepEqual(approval.article_ids, pilot.articles.map(article => article.id));
assert.deepEqual(approval.platforms, ['android', 'ios']);
assert.equal(approval.production_ready, false);
assert.equal(pilot.format_approval.status, 'APPROVED');
assert.equal(pilot.format_approval.scope, 'short_format_only_not_exact_texts_implementation_or_publication');
assert.deepEqual(pilot.format_approval.platforms, ['android', 'ios']);
assert.equal(pilot.format_approval.target_words.min, 100);
assert.equal(pilot.format_approval.target_words.max, 200);
assert.equal(pilot.format_approval.long_form_expansion, false);
assert.equal(pilot.clerical_review, null);
assert.equal(pilot.rights.basis, 'USER_ATTESTATION');
assert.equal(pilot.rights.independently_verified, false);
assert.deepEqual(pilot.intended_platforms, ['android', 'ios']);
assert.equal(sha256(calendarBytes), pilot.calendar_input.sha256, 'Pinned calendar changed');
assert.equal(pilot.calendar_input.complete_saint_list_verified, false);
assert.equal(pilot.articles.length, 7);
assert.equal(ids(pilot.articles).size, 7);
assert.equal(ids(pilot.sources).size, pilot.sources.length);
const sourceIds = ids(pilot.sources);
const articleIds = ids(pilot.articles);
for (const source of pilot.sources) {
  assert.equal(new URL(source.url).protocol, 'https:');
  assert.ok(source.publisher && source.title && source.reviewed_on && source.review_scope);
}

const expectedDates = ['19', '20', '21', '22', '23', '24', '25'].map(day => `2026-09-${day}`);
assert.deepEqual(pilot.days.map(day => day.date), expectedDates);
for (const day of pilot.days) {
  const original = calendar.days.find(item => item.date === day.date);
  assert.ok(original);
  assert.equal(day.julian_date, original.julian_date);
  assert.equal(day.calendar_title_cyrl, original.commemoration.title_cyrl);
  assert.equal(original.commemoration.complete_saint_list_verified, false);
  assert.equal(original.commemoration.title_review, pilot.calendar_input.existing_title_review);
  assert.equal(original.commemoration.reading_page_title_cyrl, pilot.calendar_input.existing_reading_page_title_cyrl);
  assert.ok(original.commemoration.source_ids.includes(pilot.calendar_input.source_id));
  for (const id of day.article_ids) assert.ok(articleIds.has(id));
  for (const note of day.calendar_notes) {
    assert.ok(['forefeast', 'leavetaking'].includes(note.kind));
    assert.ok(articleIds.has(note.related_article_id));
    assert.ok(day.calendar_title_cyrl.includes(note.label_cyrl));
    assert.deepEqual(note.source_ids, [pilot.calendar_input.source_id]);
  }
}
assert.equal(pilot.days[1].calendar_notes[0].kind, 'forefeast');
assert.equal(pilot.days[6].calendar_notes[0].kind, 'leavetaking');
const markers = [...markdown.matchAll(/<!-- article:([a-z-]+) -->/g)];
assert.deepEqual(markers.map(match => match[1]), pilot.articles.map(article => article.id));
const wordCounts = [];
for (const article of pilot.articles) {
  assert.ok(['saint', 'group', 'feast'].includes(article.type));
  assert.equal(article.revision, 1);
  assert.ok(article.source_ids.length);
  for (const id of article.source_ids) assert.ok(sourceIds.has(id));
  const marker = markers.find(match => match[1] === article.id);
  const start = marker.index + marker[0].length;
  const next = markdown.indexOf('\n## ', start);
  const section = markdown.slice(start, next < 0 ? undefined : next);
  for (const heading of ['Кратко', 'За читање', 'Шта издвајамо', 'Извор']) {
    assert.equal(section.split(`### ${heading}\n`).length, 2, `${article.id}: required unique section ${heading}`);
  }
  const body = section.split('### Кратко\n')[1].split('### Извор\n')[0].replace(/^### .*$/gm, '');
  assert.doesNotMatch(body, /[A-Za-z]/, `${article.id}: unexpected Latin in Cyrillic master`);
  const words = body.trim().split(/\s+/u).length;
  assert.ok(words >= 100 && words <= 200, `${article.id}: editorial length ${words}`);
  for (const id of article.source_ids) {
    assert.ok(section.includes(pilot.sources.find(source => source.id === id).url), `${article.id}: missing source link`);
  }
  wordCounts.push({ id: article.id, words });
}
console.log(JSON.stringify({result: 'PASS', days: 7, articles: 7, sources: pilot.sources.length, calendarSha256: sha256(calendarBytes), manuscriptSha256: sha256(markdown), wordCounts, publication: 'not_requested_not_performed', review: 'owner_approved_exact_manuscript_structural_checks_pass'}, null, 2));
