import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SAINTS_MODULE, articleWordCount, evaluateSaintsDay, parseSaintsPayload, toLatin } from './validate-saints-v1.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_PATH = 'drafts/saints-pilot-2026-09-19/pilot.json';
export const FIXTURE_DIRECTORY = 'fixtures/saints-v1';
export const MANUSCRIPT_SHA256 = '5847568a2aab22446ef4ab875fbceceecc9e800fad9344e5f23df59c4931ee2a';
export const CALENDAR_BINDING = Object.freeze({ module_id: 'calendar-2026-r1', version: '2026.1.1', revision: 2, path: 'data/calendar.2026.json', sha256: 'a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const localized = value => ({ 'sr-Cyrl': value, 'sr-Latn': toLatin(value) });

function readArticle(markdown, id) {
  const marker = `<!-- article:${id} -->`;
  assert.equal(markdown.split(marker).length, 2, `Unique article marker: ${id}`);
  const from = markdown.indexOf(marker) + marker.length;
  const next = markdown.indexOf('\n## ', from);
  const section = markdown.slice(from, next < 0 ? undefined : next);
  const headings = ['Кратко', 'За читање', 'Шта издвајамо', 'Извор'];
  for (const heading of headings) assert.equal(section.split(`### ${heading}\n`).length, 2, `Unique heading: ${id}/${heading}`);
  const extract = (start, end) => section.split(`### ${start}\n`)[1].split(`### ${end}\n`)[0].trim();
  const intro = extract('Кратко', 'За читање');
  const body = extract('За читање', 'Шта издвајамо').split(/\n\s*\n/u);
  const takeaway = extract('Шта издвајамо', 'Извор');
  assert.doesNotMatch([intro, ...body, takeaway].join(' '), /[A-Za-z]/u, `Cyrillic master: ${id}`);
  return { intro, body, takeaway };
}

export function pilotExpected(payload, calendarPath, payloadBytes) {
  const success = (id, date, article_ids) => ({ id, date, payload_mutations: [], context_mutations: [], expected: { eligible: true, reason: null, article_ids } });
  const failure = (id, reason, { date = '2026-09-19', payload_mutations = [], context_mutations = [] } = {}) => ({ id, date, payload_mutations, context_mutations, expected: { eligible: false, reason } });
  const mutation = (path, value) => ({ path, value });
  const cases = payload.days.map(day => success(`available-${day.date}`, day.date, day.article_ids));
  cases.push(
    failure('outside-pilot', 'uncovered_date', { date: '2026-09-26' }),
    failure('outside-pilot-year', 'uncovered_date', { date: '2027-09-19' }),
    failure('invalid-request-date', 'invalid_date', { date: '2026-02-30' }),
    failure('not-authenticated', 'content_not_authenticated', { context_mutations: [mutation(['contentAuthenticated'], false)] }),
    failure('calendar-not-authenticated', 'calendar_not_authenticated', { context_mutations: [mutation(['calendarAuthenticated'], false)] }),
    failure('draft', 'unapproved', { payload_mutations: [mutation(['review_status'], 'draft')] }),
    failure('unknown-schema', 'unsupported_schema', { payload_mutations: [mutation(['schema_version'], 'svetlost33-saints-2')] }),
    failure('wrong-module-id', 'module_mismatch', { context_mutations: [mutation(['moduleContext', 'module_id'], 'library-annual-2026-r1')] }),
    failure('required-module', 'module_mismatch', { context_mutations: [mutation(['moduleContext', 'required'], true)] }),
    failure('missing-capability', 'module_mismatch', { context_mutations: [mutation(['moduleContext', 'capabilities'], [])] }),
    failure('wrong-module-revision', 'module_mismatch', { context_mutations: [mutation(['moduleContext', 'revision'], 2)] })
  );
  for (const [key, value] of Object.entries({ module_id: 'calendar-other', version: '2026.1.2', revision: 3, path: 'data/calendar.2027.json', sha256: '0'.repeat(64) })) {
    cases.push(failure(`calendar-${key}-mismatch`, 'calendar_mismatch', { context_mutations: [mutation(['calendarContext', key], value)] }));
  }
  cases.push(
    failure('exact-calendar-title-mismatch', 'calendar_day_mismatch', { payload_mutations: [mutation(['days', 0, 'calendar_title'], localized('Други спомен'))] }),
    failure('exact-julian-date-mismatch', 'calendar_day_mismatch', { payload_mutations: [mutation(['days', 0, 'julian_date'], '2026-09-07')] }),
    failure('duplicate-day', 'malformed', { payload_mutations: [mutation(['days', 1, 'date'], '2026-09-19')] }),
    failure('duplicate-article', 'malformed', { payload_mutations: [mutation(['articles', 1, 'id'], payload.articles[0].id)] }),
    failure('duplicate-source', 'malformed', { payload_mutations: [mutation(['sources', 1, 'id'], payload.sources[0].id)] }),
    failure('unknown-article', 'malformed', { payload_mutations: [mutation(['days', 0, 'article_ids'], ['missing-article'])] }),
    failure('wrong-kind-article-source', 'malformed', { payload_mutations: [mutation(['articles', 0, 'source_ids'], ['eparhija-month-09'])] }),
    failure('wrong-kind-calendar-source', 'malformed', { payload_mutations: [mutation(['days', 0, 'calendar_source_ids'], [payload.articles[0].source_ids[0]])] }),
    failure('missing-related-feast', 'malformed', { payload_mutations: [mutation(['days', 1, 'calendar_notes', 0, 'related_article_id'], 'missing-article')] }),
    failure('related-person-not-feast', 'malformed', { payload_mutations: [mutation(['days', 1, 'calendar_notes', 0, 'related_article_id'], 'martyr-sozont')] }),
    failure('impossible-civil-date', 'malformed', { payload_mutations: [mutation(['days', 0, 'date'], '2026-02-30')] }),
    failure('impossible-julian-date', 'malformed', { payload_mutations: [mutation(['days', 0, 'julian_date'], '2026-02-30')] }),
    failure('latin-title-not-transliteration', 'malformed', { payload_mutations: [mutation(['days', 0, 'calendar_title', 'sr-Latn'], 'Drugi naslov')] }),
    failure('latin-body-not-transliteration', 'malformed', { payload_mutations: [mutation(['articles', 0, 'content', 'sr-Latn', 'body', 0], 'Drugi tekst.')] }),
    failure('unknown-root-key', 'malformed', { payload_mutations: [mutation(['executable'], 'no')] }),
    failure('complete-list-claim', 'malformed', { payload_mutations: [mutation(['days', 0, 'complete_saint_list'], true)] }),
    failure('unsafe-source-url', 'malformed', { payload_mutations: [mutation(['sources', 0, 'url'], 'javascript:alert(1)')] })
  );
  return {
    schema_version: 'svetlost33-saints-test-expectations-1',
    fixture: 'saints-v1.json', fixture_sha256: hash(payloadBytes), fixture_bytes: payloadBytes.length,
    manuscript_sha256: MANUSCRIPT_SHA256,
    provenance: 'Owner-approved manuscript exported deterministically; unsigned fixture, never production authentication.',
    authoritative_calendar: { repository_path: calendarPath, ...CALENDAR_BINDING },
    context: { contentAuthenticated: true, calendarAuthenticated: true, moduleContext: { ...SAINTS_MODULE, version: payload.version, revision: payload.revision } },
    context_instructions: 'Test-only context. Load calendarContext identity from authoritative_calendar (omit repository_path) and days from the exact hash-checked canonical calendar. Never take authentication or identity from this fixture in runtime.',
    mutation_format: 'Replace/add the property at path segments in a deep copy of payload/context before evaluation. Paths contain strings or zero-based integer array indices.',
    word_counts: payload.articles.map(article => ({ id: article.id, 'sr-Cyrl': articleWordCount(article.content['sr-Cyrl']), 'sr-Latn': articleWordCount(article.content['sr-Latn']) })),
    calendar_notes: payload.days.filter(day => day.calendar_notes.length).map(day => ({ date: day.date, kind: day.calendar_notes[0].kind, related_article_id: day.calendar_notes[0].related_article_id })),
    cases
  };
}

export async function buildSaintsPilot(root = ROOT) {
  const pilot = JSON.parse(await readFile(resolve(root, PILOT_PATH), 'utf8'));
  const approval = JSON.parse(await readFile(resolve(root, pilot.human_editorial_approval.record), 'utf8'));
  const manuscript = await readFile(resolve(root, dirname(PILOT_PATH), pilot.content_document));
  assert.equal(hash(manuscript), MANUSCRIPT_SHA256, 'Exact owner-approved manuscript');
  assert.equal(approval.status, 'APPROVED_FOR_IMPLEMENTATION');
  assert.equal(approval.manuscript.sha256, MANUSCRIPT_SHA256);
  assert.equal(pilot.human_editorial_approval.manuscript_sha256, MANUSCRIPT_SHA256);
  assert.deepEqual(approval.article_ids, pilot.articles.map(article => article.id));
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.equal(approval.production_ready, false);
  const calendarBytes = await readFile(resolve(root, pilot.calendar_input.path));
  assert.equal(hash(calendarBytes), CALENDAR_BINDING.sha256, 'Exact approved calendar bytes');
  const calendar = JSON.parse(calendarBytes);
  const source = calendar.sources.find(item => item.id === pilot.calendar_input.source_id);
  assert.ok(source);
  const articles = pilot.articles.map(article => {
    const cyrl = { title: article.title_cyrl, ...readArticle(manuscript.toString('utf8'), article.id) };
    const latn = { title: toLatin(cyrl.title), intro: toLatin(cyrl.intro), body: cyrl.body.map(toLatin), takeaway: toLatin(cyrl.takeaway) };
    return { id: article.id, revision: article.revision, type: article.type, subtype: article.subtype ?? null, source_ids: article.source_ids, content: { 'sr-Cyrl': cyrl, 'sr-Latn': latn } };
  });
  const payload = {
    schema_version: 'svetlost33-saints-1', version: '2026.9.19', revision: 1,
    approval_id: approval.approval_id, review_status: 'approved',
    authorship: { kind: 'editorial_summary', assistance: 'ai', attribution: localized('Уреднички сажетак припремљен уз помоћ AI, према наведеним црквеним изворима. Није званично црквено одобрен текст.'), clerical_review: null },
    calendar_binding: CALENDAR_BINDING,
    sources: [
      { id: source.id, kind: 'calendar', title: source.title, url: source.url, publisher: pilot.calendar_input.publisher, original_author: null, published_on: null, reviewed_on: pilot.calendar_input.mapping_checked_on },
      ...pilot.sources.map(({ id, title, url, publisher, original_author, published_on, reviewed_on }) => ({ id, kind: 'article', title, url, publisher, original_author, published_on, reviewed_on }))
    ],
    articles,
    days: pilot.days.map(day => {
      const active = calendar.days.find(item => item.date === day.date);
      assert.ok(active);
      assert.equal(active.julian_date, day.julian_date);
      assert.equal(active.commemoration.title_cyrl, day.calendar_title_cyrl);
      return { date: day.date, julian_date: day.julian_date, calendar_title: localized(day.calendar_title_cyrl), calendar_source_ids: active.commemoration.source_ids, article_ids: day.article_ids, complete_saint_list: false, calendar_notes: day.calendar_notes.map(note => ({ kind: note.kind, label: localized(note.label_cyrl), related_article_id: note.related_article_id, source_ids: note.source_ids })) };
    })
  };
  const bytes = jsonBytes(payload);
  assert.equal(parseSaintsPayload(bytes).valid, true, 'Exported payload validation');
  const context = { contentAuthenticated: true, calendarAuthenticated: true, moduleContext: { ...SAINTS_MODULE, version: payload.version, revision: payload.revision }, calendarContext: { ...CALENDAR_BINDING, days: calendar.days } };
  for (const day of payload.days) assert.equal(evaluateSaintsDay(payload, { ...context, date: day.date }).eligible, true, `Calendar binding: ${day.date}`);
  const expected = pilotExpected(payload, pilot.calendar_input.path, bytes);
  return { payload, bytes, expected, expectedBytes: jsonBytes(expected) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (!['--check', '--write-new'].includes(mode)) throw new Error('Usage: node scripts/export-saints-pilot-v1.mjs --check|--write-new (fixed development fixture directory only)');
  const result = await buildSaintsPilot();
  for (const [name, bytes] of [['saints-v1.json', result.bytes], ['expected.json', result.expectedBytes]]) {
    const path = resolve(ROOT, FIXTURE_DIRECTORY, name);
    if (mode === '--check') assert.deepEqual(await readFile(path), bytes, `Deterministic fixture: ${name}`);
    else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    }
  }
  console.log(JSON.stringify({ result: 'PASS', mode, articles: result.payload.articles.length, days: result.payload.days.length, bytes: result.bytes.length, sha256: hash(result.bytes), signed: false, published: false }, null, 2));
}
