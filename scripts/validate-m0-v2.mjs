#!/usr/bin/env node
import { constants, createHash, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

const LIMITS = { document: 256 * 1024, modules: 16, files: 512, file: 20 * 1024 * 1024, total: 100 * 1024 * 1024, path: 160, side: 4096, pixels: 16_000_000 };
const TYPES = new Set(['application/json', 'image/png', 'image/jpeg']);
const MODULE_TYPES = new Set(['library', 'cycles', 'calendar', 'backgrounds', 'organizations']);
const SHA = /^[0-9a-f]{64}$/;
const KEY = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export class ValidationError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
const fail = (code, message) => { throw new ValidationError(code, message); };
const exactKeys = (object, required, optional = []) => {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail('SCHEMA', 'Expected object');
  for (const key of required) if (!(key in object)) fail('SCHEMA', `Missing ${key}`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) if (!allowed.has(key)) fail('SCHEMA', `Unknown field ${key}`);
};
const parseJson = (bytes, label) => {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('UTF8', `${label} is not UTF-8`); }
  try { return JSON.parse(text); } catch { fail('JSON', `${label} is not valid JSON`); }
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = path => {
  if (typeof path !== 'string' || !path || path.length > LIMITS.path || path.startsWith('/') || path.includes('\\')) fail('PATH', `Unsafe path: ${path}`);
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('PATH', `Unsafe path: ${path}`);
  return path;
};
const inside = (root, path) => {
  const target = resolve(root, safePath(path));
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') fail('PATH', `Path escapes release: ${path}`);
  return target;
};
async function exactFile(root, record) {
  if (!Number.isInteger(record.bytes) || record.bytes < 1 || record.bytes > LIMITS.file || !SHA.test(record.sha256)) fail('SCHEMA', `Invalid file record ${record.path}`);
  const target = inside(root, record.path);
  const stat = await lstat(target).catch(() => fail('MISSING', record.path));
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PATH', `Not a regular file: ${record.path}`);
  const bytes = await readFile(target);
  if (bytes.length !== record.bytes) fail('LENGTH', record.path);
  if (digest(bytes) !== record.sha256) fail('HASH', record.path);
  return bytes;
}
async function signatureBytes(root, path) {
  const raw = await readFile(inside(root, path)).catch(() => fail('MISSING', path));
  let signature;
  try { signature = Buffer.from(raw.toString('ascii').trim(), 'base64'); } catch { fail('SIGNATURE', path); }
  if (!signature.length) fail('SIGNATURE', path);
  return signature;
}
async function verifyDetached(root, bytes, signaturePath, publicKey) {
  const signature = await signatureBytes(root, signaturePath);
  const valid = verify('sha256', bytes, { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature);
  if (!valid) fail('SIGNATURE', signaturePath);
}
function pngDimensions(bytes) {
  const magic = Buffer.from([137,80,78,71,13,10,26,10]);
  if (bytes.length < 45 || !bytes.subarray(0,8).equals(magic)) fail('MEDIA', 'Invalid PNG signature');
  let offset = 8, width, height, ended = false; const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + 12 + length > bytes.length) fail('MEDIA', 'Truncated PNG chunk');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { if (length !== 13) fail('MEDIA', 'Invalid IHDR'); width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') { ended = true; break; }
    offset += length + 12;
  }
  if (!width || !height || !ended || !idat.length) fail('MEDIA', 'PNG cannot be decoded');
  try { inflateSync(Buffer.concat(idat), { maxOutputLength: LIMITS.pixels * 4 + LIMITS.side }); } catch { fail('MEDIA', 'PNG pixel stream cannot be decoded'); }
  return { width, height };
}
function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) fail('MEDIA', 'Invalid JPEG framing');
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) fail('MEDIA', 'Truncated JPEG');
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  fail('MEDIA', 'JPEG dimensions missing');
}
function validateImage(bytes, record) {
  if (!record.image || !Number.isInteger(record.image.width) || !Number.isInteger(record.image.height)) fail('SCHEMA', `Missing image metadata: ${record.path}`);
  const actual = record.content_type === 'image/png' ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (actual.width !== record.image.width || actual.height !== record.image.height) fail('MEDIA', `Dimension mismatch: ${record.path}`);
  if (actual.width > LIMITS.side || actual.height > LIMITS.side || actual.width * actual.height > LIMITS.pixels) fail('MEDIA_LIMIT', record.path);
}
function validateIndexShape(index) {
  exactKeys(index, ['schema_version','sequence','issued_at','expires_at','key_id','channels']);
  if (index.schema_version !== 'svetlost33-m0-index-2' || !Number.isInteger(index.sequence) || index.sequence < 1 || !KEY.test(index.key_id)) fail('SCHEMA', 'Invalid index');
  if (!Number.isFinite(Date.parse(index.issued_at)) || !Number.isFinite(Date.parse(index.expires_at)) || Date.parse(index.expires_at) <= Date.parse(index.issued_at)) fail('SCHEMA', 'Invalid index dates');
  if (!index.channels || typeof index.channels !== 'object' || !Object.keys(index.channels).length) fail('SCHEMA', 'No channels');
}
function validateReleaseShape(set) {
  exactKeys(set, ['schema_version','release_set_id','sequence','channel','key_id','approved_platforms','min_clients','modules']);
  if (set.schema_version !== 'svetlost33-release-set-2' || !Number.isInteger(set.sequence) || set.sequence < 1 || !KEY.test(set.key_id)) fail('SCHEMA', 'Invalid release set');
  if (!Array.isArray(set.modules) || !set.modules.length || set.modules.length > LIMITS.modules) fail('LIMIT', 'Invalid module count');
  if (!Array.isArray(set.approved_platforms) || !['android','ios'].every(x => set.approved_platforms.includes(x))) fail('APPROVAL', 'Both clients are not approved in fixture release');
  exactKeys(set.min_clients, ['android','ios']);
}
function validateModuleShape(manifest) {
  exactKeys(manifest, ['schema_version','module_id','module_type','version','revision','key_id','capabilities','dependencies','files']);
  if (manifest.schema_version !== 'svetlost33-module-manifest-2' || !MODULE_TYPES.has(manifest.module_type) || !Number.isInteger(manifest.revision) || manifest.revision < 1 || !KEY.test(manifest.key_id)) fail('SCHEMA', `Invalid module ${manifest.module_id}`);
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > LIMITS.files) fail('LIMIT', `Invalid file count ${manifest.module_id}`);
  if (!Array.isArray(manifest.dependencies) || !Array.isArray(manifest.capabilities) || new Set(manifest.capabilities).size !== manifest.capabilities.length) fail('SCHEMA', `Invalid arrays ${manifest.module_id}`);
}

export async function validateRelease(rootInput, options = {}) {
  const root = resolve(rootInput); const keyPath = resolve(options.publicKeyPath || resolve(root, 'trusted-public-key.pem'));
  const publicKey = await readFile(keyPath, 'utf8').catch(() => fail('KEY', keyPath));
  const indexBytes = await readFile(resolve(root, 'index.json')).catch(() => fail('MISSING', 'index.json'));
  if (indexBytes.length > LIMITS.document) fail('LIMIT', 'index.json');
  await verifyDetached(root, indexBytes, 'index.sig', publicKey);
  const index = parseJson(indexBytes, 'index.json'); validateIndexShape(index);
  if (options.trustedKeyId && index.key_id !== options.trustedKeyId) fail('KEY', `Unknown key id ${index.key_id}`);
  if (options.minimumSequence && index.sequence < options.minimumSequence) fail('REPLAY', `${index.sequence} < ${options.minimumSequence}`);
  const channel = index.channels[options.channel || 'production']; if (!channel) fail('CHANNEL', 'Missing channel');
  exactKeys(channel, ['release_set_id','path','bytes','sha256','signature_path']);
  const setBytes = await exactFile(root, { path: channel.path, bytes: channel.bytes, sha256: channel.sha256 });
  if (setBytes.length > LIMITS.document) fail('LIMIT', channel.path);
  await verifyDetached(root, setBytes, channel.signature_path, publicKey);
  const set = parseJson(setBytes, channel.path); validateReleaseShape(set);
  if (set.release_set_id !== channel.release_set_id || set.sequence !== index.sequence || set.channel !== (options.channel || 'production') || set.key_id !== index.key_id) fail('IDENTITY', 'Index/release-set mismatch');
  const moduleIds = new Set(); const manifests = new Map(); let total = indexBytes.length + setBytes.length;
  for (const entry of set.modules) {
    exactKeys(entry, ['module_id','module_type','version','required','manifest_path','manifest_bytes','manifest_sha256','signature_path']);
    if (moduleIds.has(entry.module_id)) fail('DUPLICATE_ID', entry.module_id); moduleIds.add(entry.module_id);
    const bytes = await exactFile(root, { path: entry.manifest_path, bytes: entry.manifest_bytes, sha256: entry.manifest_sha256 });
    if (bytes.length > LIMITS.document) fail('LIMIT', entry.manifest_path);
    await verifyDetached(root, bytes, entry.signature_path, publicKey);
    const manifest = parseJson(bytes, entry.manifest_path); validateModuleShape(manifest);
    if (manifest.module_id !== entry.module_id || manifest.module_type !== entry.module_type || manifest.version !== entry.version || manifest.key_id !== set.key_id) fail('IDENTITY', entry.module_id);
    const base = dirname(inside(root, entry.manifest_path)); const paths = new Set();
    for (const file of manifest.files) {
      exactKeys(file, ['path','bytes','sha256','content_type'], ['encoding','image']);
      if (!TYPES.has(file.content_type) || paths.has(file.path)) fail(paths.has(file.path) ? 'DUPLICATE_PATH' : 'TYPE', file.path); paths.add(file.path);
      const payload = await exactFile(base, file); total += payload.length; if (total > LIMITS.total) fail('LIMIT', 'Release total');
      if (file.content_type === 'application/json') { if (file.encoding !== 'utf-8' || file.image) fail('SCHEMA', file.path); parseJson(payload, file.path); }
      else { if (file.encoding) fail('SCHEMA', file.path); validateImage(payload, file); }
    }
    manifests.set(manifest.module_id, manifest);
  }
  for (const manifest of manifests.values()) for (const dependency of manifest.dependencies) {
    exactKeys(dependency, ['module_id','version']); const actual = manifests.get(dependency.module_id);
    if (!actual || actual.version !== dependency.version) fail('DEPENDENCY', `${manifest.module_id} -> ${dependency.module_id}@${dependency.version}`);
  }
  return { releaseSetId: set.release_set_id, sequence: set.sequence, modules: manifests.size, totalBytes: total };
}

if (process.argv[1] === import.meta.filename) {
  const target = process.argv[2]; if (!target) { console.error('Usage: validate-m0-v2.mjs <release-directory>'); process.exit(2); }
  const keyIndex = process.argv.indexOf('--key'); const idIndex = process.argv.indexOf('--key-id');
  validateRelease(target, { publicKeyPath:keyIndex >= 0 ? process.argv[keyIndex + 1] : undefined, trustedKeyId:idIndex >= 0 ? process.argv[idIndex + 1] : 'svetlost33-fixture-key-1' }).then(result => console.log(`Valid M0 v2 ${result.releaseSetId}: ${result.modules} modules, ${result.totalBytes} bytes.`)).catch(error => { console.error(error.message); process.exit(1); });
}
