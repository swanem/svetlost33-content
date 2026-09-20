#!/usr/bin/env node
// Read-only verification of the ordinary public S8 channel against reviewed
// local production bytes and the existing pinned key. No cache-busting URL,
// signing, uploads, local writes or discovery changes occur here.
import assert from 'node:assert/strict';
import { constants, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BASE, PUBLIC_KEY_SHA256, sha256 } from './prepare-charity-release-v2.mjs';

const channel = 'https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/';
const expectedIndex = '33309c9f1a8474a04971c01734cfaa647ffe3589ecb15b936adf41de21fc7674';
const pem = await readFile(resolve(BASE, 'trusted-public-key.pem'));
assert.equal(sha256(pem), PUBLIC_KEY_SHA256);
const key = createPublicKey(pem);
let fetched = 0;
let transferred = 0;
let cache = null;

async function exactPublic(path) {
  assert.ok(path && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..'));
  const local = await readFile(resolve(BASE, path));
  const response = await fetch(new URL(path, channel), {
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `Public HTTP status: ${path}`);
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
  fetched += 1;
  transferred += bytes;
  return actual;
}

async function signedDocument(path, signaturePath) {
  const [bytes, signatureBytes] = await Promise.all([
    exactPublic(path), exactPublic(signaturePath),
  ]);
  const signature = signatureBytes.toString('ascii');
  assert.match(signature, /^[A-Za-z0-9+/]+={0,2}\n$/u);
  assert.equal(verify('sha256', bytes, {
    key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }, Buffer.from(signature.trim(), 'base64')), true, `Public signature: ${path}`);
  return { bytes, document: JSON.parse(bytes) };
}

const { bytes: indexBytes, document: index } = await signedDocument('index.json', 'index.sig');
assert.equal(sha256(indexBytes), expectedIndex);
assert.equal(index.sequence, 8);
assert.ok(Date.parse(index.expires_at) > Date.now(), 'Public discovery must remain unexpired');
const pointer = index.channels.production;
const { bytes: releaseBytes, document: release } = await signedDocument(pointer.path, pointer.signature_path);
assert.equal(releaseBytes.length, pointer.bytes);
assert.equal(sha256(releaseBytes), pointer.sha256);
assert.equal(release.release_set_id, 'shared-saints-expansion-2026-09-21-m0v2-s8');
assert.equal(release.sequence, 8);
assert.equal(release.modules.length, 6);
let payloadCount = 0;
const moduleEvidence = [];
for (const entry of release.modules) {
  const { bytes, document: manifest } = await signedDocument(entry.manifest_path, entry.signature_path);
  assert.equal(bytes.length, entry.manifest_bytes);
  assert.equal(sha256(bytes), entry.manifest_sha256);
  assert.equal(manifest.module_id, entry.module_id);
  for (const file of manifest.files) {
    const payload = await exactPublic(`${dirname(entry.manifest_path)}/${file.path}`);
    assert.equal(payload.length, file.bytes);
    assert.equal(sha256(payload), file.sha256);
    payloadCount += 1;
  }
  moduleEvidence.push({ id: entry.module_id, version: manifest.version,
    revision: manifest.revision, files: manifest.files.length, manifest_sha256: sha256(bytes) });
}
console.log(JSON.stringify({ status: 'PASS', checked_at: new Date().toISOString(),
  channel, sequence: index.sequence, release_set_id: release.release_set_id,
  index_sha256: sha256(indexBytes), release_sha256: sha256(releaseBytes),
  signatures_verified: 2 + release.modules.length, payload_files_verified: payloadCount,
  fetched_files: fetched, transferred_bytes: transferred, cache, modules: moduleEvidence,
}, null, 2));
