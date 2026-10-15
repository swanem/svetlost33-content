import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRadioHtml, abortableSleep, TRANSPORT_LIMITS } from '../scripts/radio-monitor-transport-v2.mjs';
import { sourceURL } from '../scripts/radio-monitor-core-v2.mjs';

// Every invocation injects a fake fetch; this test file never calls global fetch.
class FakeTime {
  nowMs = 0;
  epoch = Date.parse('2026-09-30T00:00:00Z');
  timers = new Set();
  waits = [];
  clock = { now: () => this.nowMs, wallNow: () => this.epoch + this.nowMs };
  sleep = (ms, { signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }
    const timer = { at: this.nowMs + ms, finish: () => { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error('aborted')); };
    const cleanup = () => { this.timers.delete(timer); signal?.removeEventListener('abort', abort); };
    this.waits.push(ms); this.timers.add(timer); signal?.addEventListener('abort', abort, { once: true });
  });
  advance() {
    assert(this.timers.size, 'test deadlock: no pending fake timer');
    this.nowMs = Math.min(...[...this.timers].map(t => t.at));
    for (const timer of [...this.timers]) if (timer.at <= this.nowMs) timer.finish();
  }
}
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
async function drive(promise, time) {
  let done = false, value, failure;
  promise.then(v => { value = v; done = true; }, e => { failure = e; done = true; });
  for (let i = 0; i < 100; i++) {
    await flush();
    if (done) { if (failure) throw failure; return value; }
    time.advance();
  }
  assert.fail('fake deadline did not terminate');
}
function response(url, { status = 200, text = '<html>test-only</html>', chunks,
  headers = {}, redirected = false, body } = {}) {
  return { status, url, redirected,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
    body: body ?? new ReadableStream({ start(controller) {
      for (const value of chunks ?? [new TextEncoder().encode(text)]) controller.enqueue(value);
      controller.close();
    } }),
  };
}
function harness(steps) {
  const time = new FakeTime(), calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, at: time.nowMs });
    const step = steps[calls.length - 1];
    assert.notEqual(step, undefined, 'unexpected request');
    return typeof step === 'function' ? step(url, options, time) : response(url, step);
  };
  return { time, calls, run: (options = {}) => drive(fetchRadioHtml(2027,
    { fetchImpl, clock: time.clock, sleep: time.sleep, ...options }), time) };
}
const rejectsCode = (promise, code) => assert.rejects(promise, e => e.code === code, code);

test('explicit year, anonymous manual GET and bounded streamed UTF-8; never semantic success', async () => {
  const bytes = new TextEncoder().encode('<html>Јеванђеље</html>');
  const h = harness([{ chunks: [bytes.slice(0, 9), bytes.slice(9)] }]);
  const result = await h.run();
  assert.equal(h.calls[0].url, sourceURL(2027));
  assert.equal(h.calls[0].options.redirect, 'manual');
  assert.equal(h.calls[0].options.credentials, 'omit');
  assert.equal(h.calls[0].options.method, 'GET');
  assert.equal(result.transport_status, 'received_unvalidated_html');
  assert.equal(result.html, '<html>Јеванђеље</html>');
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.attempts, 1);
  assert.equal(h.time.timers.size, 0);
});
test('no implicit network and invalid year is rejected before fetching', async () => {
  await rejectsCode(fetchRadioHtml(2027), 'invalid_dependencies');
  let called = false;
  await assert.rejects(fetchRadioHtml('2027', { fetchImpl: () => { called = true; } }), /unsupported_year/);
  assert.equal(called, false);
});
test('same-origin redirects are followed manually and resolved relative to current URL', async () => {
  const h = harness([{ status: 302, headers: { location: '/cir/calendar-new?Godina=2027' } }, {}]);
  const result = await h.run();
  assert.equal(result.final_url, 'https://www.slovoljubve.com/cir/calendar-new?Godina=2027');
  assert.equal(result.redirects, 1); assert.equal(result.attempts, 1);
  assert.equal(h.calls.length, 2);
});
for (const target of ['http://www.slovoljubve.com/x', 'https://evil.example/x',
  'https://slovoljubve.com/x', 'https://www.slovoljubve.com.evil.example/x',
  'https://user:password@www.slovoljubve.com/x', 'https://www.slovoljubve.com:444/x',
  'https://127.0.0.1/x', '//evil.example/x', '/x#fragment', 'blob:https://www.slovoljubve.com/test']) {
  test(`redirect allowlist rejects ${target}`, async () => {
    const h = harness([{ status: 302, headers: { location: target } }]);
    await rejectsCode(h.run(), 'unsafe_redirect'); assert.equal(h.calls.length, 1);
  });
}
test('missing Location, loop and redirect limit cannot be success', async () => {
  await rejectsCode(harness([{ status: 302 }]).run(), 'unsafe_redirect');
  await rejectsCode(harness([{ status: 302, headers: { location: sourceURL(2027) } }]).run(), 'redirect_loop');
  const h = harness(Array.from({ length: 4 }, (_, i) => ({ status: 302, headers: { location: `/hop-${i}` } })));
  await rejectsCode(h.run(), 'redirect_limit'); assert.equal(h.calls.length, 4);
});
test('fetch implementation may not follow redirects behind the adapter', async () => {
  await rejectsCode(harness([url => response(url, { redirected: true })]).run(), 'invalid_response');
  await rejectsCode(harness([() => response('https://www.slovoljubve.com/unrequested')]).run(), 'uncontrolled_redirect');
});
test('exact max bytes is allowed and an understated length cannot bypass streamed limit', async () => {
  const maximum = new Uint8Array(TRANSPORT_LIMITS.maxBytes).fill(65);
  assert.equal((await harness([{ chunks: [maximum] }]).run()).bytes, maximum.length);
  await rejectsCode(harness([{ chunks: [maximum, new Uint8Array([65])], headers: { 'content-length': '1' } }]).run(), 'response_limit');
  await rejectsCode(harness([{ headers: { 'content-length': String(maximum.length + 1) } }]).run(), 'response_limit');
});
test('unknown content type, unsupported charset, invalid UTF-8 and empty body fail closed', async () => {
  for (const [options, code] of [
    [{ headers: { 'content-type': 'application/json' } }, 'unsupported_content_type'],
    [{ headers: { 'content-type': 'text/html; charset=windows-1251' } }, 'unsupported_charset'],
    [{ headers: { 'content-type': 'text/html; charset=' } }, 'unsupported_charset'],
    [{ chunks: [new Uint8Array([0xc3, 0x28])] }, 'invalid_utf8'],
    [{ text: '' }, 'empty_body'],
    [{ headers: { 'content-length': '-1' } }, 'invalid_content_length'],
  ]) await rejectsCode(harness([options]).run(), code);
});
test('truncated identity body fails length check; decoded compressed length is not compared to wire length', async () => {
  await rejectsCode(harness([{ text: 'abc', headers: { 'content-length': '5' } }]).run(), 'content_length_mismatch');
  const value = await harness([{ text: 'decoded html', headers: { 'content-encoding': 'gzip', 'content-length': '5' } }]).run();
  assert.equal(value.html, 'decoded html'); // Fake fetch models an already-decoded Fetch response.
});
for (const status of [204, 206, 304, 400, 401, 403, 404, 501, 505, 599]) {
  test(`HTTP ${status} is not retried or reported as success`, async () => {
    const h = harness([{ status }]); await rejectsCode(h.run(), 'http_status'); assert.equal(h.calls.length, 1);
  });
}
test('429 delta Retry-After is honored; at most two retries / three attempts', async () => {
  const h = harness([{ status: 429, headers: { 'retry-after': '2' } }, { status: 503 }, {}]);
  assert.equal((await h.run()).attempts, 3);
  assert.deepEqual(h.calls.map(c => c.at), [0, 2000, 2500]);
  const exhausted = harness([{ status: 503 }, { status: 503 }, { status: 503 }]);
  await rejectsCode(exhausted.run(), 'temporary_http_status');
  assert.equal(exhausted.calls.length, 3);
});
test('HTTP-date Retry-After uses injected wall clock and is never shortened', async () => {
  const h = harness([{ status: 429, headers: { 'retry-after': 'Wed, 30 Sep 2026 00:00:03 GMT' } }, {}]);
  await h.run(); assert.deepEqual(h.calls.map(c => c.at), [0, 3000]);
  const long = harness([{ status: 429, headers: { 'retry-after': '11' } }]);
  await rejectsCode(long.run(), 'retry_after_exceeds_limit'); assert.equal(long.calls.length, 1);
});
test('malformed Retry-After is not guessed into an early retry', async () => {
  for (const value of ['later', '-1', '0.5', '2026-09-30', 'Thu, 30 Sep 2026 00:00:03 GMT']) {
    const h = harness([{ status: 429, headers: { 'retry-after': value } }]);
    await rejectsCode(h.run(), 'invalid_retry_after'); assert.equal(h.calls.length, 1);
  }
});
test('known temporary statuses retry, generic fetch and stream failures do not', async () => {
  for (const status of [500, 502, 503, 504]) assert.equal((await harness([{ status }, {}]).run()).attempts, 2);
  const failed = harness([() => { throw new TypeError('network failed'); }]);
  await rejectsCode(failed.run(), 'fetch_failed'); assert.equal(failed.calls.length, 1);
  const broken = new ReadableStream({ start(c) { c.error(new Error('broken')); } });
  await rejectsCode(harness([{ body: broken }]).run(), 'transport_failed');
});
test('attempt timeout aborts a stalled fetch, retries twice and cannot become success', async () => {
  const h = harness(Array.from({ length: 3 }, () => () => new Promise(() => {})));
  await rejectsCode(h.run(), 'attempt_timeout');
  assert.equal(h.calls.length, 3);
  assert(h.calls.every(c => c.options.signal.aborted));
  assert.equal(h.time.nowMs, 18_750); assert.equal(h.time.timers.size, 0);
});
test('body stall is covered by the same attempt timeout, including cancellation', async () => {
  let cancelled = 0;
  const h = harness(Array.from({ length: 3 }, () => url => response(url, {
    body: new ReadableStream({ cancel() { cancelled++; } }),
  })));
  await rejectsCode(h.run(), 'attempt_timeout'); assert.equal(cancelled, 3);
});
test('late result from a timed-out fetch is cancelled and cannot replace the successful retry', async () => {
  let resolveLate, lateCancelled = 0;
  const h = harness([
    () => new Promise(resolve => { resolveLate = resolve; }),
    url => {
      resolveLate(response(sourceURL(2027), { body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('late stale html')); },
        cancel() { lateCancelled++; },
      }) }));
      return response(url, { text: 'fresh retry html' });
    },
  ]);
  const result = await h.run();
  assert.equal(result.attempts, 2); assert.equal(result.html, 'fresh retry html');
  await flush(); assert.equal(lateCancelled, 1);
});
test('too many zero-size chunks cannot bypass the body work/memory bound', async () => {
  const time = new FakeTime();
  const chunks = Array.from({ length: TRANSPORT_LIMITS.maxChunks + 1 }, () => new Uint8Array());
  await rejectsCode(fetchRadioHtml(2027, { fetchImpl: async url => response(url, { chunks }),
    clock: time.clock, sleep: time.sleep }), 'chunk_limit');
  assert.equal(time.timers.size, 0);
});
test('total deadline includes Retry-After and late response cannot become success', async () => {
  const h = harness([
    async (url, options, time) => { await time.sleep(5000, { signal: options.signal }); return response(url, { status: 429, headers: { 'retry-after': '10' } }); },
    () => new Promise(() => {}),
  ]);
  await rejectsCode(h.run(), 'deadline_exceeded');
  assert.deepEqual(h.calls.map(c => c.at), [0, 15_000]); assert.equal(h.time.nowMs, 20_000);
});
test('Retry-After that cannot fit remaining deadline stops instead of retrying early', async () => {
  const h = harness([
    async (url, options, time) => { await time.sleep(5000, { signal: options.signal }); return response(url, { status: 429, headers: { 'retry-after': '10' } }); },
    url => response(url, { status: 429, headers: { 'retry-after': '10' } }),
  ]);
  await rejectsCode(h.run(), 'retry_budget_exhausted'); assert.equal(h.calls.length, 2);
});
test('external cancellation before start does not call fetch', async () => {
  const controller = new AbortController(); controller.abort(); const h = harness([]);
  await rejectsCode(h.run({ signal: controller.signal }), 'cancelled'); assert.equal(h.calls.length, 0);
});
test('external cancellation during fetch terminates without retry', async () => {
  const controller = new AbortController();
  const h = harness([() => { controller.abort(); return new Promise(() => {}); }]);
  await rejectsCode(h.run({ signal: controller.signal }), 'cancelled');
  assert.equal(h.calls.length, 1); assert.equal(h.time.timers.size, 0);
});
test('external cancellation during backoff does not issue another request', async () => {
  const controller = new AbortController(); const h = harness([{ status: 429, headers: { 'retry-after': '2' } }]);
  const result = fetchRadioHtml(2027, { fetchImpl: async (...args) => {
    h.calls.push({ url: args[0] }); return response(args[0], { status: 429, headers: { 'retry-after': '2' } });
  }, signal: controller.signal, clock: h.time.clock, sleep: h.time.sleep });
  await flush(); controller.abort();
  await rejectsCode(result, 'cancelled'); assert.equal(h.calls.length, 1);
  await flush(); assert.equal(h.time.timers.size, 0);
});
test('default sleep supports already-aborted cancellation without waiting', async () => {
  const controller = new AbortController(); controller.abort();
  await rejectsCode(abortableSleep(60_000, { signal: controller.signal }), 'cancelled');
});
