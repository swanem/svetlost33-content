#!/usr/bin/env node
import { constants, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, KEY_ID, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { createWidgetExcerptPlan } from './prepare-widget-excerpts-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';

export async function signWidgetExcerptRelease({ candidate, out, privateKeyPath, sourceDirectory, now = new Date().toISOString() }) {
  if (!candidate || !out || !privateKeyPath) throw new Error('Explicit candidate, new output and external private-key paths are required');
  const plan = await createWidgetExcerptPlan({ now, sourceDirectory });
  const candidateFiles = await readTree(resolve(candidate));
  if (candidateFiles.size !== plan.files.size) throw new Error('Candidate file set differs from the approved plan');
  for (const [path, bytes] of plan.files) if (!candidateFiles.get(path)?.equals(bytes)) throw new Error(`Candidate differs from approved plan: ${path}`);
  const existing = await lstat(resolve(out)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) throw new Error('Output already exists; refusing to overwrite it');
  const keyStat = await lstat(resolve(privateKeyPath));
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error('Private key must be an explicitly selected regular file');
  let privateKey;
  const bytes = await readFile(resolve(privateKeyPath));
  try { privateKey = createPrivateKey(bytes); } finally { bytes.fill(0); }
  const expected = createPublicKey(plan.files.get('trusted-public-key.pem')).export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(expected)) throw new Error('Selected key does not match the pinned production public key');
  const files = new Map(plan.files); files.delete('signing-request.json');
  for (const document of plan.request.documents_to_sign) files.set(document.signature_path,
    Buffer.from(`${sign('sha256', files.get(document.path), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')}\n`, 'ascii'));
  await writeNewTree(out, files);
  const checks = [];
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    for (const minimumSequence of [2, 3]) checks.push(await validateRelease(out, { now, platform, clientVersion, minimumSequence, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }));
  }
  let rejected = false;
  try { await validateRelease(out, { now, platform: 'android', clientVersion: 34, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES }); }
  catch (error) { if (error.code !== 'CLIENT_VERSION') throw error; rejected = true; }
  if (!rejected) throw new Error('Old Android compatibility gate failed');
  const oldIos = await validateRelease(out, { now, platform: 'ios', clientVersion: '0.1.0', trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES.filter(value => value !== 'organizations-v1') });
  if (oldIos.modules !== 3 || !oldIos.skippedOptionalModules.includes('organizations-v1')) throw new Error('Optional organizations skip failed');
  return checks;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--candidate', '--out', '--private-key', '--source'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: node scripts/sign-widget-excerpts-v2.mjs --candidate <prepared-directory> --out <new-directory> --private-key <explicit-external-key> [--source <signed-s3-or-later-root>]');
    values.set(args[i], args[i + 1]);
  }
  const checks = await signWidgetExcerptRelease({ candidate: values.get('--candidate'), out: values.get('--out'), privateKeyPath: values.get('--private-key'), sourceDirectory: values.get('--source') });
  console.log(`Signed and verified ${checks[0].releaseSetId}; no publication performed.`);
}
