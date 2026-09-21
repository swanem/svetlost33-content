#!/usr/bin/env node
// Read-only verification of the ordinary public S9 channel against the exact
// approved plan, local signed production bytes and the existing pinned key.
// No cache busting, uploads, key access, local writes or activation occurs here.
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, PUBLIC_KEY_SHA256, readTree, sha256 } from './prepare-charity-release-v2.mjs';
import { COMPLETION_RELEASE_ID, COMPLETION_SEQUENCE, createSaintsCompletionReleasePlan } from './prepare-saints-completion-release-v2.mjs';
import { validateSaintsCompletionRelease } from './sign-saints-completion-release-v2.mjs';

export const COMPLETION_PUBLIC_CHANNEL = 'https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/';

export async function verifySaintsCompletionPublic({ now = new Date().toISOString() } = {}) {
  // Reject stale or altered local production before making any public request.
  // The expected hash is derived from pinned inputs and exact owner approval,
  // not learned from the remote response or from a mutable local index alone.
  const plan = await createSaintsCompletionReleasePlan({ now });
  const localReport = await validateSaintsCompletionRelease(BASE, now);
  const localFiles = await readTree(BASE);
  const expectedIndex = sha256(plan.files.get('index.json'));
  assert.equal(localReport.index_sha256, expectedIndex);
  const pem = localFiles.get('trusted-public-key.pem');
  assert.equal(sha256(pem), PUBLIC_KEY_SHA256);
  const key = createPublicKey(pem);
  let fetched = 0, transferred = 0, cache = null;

  async function exactPublic(path) {
    assert.ok(path && !path.startsWith('/') && !path.includes('\\')
      && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Safe relative public path');
    const local = localFiles.get(path);
    assert.ok(local, `Reviewed local file required: ${path}`);
    const response = await fetch(new URL(path, COMPLETION_PUBLIC_CHANNEL), {
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `Public HTTP status: ${path}`);
    assert.ok(response.body, `Public response body: ${path}`);
    if (path === 'index.json') cache = Object.fromEntries(
      ['date', 'age', 'cache-control', 'etag', 'x-cache'].map(name => [name, response.headers.get(name)]));
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= local.length, `Public file exceeds reviewed length: ${path}`);
      chunks.push(chunk);
    }
    const actual = Buffer.concat(chunks);
    assert.ok(actual.equals(local), `Public bytes differ from reviewed bytes: ${path}`);
    fetched += 1; transferred += bytes;
    return actual;
  }

  async function signedDocument(path, signaturePath) {
    const [bytes, signatureBytes] = await Promise.all([exactPublic(path), exactPublic(signaturePath)]);
    const signature = signatureBytes.toString('ascii');
    assert.match(signature, /^[A-Za-z0-9+/]+={0,2}\n$/u);
    assert.equal(verify('sha256', bytes, {
      key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }, Buffer.from(signature.trim(), 'base64')), true, `Public signature: ${path}`);
    return { bytes, document: JSON.parse(bytes) };
  }

  const { bytes: indexBytes, document: index } = await signedDocument('index.json', 'index.sig');
  assert.equal(sha256(indexBytes), expectedIndex);
  assert.equal(index.sequence, COMPLETION_SEQUENCE);
  assert.ok(Date.parse(index.issued_at) <= Date.parse(now), 'Public discovery must not be from the future');
  assert.ok(Date.parse(index.expires_at) > Date.parse(now), 'Public discovery must remain unexpired');
  const pointer = index.channels.production;
  const { bytes: releaseBytes, document: release } = await signedDocument(pointer.path, pointer.signature_path);
  assert.equal(releaseBytes.length, pointer.bytes);
  assert.equal(sha256(releaseBytes), pointer.sha256);
  assert.equal(pointer.release_set_id, COMPLETION_RELEASE_ID);
  assert.equal(release.release_set_id, COMPLETION_RELEASE_ID);
  assert.equal(release.sequence, COMPLETION_SEQUENCE);
  assert.equal(release.modules.length, 6);
  let payloadCount = 0;
  const moduleEvidence = [];
  for (const entry of release.modules) {
    const { bytes, document: manifest } = await signedDocument(entry.manifest_path, entry.signature_path);
    assert.equal(bytes.length, entry.manifest_bytes);
    assert.equal(sha256(bytes), entry.manifest_sha256);
    assert.equal(manifest.module_id, entry.module_id);
    assert.equal(manifest.version, entry.version);
    for (const file of manifest.files) {
      const payload = await exactPublic(`${dirname(entry.manifest_path)}/${file.path}`);
      assert.equal(payload.length, file.bytes);
      assert.equal(sha256(payload), file.sha256);
      payloadCount += 1;
    }
    moduleEvidence.push({ id: entry.module_id, version: manifest.version,
      revision: manifest.revision, files: manifest.files.length, manifest_sha256: sha256(bytes) });
  }
  return { status: 'PASS', checked_at: now, channel: COMPLETION_PUBLIC_CHANNEL,
    sequence: index.sequence, release_set_id: release.release_set_id,
    index_sha256: sha256(indexBytes), release_sha256: sha256(releaseBytes),
    saints_articles: localReport.saints_articles, saints_days: localReport.saints_days,
    catalog_article_links: localReport.catalog_article_links,
    signatures_verified: 2 + release.modules.length, payload_files_verified: payloadCount,
    fetched_files: fetched, transferred_bytes: transferred, cache, modules: moduleEvidence };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/verify-saints-completion-public-v2.mjs');
  console.log(JSON.stringify(await verifySaintsCompletionPublic(), null, 2));
}
