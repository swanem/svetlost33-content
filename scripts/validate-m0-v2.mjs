#!/usr/bin/env node
import { constants, createHash, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import sharp from 'sharp';

const LIMITS = { document: 256 * 1024, modules: 16, files: 512, file: 20 * 1024 * 1024, total: 100 * 1024 * 1024, path: 160, side: 4096, pixels: 16_000_000 };
const TYPES = new Set(['application/json', 'image/png', 'image/jpeg']);
const MODULE_TYPES = new Set(['library', 'cycles', 'calendar', 'backgrounds', 'organizations']);
const SHA = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CAPABILITY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ajv = new Ajv2020({ allErrors:true, strict:true });
addFormats(ajv);
const schemaRoot = resolve(import.meta.dirname, '../schemas/v2');
const schemaValidators = Object.fromEntries(await Promise.all([
  ['index', 'index.schema.json'],
  ['release-set', 'release-set.schema.json'],
  ['module', 'module-manifest.schema.json']
].map(async ([kind, name]) => [kind, ajv.compile(JSON.parse(await readFile(resolve(schemaRoot, name), 'utf8')))])));

export class ValidationError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
const fail = (code, message) => { throw new ValidationError(code, message); };
const identifier = (value, label) => {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('SCHEMA', `Invalid ${label}`);
};
const positiveInteger = (value, label) => {
  if (!Number.isInteger(value) || value < 1) fail('SCHEMA', `Invalid ${label}`);
};
const againstSchema = (kind, value) => {
  const validate = schemaValidators[kind];
  if (!validate(value)) {
    const code = validate.errors?.some(error => error.keyword === 'pattern' && /\/(path|manifest_path|signature_path)$/.test(error.instancePath)) ? 'PATH' : 'SCHEMA';
    fail(code, `${kind}: ${ajv.errorsText(validate.errors, { separator:'; ' })}`);
  }
};
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
  const target = inside(root, path);
  const stat = await lstat(target).catch(() => fail('MISSING', path));
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PATH', `Not a regular signature: ${path}`);
  if (stat.size < 1 || stat.size > 8192) fail('SIGNATURE', `Invalid signature size: ${path}`);
  const raw = await readFile(target);
  if (raw.some(byte => byte > 0x7f)) fail('SIGNATURE', `Signature is not ASCII: ${path}`);
  const encoded = raw.toString('ascii').trim();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('SIGNATURE', `Signature is not strict Base64: ${path}`);
  const signature = Buffer.from(encoded, 'base64');
  if (!signature.length || signature.toString('base64') !== encoded) fail('SIGNATURE', `Signature is not canonical Base64: ${path}`);
  return signature;
}
async function verifyDetached(root, bytes, signaturePath, publicKey) {
  const signature = await signatureBytes(root, signaturePath);
  const valid = verify('sha256', bytes, { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature);
  if (!valid) fail('SIGNATURE', signaturePath);
}
async function validateImage(bytes, record) {
  if (!record.image || !Number.isInteger(record.image.width) || !Number.isInteger(record.image.height)) fail('SCHEMA', `Missing image metadata: ${record.path}`);
  let decoded, metadata;
  try {
    const input = sharp(bytes, { failOn:'error', limitInputPixels:LIMITS.pixels, sequentialRead:true });
    metadata = await input.metadata();
    decoded = await sharp(bytes, { failOn:'error', limitInputPixels:LIMITS.pixels, sequentialRead:true }).raw().toBuffer({ resolveWithObject:true });
  } catch { fail('MEDIA', `Image cannot be fully decoded: ${record.path}`); }
  const expectedFormat = record.content_type === 'image/png' ? 'png' : 'jpeg';
  if (metadata.format !== expectedFormat || (metadata.pages || 1) !== 1) fail('MEDIA', `Image format mismatch: ${record.path}`);
  const actual = { width:decoded.info.width, height:decoded.info.height };
  if (actual.width !== record.image.width || actual.height !== record.image.height) fail('MEDIA', `Dimension mismatch: ${record.path}`);
  if (actual.width > LIMITS.side || actual.height > LIMITS.side || actual.width * actual.height > LIMITS.pixels) fail('MEDIA_LIMIT', record.path);
}
function validateIndexShape(index) {
  exactKeys(index, ['schema_version','sequence','issued_at','expires_at','key_id','channels']);
  if (index.schema_version !== 'svetlost33-m0-index-2') fail('SCHEMA', 'Invalid index schema');
  positiveInteger(index.sequence, 'index sequence'); identifier(index.key_id, 'key id');
  if (typeof index.issued_at !== 'string' || typeof index.expires_at !== 'string' || !Number.isFinite(Date.parse(index.issued_at)) || !Number.isFinite(Date.parse(index.expires_at)) || Date.parse(index.expires_at) <= Date.parse(index.issued_at)) fail('SCHEMA', 'Invalid index dates');
  if (!index.channels || typeof index.channels !== 'object' || !Object.keys(index.channels).length) fail('SCHEMA', 'No channels');
  for (const [name, channel] of Object.entries(index.channels)) {
    identifier(name, 'channel id'); exactKeys(channel, ['release_set_id','path','bytes','sha256','signature_path']);
    identifier(channel.release_set_id, 'release set id'); safePath(channel.path); safePath(channel.signature_path);
    positiveInteger(channel.bytes, 'release set bytes'); if (channel.bytes > LIMITS.document || typeof channel.sha256 !== 'string' || !SHA.test(channel.sha256)) fail('SCHEMA', 'Invalid release set record');
  }
}
function validateReleaseShape(set) {
  exactKeys(set, ['schema_version','release_set_id','sequence','channel','key_id','approved_platforms','min_clients','modules']);
  if (set.schema_version !== 'svetlost33-release-set-2') fail('SCHEMA', 'Invalid release set schema');
  identifier(set.release_set_id, 'release set id'); positiveInteger(set.sequence, 'release sequence'); identifier(set.channel, 'channel id'); identifier(set.key_id, 'key id');
  if (!Array.isArray(set.modules) || !set.modules.length || set.modules.length > LIMITS.modules) fail('LIMIT', 'Invalid module count');
  if (!Array.isArray(set.approved_platforms) || !set.approved_platforms.length || set.approved_platforms.some(value => value !== 'android' && value !== 'ios') || new Set(set.approved_platforms).size !== set.approved_platforms.length) fail('SCHEMA', 'Invalid approved platforms');
  exactKeys(set.min_clients, ['android','ios']);
  positiveInteger(set.min_clients.android, 'minimum Android versionCode');
  if (typeof set.min_clients.ios !== 'string' || !SEMVER.test(set.min_clients.ios)) fail('SCHEMA', 'Invalid minimum iOS version');
}
function validateModuleShape(manifest) {
  exactKeys(manifest, ['schema_version','module_id','module_type','version','revision','key_id','capabilities','dependencies','files']);
  if (manifest.schema_version !== 'svetlost33-module-manifest-2' || !MODULE_TYPES.has(manifest.module_type)) fail('SCHEMA', `Invalid module ${manifest.module_id}`);
  identifier(manifest.module_id, 'module id'); identifier(manifest.version, 'module version'); positiveInteger(manifest.revision, 'module revision'); identifier(manifest.key_id, 'key id');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > LIMITS.files) fail('LIMIT', `Invalid file count ${manifest.module_id}`);
  if (!Array.isArray(manifest.dependencies) || !Array.isArray(manifest.capabilities) || new Set(manifest.capabilities).size !== manifest.capabilities.length) fail('SCHEMA', `Invalid arrays ${manifest.module_id}`);
  for (const capability of manifest.capabilities) if (typeof capability !== 'string' || !CAPABILITY.test(capability)) fail('SCHEMA', 'Invalid capability id');
  const dependencies = new Set();
  for (const dependency of manifest.dependencies) {
    exactKeys(dependency, ['module_id','version']); identifier(dependency.module_id, 'dependency module id'); identifier(dependency.version, 'dependency version');
    if (dependencies.has(dependency.module_id)) fail('DUPLICATE_ID', `Dependency ${dependency.module_id}`); dependencies.add(dependency.module_id);
  }
}

function compareSemver(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

export async function validateRelease(rootInput, options = {}) {
  const root = resolve(rootInput); const keyPath = resolve(options.publicKeyPath || resolve(root, 'trusted-public-key.pem'));
  const publicKey = await readFile(keyPath, 'utf8').catch(() => fail('KEY', keyPath));
  const indexBytes = await readFile(resolve(root, 'index.json')).catch(() => fail('MISSING', 'index.json'));
  if (indexBytes.length > LIMITS.document) fail('LIMIT', 'index.json');
  await verifyDetached(root, indexBytes, 'index.sig', publicKey);
  const index = parseJson(indexBytes, 'index.json'); validateIndexShape(index);
  againstSchema('index', index);
  if (options.trustedKeyId && index.key_id !== options.trustedKeyId) fail('KEY', `Unknown key id ${index.key_id}`);
  const now = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  if (!Number.isFinite(now)) fail('SCHEMA', 'Invalid validator time');
  if (Date.parse(index.issued_at) > now) fail('TIME', 'Index is not valid yet');
  if (now >= Date.parse(index.expires_at)) fail('TIME', 'Index has expired');
  if (options.minimumSequence && index.sequence < options.minimumSequence) fail('REPLAY', `${index.sequence} < ${options.minimumSequence}`);
  const channel = index.channels[options.channel || 'production']; if (!channel) fail('CHANNEL', 'Missing channel');
  exactKeys(channel, ['release_set_id','path','bytes','sha256','signature_path']);
  const setBytes = await exactFile(root, { path: channel.path, bytes: channel.bytes, sha256: channel.sha256 });
  if (setBytes.length > LIMITS.document) fail('LIMIT', channel.path);
  await verifyDetached(root, setBytes, channel.signature_path, publicKey);
  const set = parseJson(setBytes, channel.path); againstSchema('release-set', set); validateReleaseShape(set);
  if (set.release_set_id !== channel.release_set_id || set.sequence !== index.sequence || set.channel !== (options.channel || 'production') || set.key_id !== index.key_id) fail('IDENTITY', 'Index/release-set mismatch');
  if (!options.platform || (options.platform !== 'android' && options.platform !== 'ios')) fail('CLIENT_CONTEXT', 'platform is required');
  if (!set.approved_platforms.includes(options.platform)) fail('APPROVAL', `Release is not approved for ${options.platform}`);
  if (options.platform === 'android') {
    positiveInteger(options.clientVersion, 'Android client versionCode');
    if (options.clientVersion < set.min_clients.android) fail('CLIENT_VERSION', `${options.clientVersion} < ${set.min_clients.android}`);
  } else {
    if (typeof options.clientVersion !== 'string' || !SEMVER.test(options.clientVersion)) fail('SCHEMA', 'Invalid iOS client version');
    if (compareSemver(options.clientVersion, set.min_clients.ios) < 0) fail('CLIENT_VERSION', `${options.clientVersion} < ${set.min_clients.ios}`);
  }
  if (!Array.isArray(options.clientCapabilities) || options.clientCapabilities.some(value => typeof value !== 'string' || !CAPABILITY.test(value))) fail('CLIENT_CONTEXT', 'clientCapabilities are required');
  const clientCapabilities = new Set(options.clientCapabilities);
  const moduleIds = new Set(); const manifests = new Map(); const activeManifests = new Map(); const skippedOptionalModules = []; let total = indexBytes.length + setBytes.length;
  for (const entry of set.modules) {
    exactKeys(entry, ['module_id','module_type','version','required','manifest_path','manifest_bytes','manifest_sha256','signature_path']);
    identifier(entry.module_id, 'module id'); identifier(entry.version, 'module version');
    if (!MODULE_TYPES.has(entry.module_type) || typeof entry.required !== 'boolean') fail('SCHEMA', `Invalid module entry ${entry.module_id}`);
    safePath(entry.manifest_path); safePath(entry.signature_path); positiveInteger(entry.manifest_bytes, 'manifest bytes');
    if (entry.manifest_bytes > LIMITS.document || typeof entry.manifest_sha256 !== 'string' || !SHA.test(entry.manifest_sha256)) fail('SCHEMA', `Invalid module record ${entry.module_id}`);
    if (moduleIds.has(entry.module_id)) fail('DUPLICATE_ID', entry.module_id); moduleIds.add(entry.module_id);
    const bytes = await exactFile(root, { path: entry.manifest_path, bytes: entry.manifest_bytes, sha256: entry.manifest_sha256 });
    if (bytes.length > LIMITS.document) fail('LIMIT', entry.manifest_path);
    await verifyDetached(root, bytes, entry.signature_path, publicKey);
    const manifest = parseJson(bytes, entry.manifest_path); againstSchema('module', manifest); validateModuleShape(manifest);
    if (manifest.module_id !== entry.module_id || manifest.module_type !== entry.module_type || manifest.version !== entry.version || manifest.key_id !== set.key_id) fail('IDENTITY', entry.module_id);
    const missingCapabilities = manifest.capabilities.filter(capability => !clientCapabilities.has(capability));
    if (entry.required && missingCapabilities.length) fail('CAPABILITY', missingCapabilities[0]);
    manifests.set(manifest.module_id, manifest);
    if (missingCapabilities.length) {
      skippedOptionalModules.push(manifest.module_id);
      continue;
    }
    const base = dirname(inside(root, entry.manifest_path)); const paths = new Set();
    for (const file of manifest.files) {
      exactKeys(file, ['path','bytes','sha256','content_type'], ['encoding','image']);
      if (!TYPES.has(file.content_type) || paths.has(file.path)) fail(paths.has(file.path) ? 'DUPLICATE_PATH' : 'TYPE', file.path); paths.add(file.path);
      const payload = await exactFile(base, file); total += payload.length; if (total > LIMITS.total) fail('LIMIT', 'Release total');
      if (file.content_type === 'application/json') { if (file.encoding !== 'utf-8' || file.image) fail('SCHEMA', file.path); parseJson(payload, file.path); }
      else { if (file.encoding) fail('SCHEMA', file.path); exactKeys(file.image, ['width','height']); await validateImage(payload, file); }
    }
    activeManifests.set(manifest.module_id, manifest);
  }
  for (const manifest of activeManifests.values()) for (const dependency of manifest.dependencies) {
    exactKeys(dependency, ['module_id','version']); const actual = activeManifests.get(dependency.module_id);
    if (!actual || actual.version !== dependency.version) fail('DEPENDENCY', `${manifest.module_id} -> ${dependency.module_id}@${dependency.version}`);
  }
  return { releaseSetId: set.release_set_id, sequence: set.sequence, modules:activeManifests.size, verifiedModules:manifests.size, skippedOptionalModules, totalBytes: total };
}

if (process.argv[1] === import.meta.filename) {
  const target = process.argv[2]; if (!target) { console.error('Usage: validate-m0-v2.mjs <release-directory>'); process.exit(2); }
  const keyIndex = process.argv.indexOf('--key'); const idIndex = process.argv.indexOf('--key-id'); const platformIndex = process.argv.indexOf('--platform'); const versionIndex = process.argv.indexOf('--client-version');
  const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : 'android'; const versionRaw = versionIndex >= 0 ? process.argv[versionIndex + 1] : (platform === 'android' ? '10' : '0.15.0');
  validateRelease(target, { publicKeyPath:keyIndex >= 0 ? process.argv[keyIndex + 1] : undefined, trustedKeyId:idIndex >= 0 ? process.argv[idIndex + 1] : 'svetlost33-fixture-key-1', platform, clientVersion:platform === 'android' ? Number(versionRaw) : versionRaw, clientCapabilities:['library-v1','sr-Cyrl','sr-Latn','cycle-v1','calendar-v1','explicit-unknown','background-catalog-v1'] }).then(result => console.log(`Valid M0 v2 ${result.releaseSetId}: ${result.modules} active modules, ${result.totalBytes} bytes.`)).catch(error => { console.error(error.message); process.exit(1); });
}
