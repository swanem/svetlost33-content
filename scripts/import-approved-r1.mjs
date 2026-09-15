#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceIndex = process.argv.indexOf('--source');
const source = resolve(sourceIndex >= 0 ? process.argv[sourceIndex + 1] : resolve(root, '../svetlost33-github'));
const checkOnly = process.argv.includes('--check');
const releaseSource = resolve(source, 'shared/releases/annual-2026-r1');
const payloadSource = resolve(source, 'shared/annual/2026');
const destination = resolve(root, 'releases/legacy/annual-2026-r1');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function copyExact(from, to, expected) {
  const bytes = await readFile(from);
  if (expected && (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)) throw new Error(`Source hash mismatch: ${from}`);
  if (checkOnly) {
    const existing = await readFile(to);
    if (!existing.equals(bytes)) throw new Error(`Mirror differs: ${to}`);
  } else {
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes);
  }
}

const manifestBytes = await readFile(resolve(releaseSource, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
if (manifest.package_id !== 'svetlost33-annual-2026-r1' || manifest.files.length !== 13) throw new Error('Unexpected approved r1 manifest');
const allowed = new Set(JSON.parse(await readFile(resolve(root, 'inventory/public-allowlist.json'))).allowed);
for (const record of manifest.files) {
  const listed = `shared/annual/2026/${record.path}`;
  if (!allowed.has(listed)) throw new Error(`Payload is not allowlisted: ${listed}`);
  await copyExact(resolve(payloadSource, record.path), resolve(destination, 'payload', record.path), record);
}
for (const name of ['manifest.json', 'manifest.sig', 'public-key.pem', 'approval.json']) {
  const listed = `shared/releases/annual-2026-r1/${name}`;
  if (!allowed.has(listed)) throw new Error(`Release artifact is not allowlisted: ${listed}`);
  await copyExact(resolve(releaseSource, name), resolve(destination, name));
}
const technicalAllowed = new Set(JSON.parse(await readFile(resolve(root, 'inventory/public-allowlist.json'))).technical_contract_allowed);
for (const name of ['README.md', 'update-fixtures.json']) {
  const listed = `shared/update-contract/v1/${name}`;
  if (!technicalAllowed.has(listed)) throw new Error(`Contract artifact is not allowlisted: ${listed}`);
  await copyExact(resolve(source, listed), resolve(root, 'schemas/v1', name));
}
console.log(`${checkOnly ? 'Verified' : 'Imported'} annual-2026-r1: 13 payload files, 4 release artifacts and 2 M0 v1 artifacts.`);
