// LOCAL DRAFT. No CLI, implicit network, scheduler, notifications or publishing.
import { constants as F } from 'node:fs';
import { open, lstat, mkdir, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGospelIndex, parseRadioHtml, reviewObservation, sourceURL, supportedYear } from './radio-monitor-core-v2.mjs';
import { fetchRadioHtml, RadioTransportError } from './radio-monitor-transport-v2.mjs';

export const STATE_LIMITS = Object.freeze({ snapshotBytes: 16 * 1024 * 1024,
  pointerBytes: 4096, generations: 512, fingerprintsPerYear: 4096 });
const CONTENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POINTER = 'CURRENT.json', LOCK = '.writer.lock';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const GENERATION = /^generation-[a-f0-9-]{36}\.json$/u;
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);
const ensure = (condition, code = 'corrupt_state') => { if (!condition) throw new RadioStateError(code); };

export class RadioStateError extends Error {
  constructor(code) { super(code); this.name = 'RadioStateError'; this.code = code; }
}
function exact(value, keys) {
  ensure(object(value));
  ensure(Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'));
}
function timestamp(value, nullable = false) {
  if (nullable && value === null) return;
  ensure(typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value);
}
function nowISO(clock) {
  const time = clock.wallNow(); ensure(Number.isFinite(time), 'invalid_clock');
  return new Date(time).toISOString();
}
function cancelled(signal) { ensure(!signal?.aborted, 'cancelled'); }
function corpusIdentity(corpus) { buildGospelIndex(corpus); return digest(jsonBytes(corpus)); }
function validateRows(rows, year, good = false) {
  ensure(Array.isArray(rows) && rows.length <= 366);
  let previous = '';
  for (const row of rows) {
    exact(row, ['date', 'references', 'notes', 'supplemental_blessing', 'validation_errors']);
    ensure(typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(row.date)
      && row.date.startsWith(`${year}-`) && Number.isFinite(Date.parse(`${row.date}T00:00:00Z`))
      && new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) === row.date && row.date > previous);
    previous = row.date;
    for (const values of [row.references, row.notes]) ensure(Array.isArray(values) && values.length <= 128
      && values.every(value => typeof value === 'string' && value.length <= 4000));
    ensure(typeof row.supplemental_blessing === 'boolean');
    ensure(Array.isArray(row.validation_errors) && row.validation_errors.length <= 1024);
    if (good) ensure(row.validation_errors.length === 0);
    for (const error of row.validation_errors) {
      ensure(object(error) && Object.keys(error).every(k => ['reference', 'code', 'segment', 'chapter', 'verse'].includes(k)));
      ensure(Number.isInteger(error.reference) && error.reference >= 0 && error.reference < row.references.length);
      ensure(['unparsed_reference', 'unparsed_range', 'invalid_or_reversed_range', 'invalid_verse_endpoint',
        'missing_chapter', 'missing_interior_verse'].includes(error.code));
      for (const key of ['segment', 'chapter', 'verse']) if (has(error, key)) ensure(Number.isInteger(error[key]) && error[key] >= 0);
    }
  }
}
function validateCandidate(candidate, year) {
  if (candidate === null) return;
  exact(candidate, ['schema_version', 'year', 'source_url', 'checked_at', 'fingerprint', 'diff',
    'validation_failed', 'release_allowed', 'production_ready']);
  ensure(candidate.schema_version === 'radio-calendar-review-candidate-2' && candidate.year === year
    && candidate.source_url === sourceURL(year) && candidate.release_allowed === false && candidate.production_ready === false
    && typeof candidate.validation_failed === 'boolean' && SHA.test(candidate.fingerprint));
  timestamp(candidate.checked_at); exact(candidate.diff, ['added', 'changed', 'removed']);
  validateRows(candidate.diff.added, year); validateRows(candidate.diff.removed, year);
  ensure(Array.isArray(candidate.diff.changed) && candidate.diff.changed.length <= 366);
  let previous = '';
  for (const change of candidate.diff.changed) {
    exact(change, ['date', 'before', 'after']);
    validateRows([change.before], year); validateRows([change.after], year);
    ensure(change.date === change.before.date && change.date === change.after.date && change.date > previous);
    previous = change.date;
  }
  ensure(digest(Buffer.from(JSON.stringify({ year, diff: candidate.diff }))) === candidate.fingerprint);
}
function validateSnapshot(snapshot) {
  exact(snapshot, ['schema_version', 'store_id', 'revision', 'corpus_fingerprint', 'updated_at', 'years', 'run_report']);
  ensure(snapshot.schema_version === 'svetlost33-radio-monitor-state-2' && UUID.test(snapshot.store_id)
    && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 && SHA.test(snapshot.corpus_fingerprint));
  timestamp(snapshot.updated_at, true); ensure(object(snapshot.years));
  for (const [yearKey, state] of Object.entries(snapshot.years)) {
    ensure(/^\d{4}$/u.test(yearKey)); const year = supportedYear(Number(yearKey));
    exact(state, ['core', 'last_observation', 'last_attempt', 'review_candidate']);
    exact(state.core, ['year', 'rows', 'last_success_at', 'last_observed_at', 'seen_fingerprints']);
    ensure(state.core.year === year); validateRows(state.core.rows, year, true);
    timestamp(state.core.last_success_at, true); timestamp(state.core.last_observed_at, true);
    ensure((state.core.rows.length === 0) === (state.core.last_success_at === null));
    ensure(Array.isArray(state.core.seen_fingerprints) && state.core.seen_fingerprints.length <= STATE_LIMITS.fingerprintsPerYear
      && new Set(state.core.seen_fingerprints).size === state.core.seen_fingerprints.length
      && state.core.seen_fingerprints.every(x => typeof x === 'string' && SHA.test(x)));
    if (state.last_observation !== null) {
      exact(state.last_observation, ['checked_at', 'rows', 'validation_failed', 'source_url']);
      timestamp(state.last_observation.checked_at); validateRows(state.last_observation.rows, year);
      ensure(state.last_observation.rows.length > 0 && state.last_observation.source_url === sourceURL(year)
        && state.last_observation.checked_at === state.core.last_observed_at
        && state.last_observation.validation_failed === state.last_observation.rows.some(x => x.validation_errors.length > 0));
    } else ensure(state.core.last_observed_at === null);
    if (state.last_attempt !== null) {
      exact(state.last_attempt, ['status', 'checked_at', 'error_code']); timestamp(state.last_attempt.checked_at);
      ensure(['valid_observation', 'invalid_references', 'transport_failed', 'parse_failed'].includes(state.last_attempt.status));
      ensure(state.last_attempt.error_code === null || /^[a-z][a-z0-9_]{0,79}$/u.test(state.last_attempt.error_code));
    }
    validateCandidate(state.review_candidate, year);
  }
  if (snapshot.run_report !== null) {
    const report = snapshot.run_report;
    exact(report, ['started_at', 'finished_at', 'outcome', 'results', 'publication_authorized']);
    timestamp(report.started_at); timestamp(report.finished_at);
    ensure(Date.parse(report.finished_at) >= Date.parse(report.started_at)
      && report.finished_at === snapshot.updated_at && report.publication_authorized === false);
    ensure(['observations_recorded', 'partial_failure', 'all_failed'].includes(report.outcome));
    ensure(Array.isArray(report.results) && report.results.length >= 1 && report.results.length <= 2);
    ensure(new Set(report.results.map(x => x.year)).size === report.results.length);
    for (const result of report.results) {
      exact(result, ['year', 'status', 'error_code', 'new_review_needed', 'observed_rows', 'last_good_rows', 'candidate_fingerprint']);
      const state = snapshot.years[String(result.year)]; ensure(state && result.status === state.last_attempt.status
        && result.error_code === state.last_attempt.error_code && typeof result.new_review_needed === 'boolean'
        && result.last_good_rows === state.core.rows.length
        && result.observed_rows === (state.last_observation?.rows.length ?? 0)
        && (result.candidate_fingerprint === null || SHA.test(result.candidate_fingerprint)));
    }
  } else ensure(snapshot.revision === 0 && Object.keys(snapshot.years).length === 0 && snapshot.updated_at === null);
  return snapshot;
}
function validatePointer(pointer) {
  exact(pointer, ['schema_version', 'store_id', 'revision', 'file', 'bytes', 'sha256']);
  ensure(pointer.schema_version === 'svetlost33-radio-monitor-pointer-2' && UUID.test(pointer.store_id)
    && Number.isSafeInteger(pointer.revision) && pointer.revision >= 0 && GENERATION.test(pointer.file)
    && UUID.test(pointer.file.slice(11, -5)) && Number.isSafeInteger(pointer.bytes)
    && pointer.bytes > 0 && pointer.bytes <= STATE_LIMITS.snapshotBytes && SHA.test(pointer.sha256), 'corrupt_pointer');
  return pointer;
}
async function exists(path) {
  try { return await lstat(path); } catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
}
async function privateDirectory(directory, create = false) {
  ensure(typeof process.getuid === 'function', 'posix_private_store_required');
  ensure(typeof directory === 'string' && isAbsolute(directory) && directory === resolve(directory)
    && directory !== parsePath(directory).root, 'explicit_private_directory_required');
  const parent = await realpath(dirname(directory));
  const target = join(parent, parsePath(directory).base);
  // No private facts in this public repo or any other checkout (including linked worktrees).
  for (let path = target; ; path = dirname(path)) {
    ensure(path !== await realpath(CONTENT_ROOT), 'public_tree_forbidden');
    ensure(!(await exists(join(path, '.git'))), 'public_tree_forbidden');
    if (path === dirname(path)) break;
  }
  let stat = await exists(target);
  if (!stat && create) { await mkdir(target, { mode: 0o700 }); stat = await lstat(target); }
  ensure(stat?.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0, stat ? 'private_directory_required' : 'state_missing');
  return target;
}
async function readPrivate(path, maximum) {
  let handle;
  try {
    handle = await open(path, F.O_RDONLY | F.O_NOFOLLOW);
    const stat = await handle.stat();
    ensure(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o077) === 0
      && stat.size > 0 && stat.size <= maximum, 'unsafe_state_file');
    const chunks = []; let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65_536, maximum + 1 - size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead; ensure(size <= maximum, 'state_limit'); chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, size);
  } finally { await handle?.close(); }
}
function parseJSON(bytes, code) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch { throw new RadioStateError(code); }
}
async function load(directory) {
  let pointerBytes;
  try { pointerBytes = await readPrivate(join(directory, POINTER), STATE_LIMITS.pointerBytes); }
  catch (cause) { if (cause.code === 'ENOENT') throw new RadioStateError('state_missing'); throw cause; }
  const pointer = validatePointer(parseJSON(pointerBytes, 'corrupt_pointer'));
  let bytes;
  try { bytes = await readPrivate(join(directory, pointer.file), STATE_LIMITS.snapshotBytes); }
  catch (cause) { if (cause.code === 'ENOENT') throw new RadioStateError('generation_missing'); throw cause; }
  ensure(bytes.length === pointer.bytes && digest(bytes) === pointer.sha256, 'generation_integrity_failed');
  const snapshot = validateSnapshot(parseJSON(bytes, 'corrupt_state'));
  ensure(snapshot.store_id === pointer.store_id && snapshot.revision === pointer.revision, 'pointer_binding_failed');
  return { pointer, snapshot };
}
async function writeNew(path, bytes) {
  const handle = await open(path, F.O_CREAT | F.O_EXCL | F.O_WRONLY | F.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function directorySync(directory) {
  const handle = await open(directory, F.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function lock(directory) {
  const path = join(directory, LOCK); let handle;
  try { handle = await open(path, F.O_CREAT | F.O_EXCL | F.O_WRONLY | F.O_NOFOLLOW, 0o600); }
  catch (cause) { if (cause.code === 'EEXIST') throw new RadioStateError('store_busy'); throw cause; }
  const identity = await handle.stat();
  try { await handle.writeFile(jsonBytes({ token: randomUUID(), pid: process.pid })); await handle.sync(); }
  finally { await handle.close(); }
  return async () => {
    const current = await lstat(path);
    ensure(current.ino === identity.ino && current.dev === identity.dev && !current.isSymbolicLink(), 'lock_changed');
    await unlink(path);
  };
}
async function commit(directory, expected, snapshot, checkpoint = async () => {}) {
  validateSnapshot(snapshot);
  const bytes = jsonBytes(snapshot); ensure(bytes.length <= STATE_LIMITS.snapshotBytes, 'state_limit');
  const files = await readdir(directory);
  ensure(files.filter(file => GENERATION.test(file)).length < STATE_LIMITS.generations, 'retention_limit_requires_review');
  const filename = `generation-${randomUUID()}.json`, generationPath = join(directory, filename);
  const temporary = join(directory, `.pointer-${randomUUID()}.tmp`);
  const pointer = { schema_version: 'svetlost33-radio-monitor-pointer-2', store_id: snapshot.store_id,
    revision: snapshot.revision, file: filename, bytes: bytes.length, sha256: digest(bytes) };
  let generationWritten = false, tempWritten = false, renamed = false;
  try {
    await checkpoint('before_snapshot');
    await writeNew(generationPath, bytes); generationWritten = true;
    await checkpoint('after_snapshot_sync');
    // Compare again under the cooperative exclusive lock; never overwrite an unexpected pointer.
    if (expected) ensure(JSON.stringify((await load(directory)).pointer) === JSON.stringify(expected), 'state_conflict');
    else ensure(!(await exists(join(directory, POINTER))), 'state_conflict');
    await writeNew(temporary, jsonBytes(pointer)); tempWritten = true;
    await checkpoint('before_pointer_rename');
    await rename(temporary, join(directory, POINTER)); renamed = true; tempWritten = false;
    await checkpoint('after_pointer_rename');
    await directorySync(directory);
    return pointer;
  } catch (cause) {
    if (renamed) throw new RadioStateError('commit_outcome_uncertain');
    if (cause instanceof RadioStateError) throw cause;
    throw new RadioStateError('storage_commit_failed');
  } finally {
    // Only our own, uncommitted random artifacts are removed. Existing generations are retained.
    if (tempWritten) await unlink(temporary);
    if (generationWritten && !renamed) await unlink(generationPath);
  }
}

/** Explicit initialization only; a missing/corrupt previously used store is never reset. */
export async function initializeRadioState({ directory, corpus, checkpoint } = {}) {
  const fingerprint = corpusIdentity(corpus), location = await privateDirectory(directory, true);
  const release = await lock(location);
  try {
    ensure((await readdir(location)).every(name => name === LOCK), 'state_not_empty');
    const snapshot = { schema_version: 'svetlost33-radio-monitor-state-2', store_id: randomUUID(), revision: 0,
      corpus_fingerprint: fingerprint, updated_at: null, years: {}, run_report: null };
    const pointer = await commit(location, null, snapshot, checkpoint);
    return { status: 'initialized_local_private_draft', revision: pointer.revision };
  } finally { await release(); }
}
/** Explicit private read. No fallback to old generations, empty state or repository snapshots. */
export async function readRadioState({ directory } = {}) {
  return clone((await load(await privateDirectory(directory))).snapshot);
}
const defaultClock = { now: () => performance.now(), wallNow: () => Date.now() };
function emptyYear(year) {
  return { core: { year, rows: [], last_success_at: null, last_observed_at: null, seen_fingerprints: [] },
    last_observation: null, last_attempt: null, review_candidate: null };
}
const parseErrors = new Set(['response_limit', 'year_header_mismatch', 'html_shape_changed', 'invalid_date_row_id',
  'invalid_civil_date', 'duplicate_date', 'no_usable_rows']);

/** One explicit local run. fetchImpl required; data never goes to stdout or a notification service. */
export async function runRadioReview({ directory, currentYear, years, corpus, fetchImpl, signal,
  clock = defaultClock, sleep, checkpoint } = {}) {
  supportedYear(currentYear);
  ensure(Array.isArray(years) && years.length >= 1 && years.length <= 2 && new Set(years).size === years.length
    && years.every(year => Number.isInteger(year) && (year === currentYear || year === currentYear + 1)), 'explicit_years_required');
  years.forEach(supportedYear);
  ensure(typeof fetchImpl === 'function', 'explicit_fetch_required'); cancelled(signal);
  const fingerprint = corpusIdentity(corpus), index = buildGospelIndex(corpus);
  const location = await privateDirectory(directory), release = await lock(location);
  try {
    const { pointer, snapshot } = await load(location);
    ensure(snapshot.corpus_fingerprint === fingerprint, 'corpus_change_requires_review');
    ensure(snapshot.revision < Number.MAX_SAFE_INTEGER, 'revision_limit');
    const startedAt = nowISO(clock), next = clone(snapshot), results = [];
    ensure(snapshot.updated_at === null || Date.parse(startedAt) >= Date.parse(snapshot.updated_at), 'clock_regressed');
    for (const year of years) {
      cancelled(signal);
      const state = next.years[String(year)] ?? emptyYear(year);
      let phase = 'transport', status, errorCode = null, newReviewNeeded = false, candidateFingerprint = null;
      try {
        const transport = await fetchRadioHtml(year, { fetchImpl, signal, clock, sleep });
        cancelled(signal); phase = 'parse';
        const rows = parseRadioHtml(transport.html, year, index); validateRows(rows, year);
        const checkedAt = nowISO(clock);
        const result = reviewObservation(state.core, rows, { year, checkedAt });
        ensure(result.state.seen_fingerprints.length <= STATE_LIMITS.fingerprintsPerYear, 'dedup_limit_requires_review');
        state.core = result.state;
        state.last_observation = { checked_at: checkedAt, rows, validation_failed: result.validation_failed, source_url: sourceURL(year) };
        if (result.candidate) state.review_candidate = result.candidate;
        status = result.validation_failed ? 'invalid_references' : 'valid_observation';
        newReviewNeeded = result.notification_needed;
        candidateFingerprint = result.candidate?.fingerprint ?? null;
      } catch (cause) {
        cancelled(signal);
        if (cause instanceof RadioStateError && cause.code === 'dedup_limit_requires_review') throw cause;
        status = phase === 'transport' ? 'transport_failed' : 'parse_failed';
        errorCode = cause instanceof RadioTransportError ? cause.code
          : parseErrors.has(cause.message) ? cause.message : phase === 'parse' ? 'invalid_observation' : 'transport_failed';
      }
      state.last_attempt = { status, checked_at: nowISO(clock), error_code: errorCode };
      next.years[String(year)] = state;
      results.push({ year, status, error_code: errorCode, new_review_needed: newReviewNeeded,
        observed_rows: state.last_observation?.rows.length ?? 0, last_good_rows: state.core.rows.length,
        candidate_fingerprint: candidateFingerprint });
    }
    const failed = results.filter(x => x.status !== 'valid_observation').length;
    const finishedAt = nowISO(clock);
    ensure(Date.parse(finishedAt) >= Date.parse(startedAt), 'clock_regressed');
    next.revision++; next.updated_at = finishedAt;
    next.run_report = { started_at: startedAt, finished_at: finishedAt,
      outcome: failed === 0 ? 'observations_recorded' : failed === results.length ? 'all_failed' : 'partial_failure',
      results, publication_authorized: false };
    cancelled(signal);
    await commit(location, pointer, next, checkpoint);
    // Summary only. Review facts remain in the explicit owner-only private store.
    return { status: 'local_private_draft_committed', revision: next.revision, ...clone(next.run_report) };
  } finally { await release(); }
}
