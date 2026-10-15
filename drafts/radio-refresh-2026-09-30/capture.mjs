// Opt-in, bounded GET -> parsed facts on stdout. No file writes, scheduler or publishing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildGospelIndex, parseRadioHtml, sourceURL } from '../../scripts/radio-monitor-core-v2.mjs';

export const CAPTURE_LIMITS = Object.freeze({ milliseconds: 15_000, bytes: 5_000_000, chunks: 32_768 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureRadio({ corpus, fetchImpl, timeoutMs = CAPTURE_LIMITS.milliseconds } = {}) {
  assert.equal(typeof fetchImpl, 'function', 'network must be explicitly injected');
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= CAPTURE_LIMITS.milliseconds);
  const index = buildGospelIndex(corpus), url = sourceURL(2026);
  const controller = new AbortController();
  const requestedAt = new Date().toISOString(), started = performance.now();
  let reader, response, timer;
  const cancelBody = () => {
    try { Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {}); } catch { /* best effort */ }
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); cancelBody(); reject(new Error('capture_deadline')); }, timeoutMs);
  });
  const work = (async () => {
    response = await fetchImpl(url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      headers: { accept: 'text/html' }, signal: controller.signal });
    if (controller.signal.aborted) { cancelBody(); throw new Error('capture_deadline'); }
    assert.equal(response.status, 200, 'only HTTP 200 is an observation');
    assert.equal(response.url, url, 'redirects are not followed'); assert.equal(response.redirected, false);
    const type = response.headers.get('content-type');
    assert.match(type ?? '', /^text\/html(?:\s*;|\s*$)/iu);
    const charsets = [...type.matchAll(/;\s*charset\s*=\s*"?([^;"\s]+)"?/giu)];
    assert.ok(charsets.length <= 1 && (!charsets.length || /^utf-?8$/iu.test(charsets[0][1])));
    const declared = response.headers.get('content-length');
    if (declared !== null) assert.ok(/^\d+$/u.test(declared) && Number(declared) <= CAPTURE_LIMITS.bytes);
    reader = response.body.getReader(); const chunks = []; let total = 0;
    while (true) {
      assert.ok(!controller.signal.aborted && performance.now() - started < timeoutMs, 'capture_deadline');
      const item = await reader.read(); if (item.done) break;
      assert.ok(item.value instanceof Uint8Array);
      total += item.value.byteLength;
      assert.ok(total <= CAPTURE_LIMITS.bytes && chunks.length < CAPTURE_LIMITS.chunks, 'response_limit');
      chunks.push(item.value);
    }
    assert.ok(total > 0);
    const bytes = Buffer.concat(chunks, total);
    const html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    assert.deepEqual(Buffer.from(html, 'utf8'), bytes, 'hash must identify actual response bytes');
    const rows = parseRadioHtml(html, 2026, index);
    assert.ok(!controller.signal.aborted && performance.now() - started < timeoutMs, 'capture_deadline');
    return { schema_version: 'svetlost33-radio-source-observation-1', year: 2026,
      status: 'radio_only_not_liturgical_assignment', owner_approval: null, publication_authorized: false,
      source: { requested_url: url, effective_url: response.url, requested_at: requestedAt,
        checked_at: new Date().toISOString(), http_status: response.status, content_type: type,
        response_bytes: total, response_sha256: hash(bytes),
        extraction: 'radio-monitor-core-v2 parsed facts; full HTML not retained',
        response_body_retained: false, response_hash_is_not_a_signature: true },
      rows_sha256: hash(Buffer.from(`${JSON.stringify(rows)}\n`)), rows };
  })();
  try { return await Promise.race([work, timeout]); }
  finally { clearTimeout(timer); controller.abort(); cancelBody(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--fetch'], 'explicit --fetch required; output only on stdout');
  const { loadPinned } = await import('./inspect.mjs');
  const { corpus } = await loadPinned();
  console.log(JSON.stringify(await captureRadio({ corpus, fetchImpl: globalThis.fetch }), null, 2));
}
