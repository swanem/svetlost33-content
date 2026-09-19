import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { buildSaintsPilot, CALENDAR_BINDING, MANUSCRIPT_SHA256, ROOT } from '../scripts/export-saints-pilot-v1.mjs';
import { SAINTS_LIMITS, SAINTS_MODULE, articleWordCount, evaluateSaintsDay, parseSaintsPayload, toLatin, validDate, validateSaintsPayload, wordCount } from '../scripts/validate-saints-v1.mjs';
import { validateRelease } from '../scripts/validate-m0-v2.mjs';

const bytes = await readFile(resolve(ROOT, 'fixtures/saints-v1/saints-v1.json'));
const payload = JSON.parse(bytes);
const expected = JSON.parse(await readFile(resolve(ROOT, 'fixtures/saints-v1/expected.json')));
const calendarBytes = await readFile(resolve(ROOT, expected.authoritative_calendar.repository_path));
const calendar = JSON.parse(calendarBytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const context = () => ({ ...clone(expected.context), calendarContext: { ...CALENDAR_BINDING, days: clone(calendar.days) }, date: '2026-09-19' });
const mutate = (target, changes) => {
  for (const { path, value } of changes) {
    let at = target;
    for (const key of path.slice(0, -1)) at = at[key];
    at[path.at(-1)] = clone(value);
  }
};

test('deterministic fixture is exactly approved manuscript and pinned canonical calendar, with no runtime authentication', async () => {
  const built = await buildSaintsPilot();
  assert.deepEqual(built.bytes, bytes);
  assert.deepEqual(built.expectedBytes, await readFile(resolve(ROOT, 'fixtures/saints-v1/expected.json')));
  assert.equal(sha256(bytes), expected.fixture_sha256);
  assert.equal(bytes.length, expected.fixture_bytes);
  assert.equal(sha256(calendarBytes), CALENDAR_BINDING.sha256);
  assert.equal(expected.manuscript_sha256, MANUSCRIPT_SHA256);
  assert.deepEqual(parseSaintsPayload(bytes), { valid: true, reason: null, payload });
  assert.deepEqual(evaluateSaintsDay(payload), { eligible: false, reason: 'content_not_authenticated' });
  assert.equal(payload.articles.length, 7);
  assert.equal(payload.days.length, 7);
  assert.equal(payload.authorship.clerical_review, null);
});

test('all shared expected cases are portable and agree with reference evaluator', async t => {
  for (const item of expected.cases) await t.test(item.id, () => {
    const changed = clone(payload), host = context();
    host.date = item.date;
    mutate(changed, item.payload_mutations);
    mutate(host, item.context_mutations);
    const evaluated = evaluateSaintsDay(changed, host);
    const actual = { eligible: evaluated.eligible, reason: evaluated.reason };
    if (evaluated.eligible) actual.article_ids = evaluated.articles.map(article => article.id);
    assert.deepEqual(actual, item.expected);
  });
});

test('calendar notes remain separate and reuse the existing feast article', () => {
  assert.deepEqual(expected.calendar_notes, [
    { date: '2026-09-20', kind: 'forefeast', related_article_id: 'nativity-theotokos' },
    { date: '2026-09-25', kind: 'leavetaking', related_article_id: 'nativity-theotokos' }
  ]);
  for (const day of payload.days) {
    assert.equal(day.complete_saint_list, false);
    assert.equal(day.calendar_title['sr-Latn'], toLatin(day.calendar_title['sr-Cyrl']));
  }
  const nativity = payload.sources.find(source => source.id === 'spc-nativity-2021');
  assert.equal(nativity.original_author, 'катихета Бранислав Илић');
  assert.equal(nativity.publisher, 'Информативна служба Српске православне цркве');
  assert.notEqual(payload.authorship.attribution['sr-Cyrl'], nativity.original_author);
});

test('exact active-day checks reject changed source records, absent/duplicate day and unknown commemoration', () => {
  for (const mutation of [
    active => { active.commemoration.source_ids = ['other-source']; },
    active => { active.commemoration.title_cyrl += ' '; },
    active => { active.julian_date = '2026-09-07'; },
    active => { active.commemoration.status = 'UNKNOWN'; },
    active => { active.commemoration.complete_saint_list_verified = true; }
  ]) {
    const host = context();
    mutation(host.calendarContext.days.find(day => day.date === host.date));
    assert.equal(evaluateSaintsDay(payload, host).reason, 'calendar_day_mismatch');
  }
  for (const days of [[], {}, [calendar.days.find(day => day.date === '2026-09-19'), calendar.days.find(day => day.date === '2026-09-19')]]) {
    const host = context(); host.calendarContext.days = days;
    assert.equal(evaluateSaintsDay(payload, host).reason, 'calendar_day_mismatch');
  }
});

test('Gregorian/Julian dates are real dates and are never normalized or computed from current time', () => {
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', '2026-2-01', '2026-09-19T00:00:00Z', '0000-01-01']) assert.equal(validDate(invalid), false, invalid);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2100-02-29'), false);
  assert.equal(validDate('2100-02-29', true), true);
  assert.equal(validDate('2026-02-29', true), false);
});

function articleWithWords(count) {
  const changed = clone(payload);
  const cyrl = { title: 'Наслов са додатним речима', intro: 'Реч', body: [Array(count - 2).fill('реч').join(' ')], takeaway: 'Реч' };
  changed.articles[0].content = { 'sr-Cyrl': cyrl, 'sr-Latn': { title: toLatin(cyrl.title), intro: toLatin(cyrl.intro), body: cyrl.body.map(toLatin), takeaway: toLatin(cyrl.takeaway) } };
  return changed;
}

test('100 and 200 word boundaries include prose only, with deterministic tokenization and paragraph separation', () => {
  for (const count of [99, 100, 200, 201]) {
    const changed = articleWithWords(count);
    assert.equal(articleWordCount(changed.articles[0].content['sr-Cyrl']), count);
    assert.equal(validateSaintsPayload(changed).valid, count >= 100 && count <= 200);
  }
  assert.equal(wordCount('један\u00a0два\u2009три\nчетири'), 4);
  assert.equal(articleWordCount({ intro: 'један', body: ['два', 'три'], takeaway: 'четири' }), 4);
  assert.deepEqual(expected.word_counts, payload.articles.map(article => ({ id: article.id, 'sr-Cyrl': articleWordCount(article.content['sr-Cyrl']), 'sr-Latn': articleWordCount(article.content['sr-Latn']) })));
});

test('Unicode scalars, plain text, parity and payload bounds are enforced independently of editorial word count', () => {
  assert.equal(toLatin('ЉЊЏ љњџ Ђђ Ћћ 😀'), 'LjNjDž ljnjdž Đđ Ćć 😀');
  const withTitle = title => {
    const changed = clone(payload);
    changed.articles[0].content['sr-Cyrl'].title = title;
    changed.articles[0].content['sr-Latn'].title = toLatin(title);
    return validateSaintsPayload(changed).valid;
  };
  assert.equal(withTitle('😀'.repeat(200)), true, 'scalar, not UTF-16 code-unit limit');
  assert.equal(withTitle('😀'.repeat(201)), false);
  for (const value of ['<script>', ' текст', 'текст ', 'текст\nново', '\u202eтекст', '\ud800']) assert.equal(withTitle(value), false);
  const tooLong = articleWithWords(100);
  for (const locale of ['sr-Cyrl', 'sr-Latn']) {
    tooLong.articles[0].content[locale].intro = 'a'.repeat(1000);
    tooLong.articles[0].content[locale].body = ['b'.repeat(2100), Array(97).fill('c').join(' ')];
    tooLong.articles[0].content[locale].takeaway = 'd'.repeat(1000);
  }
  assert.equal(validateSaintsPayload(tooLong).valid, false);
  assert.deepEqual(parseSaintsPayload(Buffer.from([0xc3, 0x28])), { valid: false, reason: 'malformed' });
  assert.equal(parseSaintsPayload(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])).valid, false);
  assert.equal(parseSaintsPayload(Buffer.concat([bytes, Buffer.alloc(SAINTS_LIMITS.bytes, 0x20)])).valid, false);
  assert.equal(validateSaintsPayload({ ...payload, articles: Array(65).fill(payload.articles[0]) }).valid, false);
  assert.equal(validateSaintsPayload({ ...payload, sources: Array(513).fill(payload.sources[0]) }).valid, false);
  assert.equal(validateSaintsPayload({ ...payload, days: Array(367).fill(payload.days[0]) }).valid, false);
});

test('unsafe references and partial malformed optional content never leak valid-looking fragments', () => {
  for (const url of ['http://spc.rs/page', 'https://user:password@spc.rs/page', 'https://127.0.0.1/', 'https://spc.rs:444/page', 'https://spc.rs/%0a', 'https://spc.rs/%5c', 'https://spc.rs/ a']) {
    const changed = clone(payload); changed.sources[0].url = url;
    assert.equal(validateSaintsPayload(changed).valid, false, url);
  }
  const citation = clone(payload); citation.sources[0].url = 'https://spc.rs/article#section';
  assert.equal(validateSaintsPayload(citation).valid, true);
  const changed = clone(payload); changed.articles[6].content['sr-Latn'].intro = 'Changed';
  assert.deepEqual(evaluateSaintsDay(changed, context()), { eligible: false, reason: 'malformed' });
  assert.equal(calendar.days.find(day => day.date === '2026-09-19').commemoration.title_cyrl, 'Чудо Светог Архангела Михаила');
});

test('M0 v2 accepts two identified library modules, skips unsupported optional payloads, and retains existing integrity gates', async t => {
  // Isolated transport test, not an annual native fixture or production release.
  const temp = await mkdtemp(resolve(tmpdir(), 'svetlost33-saints-test-'));
  const keyId = 'saints-ephemeral-test-key';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const put = async (path, value) => { await mkdir(dirname(resolve(temp, path)), { recursive: true }); await writeFile(resolve(temp, path), value); };
  const signature = value => `${sign('sha256', value, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`;
  const entries = [];
  const saintsPath = 'modules/saints-v1/data/saints-v1.json';
  async function addModule(id, type, capabilities, dataPath, data, required, dependencies = []) {
    const base = `modules/${id}`;
    const manifest = encode({ schema_version: 'svetlost33-module-manifest-2', module_id: id, module_type: type,
      version: id === 'saints-v1' ? payload.version : '2026.1.1', revision: id === 'calendar-2026-r1' ? 2 : 1, key_id: keyId,
      capabilities, dependencies, files: [{ path: dataPath, bytes: data.length, sha256: sha256(data), content_type: 'application/json', encoding: 'utf-8' }] });
    await put(`${base}/${dataPath}`, data); await put(`${base}/manifest.json`, manifest); await put(`${base}/manifest.sig`, signature(manifest));
    entries.push({ module_id: id, module_type: type, version: id === 'saints-v1' ? payload.version : '2026.1.1', required,
      manifest_path: `${base}/manifest.json`, manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), signature_path: `${base}/manifest.sig` });
  }
  async function envelopes() {
    const release = encode({ schema_version: 'svetlost33-release-set-2', release_set_id: 'saints-development-test', sequence: 1, channel: 'development', key_id: keyId,
      approved_platforms: ['android', 'ios'], min_clients: { android: 35, ios: '0.1.0' }, modules: entries });
    await put('release-set.json', release); await put('release-set.sig', signature(release));
    const index = encode({ schema_version: 'svetlost33-m0-index-2', sequence: 1, issued_at: '2026-09-19T00:00:00Z', expires_at: '2026-09-21T00:00:00Z', key_id: keyId,
      channels: { development: { release_set_id: 'saints-development-test', path: 'release-set.json', bytes: release.length, sha256: sha256(release), signature_path: 'release-set.sig' } } });
    await put('index.json', index); await put('index.sig', signature(index));
  }
  const options = (platform, saints) => ({ publicKeyPath: resolve(temp, 'trusted-public-key.pem'), trustedKeyId: keyId,
    platform, clientVersion: platform === 'android' ? 35 : '0.1.0', now: '2026-09-19T12:00:00Z', channel: 'development',
    clientCapabilities: ['library-v1', 'calendar-v1', ...(saints ? ['saints-v1'] : [])] });
  try {
    await put('trusted-public-key.pem', publicKey.export({ type: 'spki', format: 'pem' }));
    await addModule('library-annual-2026-r1', 'library', ['library-v1'], 'data/transport-only.json', encode({ transport_test_only: true }), true);
    await addModule('calendar-2026-r1', 'calendar', ['calendar-v1'], 'data/calendar.2026.json', calendarBytes, true);
    await addModule('saints-v1', 'library', ['saints-v1'], 'data/saints-v1.json', bytes, false, [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }]);
    await envelopes();
    for (const platform of ['android', 'ios']) {
      const supported = await validateRelease(temp, options(platform, true));
      assert.equal(supported.modules, 3);
      const older = await validateRelease(temp, options(platform, false));
      assert.equal(older.modules, 2);
      assert.deepEqual(older.skippedOptionalModules, ['saints-v1']);
    }
    await t.test('unsupported optional payload is skipped but supported corrupt payload cannot bypass transport', async () => {
      await put(saintsPath, Buffer.alloc(bytes.length, 0x20));
      assert.equal((await validateRelease(temp, options('android', false))).modules, 2);
      await assert.rejects(validateRelease(temp, options('android', true)), { code: 'HASH' });
      await put(saintsPath, bytes);
    });
    await t.test('unknown optional type rejects before capability skip, documenting why library is required', async () => {
      entries.at(-1).module_type = 'saints'; await envelopes();
      await assert.rejects(validateRelease(temp, options('android', false)), { code: 'SCHEMA' });
      entries.at(-1).module_type = 'library'; await envelopes();
    });
    await t.test('authenticated envelope is mandatory even for unsupported optional module', async () => {
      await put('modules/saints-v1/manifest.sig', 'invalid\n');
      await assert.rejects(validateRelease(temp, options('android', false)), { code: 'SIGNATURE' });
    });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
