#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, writeNewTree } from './prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from './prepare-saints-completion-release-v2.mjs';
import { captureRefreshTree } from './sign-shared-refresh-release-v2.mjs';
import { validateCalendarSaintsWindowSigned } from './sign-calendar-saints-window-v2.mjs';
import { CHANNEL, fetchExactPublicFile } from './verify-public-shared-refresh-v2.mjs';

/** Ordinary public app URLs only. Exact S12 verification before/after the bounded reads. */
export async function verifyPublicCalendarSaintsWindow({ signedDirectory, receiptPath, fetchImpl = globalThis.fetch } = {}) {
  assert.ok(signedDirectory && receiptPath && typeof fetchImpl === 'function');
  await assertNoSymlinkPath(signedDirectory);
  await assertNoSymlinkPath(receiptPath, { allowMissing: true });
  const startedAt = new Date().toISOString();
  // No network access before validating the approved graph and existing production signatures.
  const expectedValidation = await validateCalendarSaintsWindowSigned(signedDirectory);
  const expected = await captureRefreshTree(signedDirectory);
  assert.ok(expected.size <= 512 && [...expected.values()].reduce((n, bytes) => n + bytes.length, 0) <= 100 * 1024 * 1024);
  const fetched = new Map(), records = [];
  let cache;
  for (const [path, original] of expected) {
    const result = await fetchExactPublicFile(path, original, fetchImpl);
    fetched.set(path, result.bytes);
    records.push({ path, bytes: result.bytes.length, sha256: sha256(result.bytes) });
    if (path === 'index.json') cache = result.cache;
  }
  const temp = await mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-s12-public-readback-'));
  const directory = resolve(temp, 'received');
  await writeNewTree(directory, fetched);
  const receivedValidation = await validateCalendarSaintsWindowSigned(directory);
  assert.equal(receivedValidation.index_sha256, expectedValidation.index_sha256);
  assert.equal(receivedValidation.release_sha256, expectedValidation.release_sha256);
  assert.equal(receivedValidation.catalog_sha256, expectedValidation.catalog_sha256);
  assert.equal(receivedValidation.browser_sha256, expectedValidation.browser_sha256);
  // A graph read across a changed discovery pair must not produce a successful receipt.
  for (const path of ['index.json', 'index.sig']) await fetchExactPublicFile(path, expected.get(path), fetchImpl);
  const receipt = {
    status: 'PASS', verification_kind: 'ORDINARY_PUBLIC_HTTPS_EXACT_BYTE_READBACK',
    started_at: startedAt, completed_at: new Date().toISOString(), channel: CHANNEL,
    release_set_id: receivedValidation.release_set_id, sequence: receivedValidation.sequence,
    index_sha256: receivedValidation.index_sha256, release_sha256: receivedValidation.release_sha256,
    catalog_sha256: receivedValidation.catalog_sha256, browser_sha256: receivedValidation.browser_sha256,
    fetched_files: fetched.size, transferred_bytes: records.reduce((n, file) => n + file.bytes, 0),
    shared_profile_checks: receivedValidation.checks.length, discovery_pair_rechecked: true,
    cache, files: records, native_activation_confirmed_by_this_receipt: false,
  };
  await assertNoSymlinkPath(receiptPath, { allowMissing: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 4 && args[0] === '--signed' && args[2] === '--receipt', 'Usage: --signed <exact-S12-stage> --receipt <new-local-receipt>');
  const receipt = await verifyPublicCalendarSaintsWindow({ signedDirectory: resolve(args[1]), receiptPath: resolve(args[3]) });
  console.log(JSON.stringify({ status: receipt.status, release_set_id: receipt.release_set_id,
    fetched_files: receipt.fetched_files, index_sha256: receipt.index_sha256, receipt: resolve(args[3]) }));
}
