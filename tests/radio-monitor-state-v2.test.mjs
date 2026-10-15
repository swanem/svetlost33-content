import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, chmod, symlink, lstat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { initializeRadioState, readRadioState, runRadioReview } from '../scripts/radio-monitor-state-v2.mjs';

// Synthetic corpus structure only: no Gospel prose, source HTML or personal preferences.
const corpus = { books: [['MAT', 28], ['MRK', 16], ['LUK', 24], ['JHN', 21]].map(([id, length]) => ({ id,
  chapters: Array.from({ length }, (_, i) => ({ number: i + 1,
    verses: Array.from({ length: 80 }, (_, j) => ({ number: j + 1 })) })) })) };
const reference = 'Јеванђеље по Јовану, зачало 3. 1,29-34';
const row = (date, ref = reference) => `<tr id="Datum${date.replaceAll('-', '')}"><td>test</td><td>test</td><td>${ref}</td></tr>`;
const html = (year, rows = row(`${year}-01-01`)) => `<h1>Тумачења Јеванђеља за ${year}. годину</h1><table>${rows}</table>`;
const response = (url, body, status = 200, headers = {}) => ({ status, url, redirected: false,
  headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
  body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }) });
const code = (promise, expected) => assert.rejects(promise, e => e.code === expected, expected);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Real watchdogs bound the harness, not the production transport's fake deadlines.
const test = (name, body) => nodeTest(name, { timeout: 20_000 }, body);
async function waitFor(promise, label, { signal, timeoutMs = 8000 } = {}) {
  let timer, aborted;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`test watchdog: ${label}`)), timeoutMs);
      aborted = () => reject(new Error(`test cancelled: ${label}`));
      if (signal?.aborted) aborted();
      else signal?.addEventListener('abort', aborted, { once: true });
    })]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', aborted);
  }
}
class Time {
  ms = 0;
  timers = new Set();
  driving = false;
  clock = { now: () => this.ms, wallNow: () => Date.parse('2026-09-30T12:00:00Z') + this.ms };
  sleep = (ms, { signal } = {}) => new Promise((resolveSleep, reject) => {
    if (signal?.aborted) { reject(new Error('cancelled')); return; }
    const cleanup = () => { this.timers.delete(timer); signal?.removeEventListener('abort', abort); };
    const timer = { at: this.ms + ms, finish: () => { cleanup(); resolveSleep(); } };
    const abort = () => { cleanup(); reject(new Error('cancelled')); };
    this.timers.add(timer); signal?.addEventListener('abort', abort, { once: true });
  });
  advance() {
    assert(this.timers.size, 'test deadlock: no pending fake timer');
    this.ms = Math.min(...[...this.timers].map(t => t.at));
    for (const timer of [...this.timers]) if (timer.at <= this.ms) timer.finish();
  }
  async drive(promise, { signal, advanceTimers = true, timeoutMs = 8000 } = {}) {
    let done = false, result, error;
    promise.then(value => { result = value; done = true; }, value => { error = value; done = true; });
    assert.equal(this.driving, false, 'a fake clock must have exactly one driver');
    this.driving = true;
    const deadline = performance.now() + timeoutMs;
    try {
      while (true) {
        assert(performance.now() < deadline, 'test watchdog: fake clock run');
        await pause(1, undefined, { signal }); // Yield to filesystem callbacks without interpreting their latency as fake time.
        for (let j = 0; j < 80; j++) await Promise.resolve();
        if (done) { if (error) throw error; return result; }
        if (advanceTimers && this.timers.size) this.advance();
      }
    } finally { this.driving = false; }
  }
}
async function fixture(t, initialize = true) {
  const base = await mkdtemp(join(tmpdir(), 'radio-state-v2-test-'));
  const controller = new AbortController(), active = new Set();
  t.after(async () => {
    controller.abort();
    // Abort and join workers before removing exactly this test-owned tree. A
    // failed assertion/watchdog must not strand a writer or race late cleanup.
    await waitFor(Promise.allSettled([...active]), 'private writer cleanup', { timeoutMs: 5000 });
    await rm(base, { recursive: true, force: true });
  });
  const directory = join(base, 'private-store');
  if (initialize) await initializeRadioState({ directory, corpus });
  const time = new Time();
  const signal = AbortSignal.any([controller.signal, t.signal]);
  const start = (fetchImpl = async url => response(url, html(Number(new URL(url).searchParams.get('Godina')))), options = {}) => {
    const pending = runRadioReview({ directory, corpus, currentYear: 2026, years: [2026], fetchImpl,
      clock: time.clock, sleep: time.sleep, ...options,
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal });
    active.add(pending);
    // Observe both outcomes immediately, including raw workers whose result is
    // awaited only after a readiness signal or a competing writer.
    pending.then(() => active.delete(pending), () => active.delete(pending));
    return pending;
  };
  return { base, directory, time,
    read: () => readRadioState({ directory }),
    start,
    run: (fetchImpl, options) => time.drive(start(fetchImpl, options), { signal }),
  };
}
async function files(directory) { return (await readdir(directory)).sort(); }
async function pointer(directory) { return JSON.parse(await readFile(join(directory, 'CURRENT.json'))); }

test('explicit initialization creates only private local files and never chooses a default directory', async t => {
  await code(initializeRadioState({ corpus }), 'explicit_private_directory_required');
  const f = await fixture(t);
  const state = await f.read(); assert.equal(state.revision, 0); assert.deepEqual(state.years, {});
  assert.equal((await lstat(f.directory)).mode & 0o077, 0);
  for (const file of await files(f.directory)) assert.equal((await lstat(join(f.directory, file))).mode & 0o077, 0);
  await code(initializeRadioState({ directory: f.directory, corpus }), 'state_not_empty');
});
test('public checkout, group-readable directory and symlink destination are rejected before writing facts', async t => {
  const f = await fixture(t, false);
  await code(initializeRadioState({ directory: resolve('drafts/private-radio-test-must-not-exist'), corpus }), 'public_tree_forbidden');
  const checkout = join(f.base, 'test-checkout'); await mkdir(checkout, { mode: 0o700 }); await mkdir(join(checkout, '.git'));
  await code(initializeRadioState({ directory: join(checkout, 'state'), corpus }), 'public_tree_forbidden');
  const openDir = join(f.base, 'not-private'); await mkdir(openDir, { mode: 0o755 }); await chmod(openDir, 0o755);
  await code(initializeRadioState({ directory: openDir, corpus }), 'private_directory_required');
  await symlink(openDir, f.directory);
  await code(initializeRadioState({ directory: f.directory, corpus }), 'private_directory_required');
});
test('initial source diff and report commit together; restart and unchanged facts deduplicate', async t => {
  const f = await fixture(t);
  const first = await f.run(); assert.equal(first.outcome, 'observations_recorded');
  assert.equal(first.results[0].new_review_needed, true); assert.equal(first.publication_authorized, false);
  const after = await f.read(); assert.equal(after.years['2026'].core.rows.length, 1);
  assert.equal(after.years['2026'].review_candidate.release_allowed, false);
  assert.equal(after.years['2026'].review_candidate.production_ready, false);
  f.time.ms += 86_400_000;
  const second = await f.run(); assert.equal(second.results[0].new_review_needed, false);
  const restarted = await readRadioState({ directory: f.directory });
  assert.equal(restarted.revision, 2); assert.equal(restarted.years['2026'].core.seen_fingerprints.length, 1);
  assert.notEqual(restarted.years['2026'].core.last_success_at, after.years['2026'].core.last_success_at);
  assert.deepEqual(restarted.years['2026'].review_candidate, after.years['2026'].review_candidate);
});
test('changed and removed source rows create only a private review diff, not deletion/approval instructions', async t => {
  const f = await fixture(t);
  await f.run(async url => response(url, html(2026, row('2026-01-01') + row('2026-01-02'))));
  const result = await f.run(async url => response(url, html(2026, row('2026-01-01', reference.replace('29-34', '29-35')))));
  assert.equal(result.results[0].new_review_needed, true);
  const candidate = (await f.read()).years['2026'].review_candidate;
  assert.equal(candidate.diff.changed.length, 1); assert.equal(candidate.diff.removed.length, 1);
  assert.equal(candidate.release_allowed, false);
  assert.equal((await files(f.directory)).filter(x => x.startsWith('generation-')).length, 3);
});
test('invalid references preserve last-good but persist a separate observed snapshot and deduplicated review', async t => {
  const f = await fixture(t); await f.run(); const good = (await f.read()).years['2026'];
  f.time.ms += 1000;
  const invalidFetch = async url => response(url, html(2026, row('2026-01-01', 'Јеванђеље по Луки, зачало 32. 7,31-25')));
  const first = await f.run(invalidFetch); assert.equal(first.outcome, 'all_failed');
  assert.equal(first.results[0].status, 'invalid_references'); assert.equal(first.results[0].new_review_needed, true);
  const invalid = (await f.read()).years['2026'];
  assert.deepEqual(invalid.core.rows, good.core.rows); assert.equal(invalid.core.last_success_at, good.core.last_success_at);
  assert.equal(invalid.last_observation.validation_failed, true); assert.notDeepEqual(invalid.last_observation.rows, good.core.rows);
  const repeated = await f.run(invalidFetch); assert.equal(repeated.results[0].new_review_needed, false);
  assert.equal((await f.read()).years['2026'].core.last_success_at, good.core.last_success_at);
});
test('first-ever invalid observation never invents a last-good snapshot', async t => {
  const f = await fixture(t);
  await f.run(async url => response(url, html(2026, row('2026-01-01', 'Јеванђеље по Луки, зачало 32. 7,31-25'))));
  const state = (await f.read()).years['2026'];
  assert.deepEqual(state.core.rows, []); assert.equal(state.core.last_success_at, null);
  assert.equal(state.last_observation.rows.length, 1); assert(state.review_candidate);
});
test('HTTP/parse failures record an attempt but preserve last-good, last-observation and pending review', async t => {
  const f = await fixture(t); await f.run(); const before = (await f.read()).years['2026'];
  for (const [body, status, expected] of [['denied', 403, 'transport_failed'], ['wrong html', 200, 'parse_failed']]) {
    f.time.ms += 1000;
    const result = await f.run(async url => response(url, body, status));
    assert.equal(result.results[0].status, expected); assert.equal(result.results[0].new_review_needed, false);
    const after = (await f.read()).years['2026'];
    assert.deepEqual(after.core, before.core); assert.deepEqual(after.last_observation, before.last_observation);
    assert.deepEqual(after.review_candidate, before.review_candidate); assert.equal(after.last_attempt.status, expected);
  }
});
test('temporary errors retry exactly within transport policy and only final complete HTML can change last-good', async t => {
  const f = await fixture(t); await f.run(); let calls = 0;
  const result = await f.run(async url => {
    calls++; return calls < 3 ? response(url, '', 503) : response(url, html(2026, row('2026-01-02')));
  });
  assert.equal(calls, 3); assert.equal(result.results[0].status, 'valid_observation');
  assert.equal((await f.read()).years['2026'].core.rows[0].date, '2026-01-02');
});
test('attempt timeouts and exhausted retries cannot advance last-good', async t => {
  const f = await fixture(t); await f.run(); const before = (await f.read()).years['2026']; let calls = 0;
  const result = await f.run(() => { calls++; return new Promise(() => {}); });
  assert.equal(calls, 3); assert.equal(result.results[0].error_code, 'attempt_timeout');
  const after = (await f.read()).years['2026']; assert.deepEqual(after.core, before.core);
  assert.deepEqual(after.last_observation, before.last_observation);
});
test('whole transport deadline including Retry-After persists failure, not partial/late HTML', async t => {
  const f = await fixture(t); await f.run(); const before = (await f.read()).years['2026']; let calls = 0;
  const result = await f.run(async (url, options) => {
    calls++;
    if (calls === 1) { await f.time.sleep(5000, { signal: options.signal }); return response(url, '', 429, { 'retry-after': '10' }); }
    return new Promise(() => {});
  });
  assert.equal(calls, 2); assert.equal(result.results[0].error_code, 'deadline_exceeded');
  assert.deepEqual((await f.read()).years['2026'].core, before.core);
});
test('current and next year are explicit independent inputs; one unavailable year is partial failure', async t => {
  const f = await fixture(t), called = [];
  const result = await f.run(async url => {
    const year = Number(new URL(url).searchParams.get('Godina')); called.push(year);
    return response(url, year === 2026 ? html(year) : html(2026));
  }, { years: [2026, 2027] });
  assert.deepEqual(called, [2026, 2027]); assert.equal(result.outcome, 'partial_failure');
  const state = await f.read(); assert.equal(state.years['2026'].core.rows.length, 1);
  assert.deepEqual(state.years['2027'].core.rows, []); assert.equal(state.years['2027'].core.last_success_at, null);
  for (const years of [undefined, [], [2026, 2026], [2028], [2026, 2027, 2028], ['2026']]) {
    await code(f.run(undefined, { years }), 'explicit_years_required');
  }
});
test('year rollover retains earlier state; no recurrence or cross-year remapping', async t => {
  const f = await fixture(t); await f.run(undefined, { years: [2026, 2027] });
  const before = await f.read();
  await f.run(undefined, { currentYear: 2027, years: [2027, 2028] });
  const after = await f.read(); assert.deepEqual(after.years['2026'], before.years['2026']);
  assert.equal(after.years['2028'].core.rows[0].date, '2028-01-01');
});
test('missing directory/pointer never fabricates empty state or starts network', async t => {
  const f = await fixture(t, false); let called = false;
  await code(f.run(() => { called = true; }), 'state_missing'); assert.equal(called, false);
  await initializeRadioState({ directory: f.directory, corpus }); await unlink(join(f.directory, 'CURRENT.json'));
  await code(f.read(), 'state_missing'); await code(f.run(() => { called = true; }), 'state_missing');
  await code(initializeRadioState({ directory: f.directory, corpus }), 'state_not_empty'); assert.equal(called, false);
});
test('corrupted pointer, missing generation and checksum mismatch fail closed without fallback', async t => {
  const f = await fixture(t); await f.run(); const saved = await readFile(join(f.directory, 'CURRENT.json'));
  await writeFile(join(f.directory, 'CURRENT.json'), '{broken'); await code(f.read(), 'corrupt_pointer');
  await writeFile(join(f.directory, 'CURRENT.json'), saved);
  const p = await pointer(f.directory), target = join(f.directory, p.file), generation = await readFile(target);
  await unlink(target); await code(f.read(), 'generation_missing');
  await writeFile(target, Buffer.from(`${generation.toString()} `), { mode: 0o600 });
  await code(f.read(), 'generation_integrity_failed');
});
test('unknown schema and path traversal are not reset even when an attacker recomputes a local checksum', async t => {
  const f = await fixture(t); const p = await pointer(f.directory), target = join(f.directory, p.file);
  const snapshot = JSON.parse(await readFile(target)); snapshot.schema_version = 'future-999';
  const bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`); await writeFile(target, bytes);
  await writeFile(join(f.directory, 'CURRENT.json'), JSON.stringify({ ...p, bytes: bytes.length, sha256: hash(bytes) }));
  await code(f.read(), 'corrupt_state');
  await writeFile(join(f.directory, 'CURRENT.json'), JSON.stringify({ ...p, file: '../outside.json' }));
  await code(f.read(), 'corrupt_pointer');
});
test('symlink pointer and exposed files fail the owner-only storage boundary', async t => {
  const f = await fixture(t); const saved = await readFile(join(f.directory, 'CURRENT.json'));
  const outside = join(f.base, 'outside-pointer.json'); await writeFile(outside, saved, { mode: 0o600 });
  await unlink(join(f.directory, 'CURRENT.json')); await symlink(outside, join(f.directory, 'CURRENT.json'));
  await assert.rejects(f.read()); await unlink(join(f.directory, 'CURRENT.json'));
  await writeFile(join(f.directory, 'CURRENT.json'), saved, { mode: 0o600 }); await chmod(join(f.directory, 'CURRENT.json'), 0o644);
  await code(f.read(), 'unsafe_state_file');
});
for (const stage of ['before_snapshot', 'after_snapshot_sync', 'before_pointer_rename']) {
  test(`failure at ${stage} cannot publish partial state/report or lose dedup baseline`, async t => {
    const f = await fixture(t); await f.run(); const before = await f.read(), oldPointer = await readFile(join(f.directory, 'CURRENT.json'));
    await code(f.run(async url => response(url, html(2026, row('2026-01-02'))), {
      checkpoint: at => { if (at === stage) throw new Error('synthetic fault'); },
    }), 'storage_commit_failed');
    assert.deepEqual(await f.read(), before); assert.deepEqual(await readFile(join(f.directory, 'CURRENT.json')), oldPointer);
    const retry = await f.run(async url => response(url, html(2026, row('2026-01-02'))));
    assert.equal(retry.results[0].new_review_needed, true);
  });
}
test('after-rename acknowledgement failure is explicit; restart reads complete generation and deduplicates', async t => {
  const f = await fixture(t); await f.run();
  const changed = async url => response(url, html(2026, row('2026-01-02')));
  await code(f.run(changed, { checkpoint: at => { if (at === 'after_pointer_rename') throw new Error('lost acknowledgement'); } }), 'commit_outcome_uncertain');
  const committed = await f.read(); assert.equal(committed.revision, 2);
  assert.equal(committed.years['2026'].core.rows[0].date, '2026-01-02');
  assert.equal(committed.run_report.results[0].candidate_fingerprint, committed.years['2026'].review_candidate.fingerprint);
  assert.equal((await f.run(changed)).results[0].new_review_needed, false);
});
test('readers see old complete generation while a writer has synced but not published the next one', async t => {
  const f = await fixture(t); await f.run(); const old = await f.read();
  await f.run(async url => response(url, html(2026, row('2026-01-02'))), { checkpoint: async at => {
    if (at === 'before_pointer_rename') assert.deepEqual(await f.read(), old);
  } });
  assert.equal((await f.read()).revision, old.revision + 1);
});
test('concurrent writers fail fast under one store lock; no lost update or duplicate first diff', async t => {
  const f = await fixture(t); let entered, resume;
  const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { resume = r; });
  const first = f.start(async url => { entered(); await gate; return response(url, html(2026)); });
  t.after(resume); // Release the intentionally non-cooperative fake even if an assertion fails.
  await waitFor(ready, 'first writer entered fetch', { signal: t.signal });
  // Reproduce a slow competing I/O path without driving the first writer's
  // clock. The old f.run() advanced its suspended attempt to timeout and then
  // stopped driving on store_busy, leaving `await first` stuck in fake backoff.
  await pause(25, undefined, { signal: t.signal });
  await code(waitFor(f.start(), 'competing writer', { signal: t.signal }), 'store_busy');
  assert.equal(f.time.ms, 0); assert.equal(f.time.timers.size, 1);
  resume(); const completed = await f.time.drive(first, { signal: t.signal });
  assert.equal(completed.revision, 1); assert.equal((await f.read()).revision, 1);
  assert.equal((await f.run()).results[0].new_review_needed, false);
});
test('harness watchdog bounds a suspended fake worker and cancellation joins it without a partial commit', async t => {
  const f = await fixture(t), controller = new AbortController();
  let entered; const ready = new Promise(resolveReady => { entered = resolveReady; });
  const first = f.start(() => { entered(); return new Promise(() => {}); }, { signal: controller.signal });
  await waitFor(ready, 'stalled writer entered fetch', { signal: t.signal });
  try {
    await assert.rejects(f.time.drive(first, { advanceTimers: false, timeoutMs: 20, signal: t.signal }),
      /test watchdog: fake clock run/);
    assert.equal(f.time.ms, 0);
  } finally { controller.abort(); }
  await code(waitFor(first, 'aborted stalled writer', { signal: t.signal }), 'cancelled');
  assert.equal((await f.read()).revision, 0);
  assert.equal(f.time.timers.size, 0); assert(!(await files(f.directory)).includes('.writer.lock'));
});
test('old cross-driven clock race is bounded and observable instead of hanging the test process', async t => {
  const f = await fixture(t), controller = new AbortController(); let entered, resume;
  const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { resume = r; });
  const first = f.start(async url => { entered(); await gate; return response(url, html(2026)); }, { signal: controller.signal });
  t.after(resume);
  await waitFor(ready, 'race writer entered fetch', { signal: t.signal });
  // Force exactly the event ordering formerly introduced by another run's
  // driver while its own lock acquisition was waiting on filesystem I/O.
  f.time.advance();
  for (let i = 0; i < 80; i++) await Promise.resolve();
  await code(waitFor(f.start(), 'race competing writer', { signal: t.signal }), 'store_busy');
  resume();
  try {
    await assert.rejects(waitFor(first, 'un-driven retry backoff', { signal: t.signal, timeoutMs: 20 }),
      /test watchdog: un-driven retry backoff/);
    assert.equal(f.time.ms, 6000); assert(f.time.timers.size > 0);
  } finally { controller.abort(); }
  await code(waitFor(first, 'race writer cancellation', { signal: t.signal }), 'cancelled');
  assert.equal((await f.read()).revision, 0);
  assert.equal(f.time.timers.size, 0); assert(!(await files(f.directory)).includes('.writer.lock'));
});
test('stale lock is not silently broken and unrelated partial generation is never activated', async t => {
  const f = await fixture(t); await f.run(); const before = await f.read();
  await writeFile(join(f.directory, '.writer.lock'), 'synthetic stopped writer', { mode: 0o600 });
  await code(f.run(), 'store_busy'); assert.deepEqual(await f.read(), before);
  await unlink(join(f.directory, '.writer.lock'));
  await writeFile(join(f.directory, 'generation-00000000-0000-0000-0000-000000000000.json'), '{incomplete', { mode: 0o600 });
  assert.deepEqual(await f.read(), before); await f.run(); assert.equal((await f.read()).revision, 2);
});
test('caller cancellation leaves pointer and state untouched and releases lock', async t => {
  const f = await fixture(t); await f.run(); const before = await f.read(), controller = new AbortController();
  await code(f.run(() => { controller.abort(); return new Promise(() => {}); }, { signal: controller.signal }), 'cancelled');
  assert.deepEqual(await f.read(), before); assert(!(await files(f.directory)).includes('.writer.lock'));
});
test('corpus changes require review and cannot silently reinterpret a persisted baseline', async t => {
  const f = await fixture(t); const changed = structuredClone(corpus); changed.books[0].chapters[0].verses.pop();
  let called = false;
  await code(f.run(() => { called = true; }, { corpus: changed }), 'corpus_change_requires_review'); assert.equal(called, false);
});
test('private snapshots contain normalized facts only, not raw HTML, approval or notification side effects', async t => {
  const f = await fixture(t); await f.run();
  for (const file of (await files(f.directory)).filter(x => x.startsWith('generation-'))) {
    const data = await readFile(join(f.directory, file), 'utf8');
    assert(!data.includes('<html')); assert(!data.includes('<tr')); assert(!data.includes('<h1'));
    assert(!data.includes('publication_authorized":true')); assert(!data.includes('release_allowed":true'));
  }
});
