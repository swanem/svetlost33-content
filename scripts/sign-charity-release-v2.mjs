#!/usr/bin/env node
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, CAPABILITIES, KEY_ID, createCharityReleasePlan, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export async function signCharityRelease({ candidate, out, privateKeyPath, now = new Date().toISOString() }) {
  if (!candidate || !out || !privateKeyPath) throw new Error('Explicit candidate, new output and external private-key paths are required');
  // Reconstruct every approved candidate byte from pinned, signed public input.
  // A modified candidate/request cannot authorize itself for signing.
  const plan = await createCharityReleasePlan({ now });
  const candidateFiles = await readTree(resolve(candidate));
  if (candidateFiles.size !== plan.files.size) throw new Error('Candidate file set differs from the reviewed plan');
  for (const [path, bytes] of plan.files) {
    if (!candidateFiles.get(path)?.equals(bytes)) throw new Error(`Candidate differs from the reviewed plan: ${path}`);
  }
  const existingOut = await lstat(resolve(out)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existingOut) throw new Error('Output already exists; refusing to overwrite it');
  const keyPath = resolve(privateKeyPath);
  const keyStat = await lstat(keyPath);
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('Private key must be an explicitly selected regular file');
  let privateKey;
  const privateBytes = await readFile(keyPath);
  try { privateKey = createPrivateKey(privateBytes); } finally { privateBytes.fill(0); }
  const expectedPublic = createPublicKey(await readFile(resolve(BASE, 'trusted-public-key.pem'))).export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(expectedPublic)) throw new Error('Selected key does not match the pinned existing production public key');
  const signed = new Map(plan.files);
  signed.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) {
    const signature = sign('sha256', signed.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
    signed.set(document.signature_path, Buffer.from(`${signature.toString('base64')}\n`, 'ascii'));
  }
  await writeNewTree(out, signed);
  const checks = [];
  for (const [platform, clientVersion] of [['android', 10], ['ios', '0.1.0']]) {
    checks.push(await validateRelease(out, { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: 3, clientCapabilities: CAPABILITIES }));
    // Prior binaries must still accept unchanged core content and skip the new
    // optional capability. No whole-release version bump is necessary.
    const legacy = await validateRelease(out, { now, platform, clientVersion, trustedKeyId: KEY_ID, minimumSequence: 3, clientCapabilities: CAPABILITIES.filter(value => value !== 'organizations-v1') });
    if (legacy.modules !== 3 || !legacy.skippedOptionalModules.includes('organizations-v1')) throw new Error('Prior-client optional-module compatibility failed');
  }
  return checks;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--candidate', '--out', '--private-key'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: node scripts/sign-charity-release-v2.mjs --candidate <prepared-directory> --out <new-signed-directory> --private-key <explicit-external-key>');
    values.set(args[i], args[i + 1]);
  }
  const checks = await signCharityRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key') });
  console.log(`Signed and verified ${checks[0].releaseSetId} for both platforms; previous-client optional skip also passed. Output has not been published.`);
}
