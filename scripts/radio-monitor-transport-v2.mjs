// Opt-in transport only. Importing this module performs no I/O. No CLI or state writer.
import { sourceURL } from './radio-monitor-core-v2.mjs';

export const TRANSPORT_LIMITS = Object.freeze({ totalMs: 20_000, attemptMs: 6_000,
  maxBytes: 5_000_000, maxChunks: 32_768, maxRedirects: 3, maxRetries: 2, maxRetryAfterMs: 10_000 });
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TEMPORARY = new Set([429, 500, 502, 503, 504]);
const ALLOWED_ORIGIN = 'https://www.slovoljubve.com';

export class RadioTransportError extends Error {
  constructor(code, { status = null, retryable = false, retryAfterMs = null } = {}) {
    super(code); this.name = 'RadioTransportError'; this.code = code;
    this.status = status; this.retryable = retryable; this.retryAfterMs = retryAfterMs;
  }
}
const error = (code, options) => new RadioTransportError(code, options);
const cancelled = () => error('cancelled');

export function abortableSleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(cancelled()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
const defaultClock = { now: () => performance.now(), wallNow: () => Date.now() };
const finiteNow = clock => {
  const value = clock.now();
  if (!Number.isFinite(value)) throw error('invalid_clock');
  return value;
};
function safeURL(value, base) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/u.test(value)) throw error('unsafe_redirect');
  let url;
  try { url = new URL(value, base); } catch { throw error('unsafe_redirect'); }
  if (url.protocol !== 'https:' || url.origin !== ALLOWED_ORIGIN || url.username || url.password || url.hash) throw error('unsafe_redirect');
  return url.href;
}
function cancelBody(response) {
  // Do not let a non-cooperative cancel() defeat the operation deadline.
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* best effort */ }
}
function abortReason(signal) {
  return signal.reason instanceof RadioTransportError ? signal.reason : cancelled();
}
function checkSignal(signal) { if (signal.aborted) throw abortReason(signal); }
async function raceAbort(promise, signal, onAbort = () => {}) {
  checkSignal(signal);
  let listener;
  const stopped = new Promise((_, reject) => {
    listener = () => { try { onAbort(); } finally { reject(abortReason(signal)); } };
    signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([promise, stopped]); }
  finally { signal.removeEventListener('abort', listener); }
}
async function bounded(work, milliseconds, signal, sleep, timeoutCode) {
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController(), timerController = new AbortController();
  const relay = () => controller.abort(cancelled());
  signal?.addEventListener('abort', relay, { once: true });
  const timer = Promise.resolve().then(() => sleep(milliseconds, { signal: timerController.signal }))
    .then(() => controller.abort(error(timeoutCode, { retryable: timeoutCode === 'attempt_timeout' })))
    .catch(() => { if (!timerController.signal.aborted) controller.abort(error('timer_failed')); });
  try {
    checkSignal(controller.signal);
    return await raceAbort(Promise.resolve().then(() => work(controller.signal)), controller.signal);
  } finally {
    timerController.abort(); signal?.removeEventListener('abort', relay);
    // Both branches remain observed even when an injected implementation ignores abort.
    void timer;
  }
}

function retryAfter(value, clock) {
  if (value === null) return null;
  let delay;
  if (/^\d+$/u.test(value)) delay = Number(value) * 1000;
  else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(value)) {
    const parsed = Date.parse(value), wall = clock.wallNow();
    if (!Number.isFinite(parsed) || new Date(parsed).toUTCString() !== value || !Number.isFinite(wall)) throw error('invalid_retry_after');
    delay = Math.max(0, parsed - wall);
  } else throw error('invalid_retry_after');
  if (!Number.isSafeInteger(delay) || delay > TRANSPORT_LIMITS.maxRetryAfterMs) throw error('retry_after_exceeds_limit');
  return delay;
}
function validateResponse(response, requestedURL) {
  if (!response || !Number.isInteger(response.status) || typeof response.headers?.get !== 'function'
    || typeof response.url !== 'string' || response.redirected !== false) throw error('invalid_response');
  // A fetch implementation that followed a redirect has bypassed our allowlist.
  if (safeURL(response.url) !== requestedURL) throw error('uncontrolled_redirect');
}
async function readHtml(response, signal, remaining) {
  const type = response.headers.get('content-type');
  if (typeof type !== 'string' || !/^text\/html(?:\s*;|\s*$)/iu.test(type)) throw error('unsupported_content_type');
  if (!/^text\/html(?:\s*;\s*charset\s*=\s*(?:"utf-?8"|utf-?8))?\s*$/iu.test(type)) throw error('unsupported_charset');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || !Number.isSafeInteger(Number(declared)))) throw error('invalid_content_length');
  if (declared !== null && Number(declared) > TRANSPORT_LIMITS.maxBytes) throw error('response_limit');
  if (typeof response.body?.getReader !== 'function') throw error('missing_stream');
  const reader = response.body.getReader(), chunks = []; let bytes = 0, completed = false;
  const cancelReader = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* best effort */ } };
  try {
    while (true) {
      remaining();
      const result = await raceAbort(Promise.resolve().then(() => reader.read()), signal, cancelReader);
      checkSignal(signal);
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw error('invalid_stream_chunk');
      if (chunks.length >= TRANSPORT_LIMITS.maxChunks) throw error('chunk_limit');
      bytes += result.value.byteLength;
      if (bytes > TRANSPORT_LIMITS.maxBytes) throw error('response_limit');
      chunks.push(result.value);
    }
    if (bytes === 0) throw error('empty_body');
    const encoding = response.headers.get('content-encoding');
    // Fetch exposes decoded bytes. Compare lengths only when they describe those same bytes.
    if (declared !== null && (encoding === null || encoding.toLowerCase() === 'identity')
      && bytes !== Number(declared)) throw error('content_length_mismatch');
    let html;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)); }
    catch { throw error('invalid_utf8'); }
    checkSignal(signal); completed = true;
    return { html, bytes, content_type: type };
  } finally {
    if (!completed) cancelReader();
    try { reader.releaseLock(); } catch { /* pending hostile read; already cancelled */ }
  }
}

/** fetchImpl is mandatory: callers must explicitly opt into network or inject a fake. */
export async function fetchRadioHtml(year, { fetchImpl, signal, clock = defaultClock, sleep = abortableSleep } = {}) {
  const initial = safeURL(sourceURL(year));
  if (typeof fetchImpl !== 'function' || typeof clock?.now !== 'function'
    || typeof clock?.wallNow !== 'function' || typeof sleep !== 'function') throw error('invalid_dependencies');
  if (signal?.aborted) throw cancelled();
  const start = finiteNow(clock), deadline = start + TRANSPORT_LIMITS.totalMs;
  let lastNow = start, redirects = 0;
  const remaining = () => {
    const now = finiteNow(clock);
    if (now < lastNow) throw error('clock_regressed');
    lastNow = now;
    if (now >= deadline) throw error('deadline_exceeded');
    return deadline - now;
  };
  for (let attempt = 0; attempt <= TRANSPORT_LIMITS.maxRetries; attempt++) {
    const budget = Math.min(TRANSPORT_LIMITS.attemptMs, remaining());
    const timeoutCode = budget < TRANSPORT_LIMITS.attemptMs ? 'deadline_exceeded' : 'attempt_timeout';
    try {
      const value = await bounded(async attemptSignal => {
        let url = initial; const visited = new Set([url]);
        for (let hop = 0; ; hop++) {
          checkSignal(attemptSignal); remaining();
          let response;
          try {
            const pending = Promise.resolve().then(() => fetchImpl(url, { method: 'GET', redirect: 'manual',
              credentials: 'omit', cache: 'no-store', headers: { accept: 'text/html' }, signal: attemptSignal }))
              .then(value => { if (attemptSignal.aborted) { cancelBody(value); throw abortReason(attemptSignal); } return value; });
            response = await raceAbort(pending, attemptSignal);
          } catch (cause) {
            if (attemptSignal.aborted) throw abortReason(attemptSignal);
            if (cause instanceof RadioTransportError) throw cause;
            throw error('fetch_failed'); // Unknown network failures are not successful or automatically retryable.
          }
          try {
            validateResponse(response, url); checkSignal(attemptSignal); remaining();
            if (REDIRECTS.has(response.status)) {
              if (hop >= TRANSPORT_LIMITS.maxRedirects) throw error('redirect_limit');
              const target = safeURL(response.headers.get('location'), url);
              if (visited.has(target)) throw error('redirect_loop');
              visited.add(target); redirects++; cancelBody(response); url = target; continue;
            }
            if (TEMPORARY.has(response.status)) throw error('temporary_http_status', { status: response.status,
              retryable: true, retryAfterMs: retryAfter(response.headers.get('retry-after'), clock) });
            if (response.status !== 200) throw error('http_status', { status: response.status });
            const body = await readHtml(response, attemptSignal, remaining);
            return { ...body, final_url: url };
          } finally { cancelBody(response); }
        }
      }, budget, signal, sleep, timeoutCode);
      if (signal?.aborted) throw cancelled();
      remaining(); // A late/non-cooperative fetch may never report success after the deadline.
      return { transport_status: 'received_unvalidated_html', year, source_url: initial,
        ...value, http_status: 200, attempts: attempt + 1, redirects };
    } catch (cause) {
      if (signal?.aborted) throw cancelled();
      const failure = cause instanceof RadioTransportError ? cause : error('transport_failed');
      if (!failure.retryable || attempt === TRANSPORT_LIMITS.maxRetries) throw failure;
      const delay = Math.max(250 * (2 ** attempt), failure.retryAfterMs ?? 0);
      const available = remaining();
      if (delay >= available) throw error('retry_budget_exhausted');
      await bounded(waitSignal => sleep(delay, { signal: waitSignal }), available, signal, sleep, 'deadline_exceeded');
      remaining();
    }
  }
  throw error('transport_failed');
}
