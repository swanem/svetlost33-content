import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { BASE, sha256, writeNewTree } from '../scripts/prepare-charity-release-v2.mjs';
import { createSaintsReleasePlan, loadSaintsS4Base, SAINTS_RELEASE_ID, SAINTS_PAYLOAD_SHA256, S4_ARCHIVE } from '../scripts/prepare-saints-release-v2.mjs';
import { signSaintsRelease, validateSaintsRelease } from '../scripts/sign-saints-release-v2.mjs';

const now = '2026-09-19T22:00:00Z';

test('saints publication plan is deterministic, one-payload optional library, preserving only active S4 modules', async () => {
  const first = await createSaintsReleasePlan({ now });
  const second = await createSaintsReleasePlan({ now });
  assert.deepEqual(first.files, second.files);
  const index = JSON.parse(first.files.get('index.json'));
  const set = JSON.parse(first.files.get(index.channels.production.path));
  const base = await loadSaintsS4Base({ now });
  assert.equal(index.sequence, 6);
  assert.equal(set.sequence, 6);
  assert.deepEqual(set.min_clients, { android: 35, ios: '0.1.0' });
  assert.deepEqual(set.modules.slice(0, 4), base.set.modules);
  assert.equal(set.modules.length, 5);
  const saints = set.modules[4];
  assert.equal(saints.module_id, 'saints-v1');
  assert.equal(saints.module_type, 'library');
  assert.equal(saints.required, false);
  const manifest = JSON.parse(first.files.get(saints.manifest_path));
  assert.deepEqual(manifest.capabilities, ['saints-v1']);
  assert.deepEqual(manifest.dependencies, [{ module_id: 'calendar-2026-r1', version: '2026.1.1' }]);
  assert.equal(manifest.files.length, 1);
  assert.deepEqual(manifest.files[0], { path: 'data/saints-v1.json', bytes: 30924, sha256: SAINTS_PAYLOAD_SHA256, content_type: 'application/json', encoding: 'utf-8' });
  assert.equal(first.request.documents_to_sign.length, 3);
  assert.equal(first.request.publication_authorized_by_approval, true);
  assert.ok([...first.files.keys()].every(path => !path.includes('m0v2-s5') && !path.includes('organizations-v1-2026.9.19')));
  assert.ok(first.files.has(`${S4_ARCHIVE}/index.json`));
  assert.ok(first.files.has(`${S4_ARCHIVE}/index.sig`));
  for (const [path, bytes] of base.files) assert.deepEqual(first.files.get(path), bytes, `Preserved immutable S4 file ${path}`);
});

test('published signed S6 bytes equal the reconstructed plan and pass new/old capability gates for both platforms', async () => {
  const { files, request } = await createSaintsReleasePlan({ now });
  for (const [path, bytes] of files) {
    if (path === 'signing-request.json') continue;
    assert.deepEqual(await readFile(resolve(BASE, path)), bytes, path);
  }
  for (const document of request.documents_to_sign) {
    assert.equal(sha256(await readFile(resolve(BASE, document.path))), document.sha256);
    assert.ok((await readFile(resolve(BASE, document.signature_path))).length > 0);
  }
  const checks = await validateSaintsRelease(BASE, now);
  assert.deepEqual(checks.map(check => check.platform), ['android', 'ios']);
  assert.ok(checks.every(check => check.current.releaseSetId === SAINTS_RELEASE_ID && check.current.modules === 5 && check.previous_capabilities.modules === 4 && check.without_optional_capabilities.modules === 3));
});

test('tampered candidate/request are rejected before any private-key access', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'svetlost33-saints-signing-guards-'));
  try {
    const plan = await createSaintsReleasePlan({ now });
    const candidate = resolve(temporary, 'candidate');
    await writeNewTree(candidate, plan.files);
    await writeFile(resolve(candidate, 'signing-request.json'), '{}\n');
    await assert.rejects(signSaintsRelease({ candidate, out: resolve(temporary, 'never-created'),
      privateKeyPath: resolve(temporary, 'nonexistent-private-key'), now }), /Candidate mismatch: signing-request/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
