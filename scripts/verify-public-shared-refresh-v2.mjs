#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree, sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { validateSharedRefreshSignedRelease } from './sign-shared-refresh-release-v2.mjs';

export const CHANNEL = 'https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/';

/** Bounded GET of the ordinary app URL, without redirects or cache busting. */
export async function fetchExactPublicFile(path, expected, fetchImpl) {
  assert.ok(typeof path === 'string' && path.split('/').every(part => /^[A-Za-z0-9._-]+$/.test(part) && !['.', '..'].includes(part)));
  assert.ok(Buffer.isBuffer(expected) && expected.length > 0 && expected.length <= 20 * 1024 * 1024);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let reader;
  try {
    const response = await fetchImpl(`${CHANNEL}${path}`, { redirect: 'error', signal: controller.signal });
    assert.equal(response.status, 200, `HTTP readback: ${path}`);
    assert.ok(response.body, `Missing response body: ${path}`);
    const chunks = []; let count = 0;
    reader = response.body.getReader();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      count += part.value.byteLength;
      assert.ok(count <= expected.length, `Oversized response: ${path}`);
      chunks.push(Buffer.from(part.value));
    }
    const bytes = Buffer.concat(chunks);
    assert.equal(bytes.length, expected.length, `Byte count: ${path}`);
    assert.equal(sha256(bytes), sha256(expected), `Exact public bytes: ${path}`);
    return { bytes, cache: Object.fromEntries(['date', 'age', 'cache-control', 'etag', 'x-cache'].map(name => [name, response.headers.get(name)])) };
  } finally {
    clearTimeout(timer);
    if (reader) await reader.cancel().catch(() => {});
    controller.abort();
  }
}

export async function verifyPublicSharedRefresh({ signedDirectory, receiptPath, fetchImpl = globalThis.fetch } = {}) {
  assert.ok(signedDirectory && receiptPath && typeof fetchImpl === 'function');
  await assertNoSymlinkPath(signedDirectory);
  await assertNoSymlinkPath(receiptPath, { allowMissing: true });
  const startedAt = new Date().toISOString();
  // Exact plan and existing trust anchor are verified locally before network I/O.
  const expectedValidation = await validateSharedRefreshSignedRelease(signedDirectory);
  const expected = await readTree(signedDirectory);
  assert.ok(expected.size <= 512 && [...expected.values()].reduce((n, b) => n + b.length, 0) <= 100 * 1024 * 1024);
  const fetched = new Map(), records = [];
  let cache;
  for (const [path, original] of expected) {
    const result = await fetchExactPublicFile(path, original, fetchImpl);
    fetched.set(path, result.bytes);
    records.push({ path, bytes: result.bytes.length, sha256: sha256(result.bytes) });
    if (path === 'index.json') cache = result.cache;
  }
  const temp = await mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-s11-public-readback-'));
  const directory = resolve(temp, 'received');
  await writeNewTree(directory, fetched);
  const receivedValidation = await validateSharedRefreshSignedRelease(directory);
  assert.equal(receivedValidation.index_sha256, expectedValidation.index_sha256);
  assert.equal(receivedValidation.release_sha256, expectedValidation.release_sha256);
  // Recheck discovery after the complete graph to reject a change mid-readback.
  for (const path of ['index.json', 'index.sig']) await fetchExactPublicFile(path, expected.get(path), fetchImpl);
  const receipt = {
    status: 'PASS', verification_kind: 'ORDINARY_PUBLIC_HTTPS_EXACT_BYTE_READBACK',
    started_at: startedAt, completed_at: new Date().toISOString(), channel: CHANNEL,
    release_set_id: receivedValidation.release_set_id, sequence: receivedValidation.sequence,
    index_sha256: receivedValidation.index_sha256, release_sha256: receivedValidation.release_sha256,
    fetched_files: fetched.size, transferred_bytes: records.reduce((n, f) => n + f.bytes, 0),
    shared_profile_checks: receivedValidation.checks.length, cache, files: records,
    native_activation_confirmed_by_this_receipt: false
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 4 && args[0] === '--signed' && args[2] === '--receipt', 'Usage: --signed <exact-stage> --receipt <new-local-receipt>');
  const receipt = await verifyPublicSharedRefresh({ signedDirectory: resolve(args[1]), receiptPath: resolve(args[3]) });
  console.log(JSON.stringify({ status: receipt.status, release_set_id: receipt.release_set_id, fetched_files: receipt.fetched_files, index_sha256: receipt.index_sha256, receipt: resolve(args[3]) }));
}
