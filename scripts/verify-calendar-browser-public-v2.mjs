#!/usr/bin/env node
// Read-only ordinary-channel readback. No cache busting, private key, writes or activation.
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_KEY_SHA256, readTree, sha256 } from './prepare-charity-release-v2.mjs';
import { createCalendarBrowserReleasePlan, CALENDAR_BROWSER_RELEASE_ID, CALENDAR_BROWSER_SEQUENCE } from './prepare-calendar-browser-release-v2.mjs';
import { validateCalendarBrowserSignedRelease, assertCalendarMutationDeadline } from './sign-calendar-browser-release-v2.mjs';

export const CALENDAR_PUBLIC_CHANNEL = 'https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/';

export async function verifyCalendarBrowserPublic({ directory, catalogPath, browserPath, evidencePath } = {}) {
  // Production retains unrelated historical immutable files. The strict exact-
  // inventory validator belongs to the explicit isolated signed stage, not BASE.
  assert.ok(typeof directory === 'string' && directory.length, 'Explicit isolated signed stage required');
  const startedAt = new Date().toISOString();
  const options = { sourceDirectory: directory, catalogPath, browserPath, evidencePath, now: startedAt };
  const plan = await createCalendarBrowserReleasePlan(options);
  const report = await validateCalendarBrowserSignedRelease(directory, options);
  const local = await readTree(directory);
  const expectedIndex = sha256(plan.files.get('index.json'));
  assert.equal(report.index_sha256, expectedIndex);
  assert.equal(sha256(local.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256);
  const key = createPublicKey(local.get('trusted-public-key.pem'));
  let fetched = 0, transferred = 0, cache = null;
  const fileEvidence = [];

  async function exactPublic(path) {
    assert.ok(path && !path.startsWith('/') && !path.includes('\\')
      && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Safe relative public path');
    const expected = local.get(path);
    assert.ok(expected, `Reviewed file required: ${path}`);
    const response = await fetch(new URL(path, CALENDAR_PUBLIC_CHANNEL), {
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `Public HTTP status: ${path}`);
    assert.ok(response.body, `Public response body: ${path}`);
    if (path === 'index.json') cache = Object.fromEntries(
      ['date', 'age', 'cache-control', 'etag', 'x-cache'].map(name => [name, response.headers.get(name)]));
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      assert.ok(length <= expected.length, `Public file too large: ${path}`);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    assert.ok(bytes.equals(expected), `Public bytes differ: ${path}`);
    fetched++; transferred += length;
    fileEvidence.push({ path, bytes: length, sha256: sha256(bytes) });
    return bytes;
  }

  async function signed(path, signaturePath) {
    const [bytes, sig] = await Promise.all([exactPublic(path), exactPublic(signaturePath)]);
    const encoded = sig.toString('ascii');
    assert.match(encoded, /^[A-Za-z0-9+/]+={0,2}\n$/u);
    assert.equal(verify('sha256', bytes, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(encoded.trim(), 'base64')), true, `Public signature: ${path}`);
    return { bytes, value: JSON.parse(bytes) };
  }

  const { bytes: indexBytes, value: index } = await signed('index.json', 'index.sig');
  assert.equal(sha256(indexBytes), expectedIndex);
  assert.equal(index.sequence, CALENDAR_BROWSER_SEQUENCE);
  assert.ok(Date.parse(index.issued_at) <= Date.parse(startedAt));
  assert.ok(Date.parse(index.expires_at) > Date.parse(startedAt));
  const pointer = index.channels.production;
  const { bytes: releaseBytes, value: release } = await signed(pointer.path, pointer.signature_path);
  assert.equal(releaseBytes.length, pointer.bytes);
  assert.equal(sha256(releaseBytes), pointer.sha256);
  assert.equal(pointer.release_set_id, CALENDAR_BROWSER_RELEASE_ID);
  assert.equal(release.release_set_id, CALENDAR_BROWSER_RELEASE_ID);
  assert.equal(release.sequence, CALENDAR_BROWSER_SEQUENCE);
  assert.equal(release.modules.length, 7);
  const modules = []; let payloadCount = 0;
  for (const entry of release.modules) {
    const { bytes, value: manifest } = await signed(entry.manifest_path, entry.signature_path);
    assert.equal(bytes.length, entry.manifest_bytes);
    assert.equal(sha256(bytes), entry.manifest_sha256);
    assert.equal(manifest.module_id, entry.module_id);
    assert.equal(manifest.version, entry.version);
    for (const file of manifest.files) {
      const payload = await exactPublic(`${dirname(entry.manifest_path)}/${file.path}`);
      assert.equal(payload.length, file.bytes);
      assert.equal(sha256(payload), file.sha256);
      payloadCount++;
    }
    modules.push({ id: entry.module_id, version: manifest.version, revision: manifest.revision,
      files: manifest.files.length, manifest_sha256: sha256(bytes) });
  }
  // A receipt must establish public availability before the prospective boundary,
  // not merely that a fetch began or signing happened before it.
  assertCalendarMutationDeadline(plan.request);
  const completedAt = new Date().toISOString();
  return { status: 'PASS', verification_kind: 'ORDINARY_PUBLIC_HTTPS_EXACT_BYTE_READBACK',
    started_at: startedAt, completed_at: completedAt, channel: CALENDAR_PUBLIC_CHANNEL,
    release_set_id: release.release_set_id, sequence: index.sequence,
    index_sha256: sha256(indexBytes), release_sha256: sha256(releaseBytes),
    signatures_verified: 2 + release.modules.length, payload_files_verified: payloadCount,
    fetched_files: fetched, transferred_bytes: transferred, cache, modules,
    prospective_publication_plan: plan.request.prospective_publication_plan,
    files: fileEvidence.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  const flags = { '--signed-stage': 'directory', '--catalog': 'catalogPath', '--browser': 'browserPath', '--evidence': 'evidencePath' };
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(flags[args[i]] && args[i + 1] && !options[flags[args[i]]], 'Explicit reviewed payload/evidence arguments required');
    options[flags[args[i]]] = args[i + 1];
  }
  console.log(JSON.stringify(await verifyCalendarBrowserPublic(options), null, 2));
}
