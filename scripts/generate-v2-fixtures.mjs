#!/usr/bin/env node
import { constants, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outIndex = process.argv.indexOf('--out');
const out = resolve(outIndex >= 0 ? process.argv[outIndex + 1] : resolve(root, 'fixtures/v2/positive/release'));
const scenarioIndex = process.argv.indexOf('--scenario');
const scenario = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : 'valid';
const keyId = 'svetlost33-fixture-key-1';
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const signed = (bytes, privateKey) => sign('sha256', bytes, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64') + '\n';
const put = async (path, bytes) => { const target = resolve(out, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); return bytes; };
const fileRecord = (path, bytes, contentType, extra = {}) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: contentType, ...extra });

await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
await put('trusted-public-key.pem', publicKey);
let onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
if (scenario === 'corrupt-media') onePixelPng = Buffer.from(onePixelPng.subarray(0, 40));
const definitions = [
  { id:'library-core', type:'library', version:'1.0.0', required:true, capabilities:['library-v1','sr-Cyrl','sr-Latn'], dependencies:[], files:[['data/library.json', { psalms:[{id:'psalm-001', 'sr-Cyrl':'Псалам 1', 'sr-Latn':'Psalam 1'}], prayers:[{id:'morning-001','sr-Cyrl':'Молитва','sr-Latn':'Molitva'}], gospels:[{id:'MAT',chapters:28}], sources:[{id:'fixture-source',rights:'fixture-only'}] }]] },
  { id:'daily-cycles', type:'cycles', version:'1.0.0', required:true, capabilities:['cycle-v1'], dependencies:[{module_id:'library-core',version:'1.0.0'}], files:[['data/cycles.json', { slots:[{day:1,part:'MORNING',psalm_id:'psalm-001',prayer_id:'morning-001'}] }]] },
  { id:'calendar-2026', type:'calendar', version:'2026.1.0', required:true, capabilities:['calendar-v1','explicit-unknown'], dependencies:[{module_id:'library-core',version:'1.0.0'}], files:[['data/calendar.json', { year:2026, dates:[{date:'2026-01-01',reading_status:'UNRESOLVED',fasting_rule:'UNKNOWN'}] }]] },
  { id:'backgrounds-core', type:'backgrounds', version:'1.0.0', required:false, capabilities:['background-catalog-v1'], dependencies:[], files:[['data/catalog.json',{items:[{id:'fixture-light',revision:1,file:'media/light.png',width:1,height:1,rights:'fixture-only'}]}],['media/light.png',onePixelPng,'image/png',{image:{width:1,height:1}}]] }
];
const moduleEntries = [];
for (const definition of definitions) {
  const dir = `modules/${definition.id}`; const records = [];
  for (let [path, value, contentType = 'application/json', extra = {}] of definition.files) {
    if (scenario === 'unsafe-path' && definition.id === 'library-core' && path === 'data/library.json') path = '../escape.json';
    if (scenario === 'invalid-utf8' && definition.id === 'library-core' && path === 'data/library.json') value = Buffer.from([0xc3, 0x28]);
    const bytes = Buffer.isBuffer(value) ? value : json(value); await put(`${dir}/${path}`, bytes);
    records.push(fileRecord(path, bytes, contentType, contentType === 'application/json' ? { encoding:'utf-8' } : extra));
  }
  if (scenario === 'oversized-file' && definition.id === 'library-core') records[0].bytes = 20 * 1024 * 1024 + 1;
  const schemaVersion = scenario === 'unknown-schema' && definition.id === 'library-core' ? 'svetlost33-module-manifest-99' : 'svetlost33-module-manifest-2';
  const manifest = json({ schema_version:schemaVersion, module_id:definition.id, module_type:definition.type, version:definition.version, revision:1, key_id:keyId, capabilities:definition.capabilities, dependencies:definition.dependencies, files:records });
  await put(`${dir}/manifest.json`, manifest); await put(`${dir}/manifest.sig`, signed(manifest, privateKey));
  moduleEntries.push({ module_id:definition.id, module_type:definition.type, version:definition.version, required:definition.required, manifest_path:`${dir}/manifest.json`, manifest_bytes:manifest.length, manifest_sha256:sha256(manifest), signature_path:`${dir}/manifest.sig` });
}
if (scenario === 'missing-dependency') moduleEntries.splice(moduleEntries.findIndex(entry => entry.module_id === 'library-core'), 1);
if (scenario === 'duplicate-id') moduleEntries.push({ ...moduleEntries[0] });
const releaseSet = json({ schema_version:'svetlost33-release-set-2', release_set_id:'fixture-release-2026-r1', sequence:1, channel:'production', key_id:keyId, approved_platforms:['android','ios'], min_clients:{android:10,ios:'0.15.0'}, modules:moduleEntries });
await put('release-set.json', releaseSet); await put('release-set.sig', signed(releaseSet, privateKey));
const index = json({ schema_version:'svetlost33-m0-index-2', sequence:1, issued_at:'2026-09-15T00:00:00Z', expires_at:'2027-09-15T00:00:00Z', key_id:scenario === 'unknown-key' ? 'svetlost33-unknown-key-1' : keyId, channels:{production:{release_set_id:'fixture-release-2026-r1',path:'release-set.json',bytes:releaseSet.length,sha256:sha256(releaseSet),signature_path:'release-set.sig'}} });
await put('index.json', index); await put('index.sig', signed(index, privateKey));
if (scenario === 'bad-signature') await put('index.sig', Buffer.from('AAAA\n'));
if (scenario === 'bad-hash') {
  const target = resolve(out, 'modules/library-core/data/library.json');
  await writeFile(target, Buffer.concat([await readFile(target), Buffer.from(' ')]));
}
console.log(`Generated signed M0 v2 ${scenario} fixture at ${out}; private key was not written.`);
