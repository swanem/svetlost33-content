#!/usr/bin/env node
// Public GET/readback only. No signing, activation, git or production writes.
import assert from 'node:assert/strict';
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, PUBLIC_KEY_SHA256, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from '../../scripts/prepare-saints-completion-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { CHANNEL, fetchExactPublicFile } from '../../scripts/verify-public-shared-refresh-v2.mjs';
import { validateSigned } from './sign.mjs';

const within = (root, path) => { const r = relative(resolve(root), resolve(path)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
const absent = error => { if (error.code === 'ENOENT') return null; throw error; };

/** Exactly 63 signed graph files, using ordinary app HTTPS URLs without cache busting. */
export async function publicReadback({ signedDirectory, out } = {}) {
  assert.ok(typeof signedDirectory === 'string' && signedDirectory && typeof out === 'string' && out, 'Explicit signed stage and new receipt path required');
  const source = resolve(signedDirectory), receiptPath = resolve(out);
  assert.equal(within(source, receiptPath), false, 'Evidence must remain outside signed stage');
  assert.equal(within(resolve(ROOT, 'releases'), receiptPath), false, 'Evidence must remain outside production/releases');
  await assertNoSymlinkPath(source);
  await assertNoSymlinkPath(receiptPath, { allowMissing: true });
  assert.equal(await lstat(receiptPath).catch(absent), null, 'Receipt must be a new path; never overwrite');
  const startedAt = new Date().toISOString();
  // Validate the complete local approved graph under real production RSA before any GET.
  const expectedValidation = await validateSigned(source);
  assert.equal(expectedValidation.sequence, 13); assert.equal(expectedValidation.checks.length, 24);
  const expected = await captureRefreshTree(source);
  assert.equal(expected.size, 63, 'Exact signed S13 graph; no test/private sidecars');
  assert.ok([...expected.values()].reduce((n, bytes) => n + bytes.length, 0) <= 100 * 1024 * 1024, 'Bounded graph');
  assert.equal(sha256(expected.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256);

  const fetched = new Map(), records = [], beforeCache = {}, afterCache = {};
  const discovery = ['index.json', 'index.sig'];
  // The discovery pair is explicitly fetched FIRST, not merely in tree iteration order.
  const paths = [...discovery, ...[...expected.keys()].filter(path => !discovery.includes(path)).sort()];
  for (const path of paths) {
    const result = await fetchExactPublicFile(path, expected.get(path), globalThis.fetch);
    fetched.set(path, result.bytes);
    records.push({ path, bytes: result.bytes.length, sha256: sha256(result.bytes) });
    if (discovery.includes(path)) beforeCache[path] = result.cache;
  }
  assert.equal(fetched.size, 63);
  const temp = await mkdtemp(resolve(await realpath(tmpdir()), 'svetlost33-s13-public-readback-'));
  try {
    const received = resolve(temp, 'received');
    await writeNewTree(received, fetched);
    // Authenticate the DOWNLOADED copy, including inherited S12 and all 24 S13 profiles.
    const receivedValidation = await validateSigned(received);
    assert.deepEqual(receivedValidation, expectedValidation, 'Exact downloaded authenticated graph/profile results');
    for (const path of discovery) {
      const result = await fetchExactPublicFile(path, expected.get(path), globalThis.fetch);
      afterCache[path] = result.cache;
    }
    // Reject local stage changes during the network read as well.
    assert.deepEqual(await captureRefreshTree(source), expected, 'Local signed stage changed during readback');
    const graphBytes = records.reduce((n, item) => n + item.bytes, 0);
    const receipt = {
      status: 'PASS', verification_kind: 'ORDINARY_PUBLIC_HTTPS_EXACT_BYTE_READBACK',
      started_at: startedAt, completed_at: new Date().toISOString(), channel: CHANNEL,
      release_set_id: receivedValidation.release_set_id, sequence: receivedValidation.sequence,
      index_sha256: receivedValidation.index_sha256, release_sha256: receivedValidation.release_sha256,
      trusted_public_key_sha256: PUBLIC_KEY_SHA256,
      fetched_files: fetched.size, graph_bytes: graphBytes, http_gets: 65,
      transferred_bytes: graphBytes + discovery.reduce((n, path) => n + expected.get(path).length, 0),
      shared_profile_checks: receivedValidation.checks.length, checks: receivedValidation.checks,
      discovery_pair_checked_before_and_after: true, cache: { before: beforeCache, after: afterCache },
      files: records.sort((a, b) => a.path.localeCompare(b.path, 'en')),
      native_activation_confirmed_by_this_receipt: false, production_mutated_by_this_tool: false,
    };
    await assertNoSymlinkPath(receiptPath, { allowMissing: true });
    await writeFile(receiptPath, json(receipt), { flag: 'wx' });
    return receipt;
  } finally {
    // Only this process's uniquely created temporary download copy is removed.
    await rm(temp, { recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 4 && args[0] === '--signed' && args[1] && args[2] === '--out' && args[3],
    'Usage: --signed <exact-signed-s13-root> --out <new-receipt-path-outside-signed-stage>');
  const receipt = await publicReadback({ signedDirectory: args[1], out: args[3] });
  console.log(JSON.stringify({ status: receipt.status, release_set_id: receipt.release_set_id,
    fetched_files: receipt.fetched_files, shared_profile_checks: receipt.shared_profile_checks,
    index_sha256: receipt.index_sha256, receipt: resolve(args[3]) }));
}
