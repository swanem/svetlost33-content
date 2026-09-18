#!/usr/bin/env node
import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, KEY_ID, PUBLIC_KEY_SHA256, CAPABILITIES, json, sha256, readTree, writeNewTree } from './prepare-charity-release-v2.mjs';
import { validateRelease } from './validate-m0-v2.mjs';
import { evaluateWidgetExcerpt } from './validate-widget-excerpt-v1.mjs';

export const EXCERPT_RELEASE_ID = 'shared-widget-excerpts-2026-09-18-m0v2-s4';
export const S3_RELEASE_ID = 'shared-charity-2026-09-18-m0v2-s3';
export const S3_INDEX_PATH = `discovery-archive/${S3_RELEASE_ID}/index.json`;
export const S3_SIGNATURE_PATH = `discovery-archive/${S3_RELEASE_ID}/index.sig`;
export const EXCERPT_APPROVAL_PATH = 'approvals/widget-excerpts-five-2026-09-18/approval.json';
export const EXCERPT_APPROVAL_SHA256 = '1f6808e6cc226612341c07160fa97960103bce86ba350a612b3c02409fe6a8c9';
const INVENTORY_SHA256 = 'bde60e6987e501ce6a003a6bf572d95585e822ee446b50eb3668d1c20ed992d4';
const same = (a, b, label) => { if (a !== b) throw new Error(`${label} differs from the approved immutable source`); };
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), content_type: 'application/json', encoding: 'utf-8' });

export async function defaultExcerptSource() {
  const published = resolve(BASE, `releases/${S3_RELEASE_ID}/release-set.json`);
  return await lstat(published).catch(() => null) ? BASE : resolve(ROOT, 'build/charity-v0243-signed');
}

export async function loadS3Source(sourceDirectory) {
  const tree = await readTree(sourceDirectory);
  const inventoryBytes = await readFile(resolve(ROOT, 'approvals/widget-excerpts-five-2026-09-18/s3-source-files.json'));
  same(sha256(inventoryBytes), INVENTORY_SHA256, 'S3 source inventory');
  const inventory = JSON.parse(inventoryBytes);
  const files = new Map();
  const hasArchive = tree.has(S3_INDEX_PATH) && tree.has(S3_SIGNATURE_PATH);
  for (const item of inventory.files) {
    const actual = hasArchive && item.path === 'index.json' ? S3_INDEX_PATH : hasArchive && item.path === 'index.sig' ? S3_SIGNATURE_PATH : item.path;
    const bytes = tree.get(actual);
    if (!bytes) throw new Error(`Missing frozen S3 input: ${actual}`);
    same(bytes.length, item.bytes, 'S3 input length');
    same(sha256(bytes), item.sha256, 'S3 input hash');
    files.set(item.path, bytes);
  }
  same(sha256(files.get('trusted-public-key.pem')), PUBLIC_KEY_SHA256, 'Existing production public key');
  return { files, hasArchive };
}

export async function createWidgetExcerptPlan({ now = new Date().toISOString(), sourceDirectory } = {}) {
  sourceDirectory ||= await defaultExcerptSource();
  const source = await loadS3Source(sourceDirectory);
  for (const [platform, clientVersion] of [['android', 35], ['ios', '0.1.0']]) {
    await validateRelease(sourceDirectory, { now, platform, clientVersion, trustedKeyId: KEY_ID, clientCapabilities: CAPABILITIES,
      ...(source.hasArchive ? { indexPath: S3_INDEX_PATH, indexSignaturePath: S3_SIGNATURE_PATH } : {}) });
  }
  const oldIndex = JSON.parse(source.files.get('index.json'));
  same(oldIndex.sequence, 3, 'Base sequence');
  const oldSet = JSON.parse(source.files.get(oldIndex.channels.production.path));
  const oldCycles = oldSet.modules.find(module => module.module_id === 'daily-cycles-r1');
  const library = oldSet.modules.find(module => module.module_id === 'library-annual-2026-r1');
  const oldManifest = JSON.parse(source.files.get(oldCycles.manifest_path));
  const approvalBytes = await readFile(resolve(ROOT, EXCERPT_APPROVAL_PATH));
  same(sha256(approvalBytes), EXCERPT_APPROVAL_SHA256, 'Exact five-pair approval');
  const approval = JSON.parse(approvalBytes);
  same(approval.approval_id, 'shared-widget-excerpts-five-2026-09-18-r1', 'Excerpt approval identity');
  const newFiles = [];
  for (const entry of approval.resulting_payloads) {
    const bytes = await readFile(resolve(ROOT, entry.path));
    same(bytes.length, entry.bytes, 'Approved cycle length');
    same(sha256(bytes), entry.sha256, 'Approved cycle hash');
    const cycle = JSON.parse(bytes);
    const filename = `data/legacy-cycle.${entry.locale}.json`;
    const oldBytes = source.files.get(`${dirname(oldCycles.manifest_path)}/${filename}`);
    const psalms = JSON.parse(source.files.get(`${dirname(library.manifest_path)}/data/psalms.${entry.locale}.json`));
    const stripped = structuredClone(cycle);
    let count = 0;
    for (const slot of stripped.days.flatMap(day => day.slots)) {
      const excerpt = slot.quote.widget_excerpt;
      if (excerpt === undefined) continue;
      count += 1;
      const approved = approval.approved_excerpts.find(value => value.source_slot_id === slot.id && value.locale === entry.locale);
      if (!approved) throw new Error('An unapproved slot has an excerpt');
      const expected = { ...approved }; delete expected.character_count; delete expected.source_snapshot_sha256;
      same(JSON.stringify(excerpt), JSON.stringify(expected), 'Exact approved optional object');
      const psalm = psalms.psalms.find(psalm => psalm.id === slot.quote.psalm_id);
      const evaluation = evaluateWidgetExcerpt(excerpt, { contentAuthenticated: true, locale: entry.locale, slotId: slot.id, quote: slot.quote, psalm });
      if (!evaluation.eligible) throw new Error(`Excerpt binding rejected: ${evaluation.reason}`);
      delete slot.quote.widget_excerpt;
    }
    same(count, 5, 'Approved excerpt count per script');
    if (!json(stripped).equals(oldBytes)) throw new Error('Full source cycle changed beyond the approved optional objects');
    newFiles.push([filename, bytes]);
  }
  newFiles.push(['evidence/widget-excerpt-owner-approval.json', approvalBytes]);
  const files = new Map(source.files);
  files.set(S3_INDEX_PATH, source.files.get('index.json'));
  files.set(S3_SIGNATURE_PATH, source.files.get('index.sig'));
  files.delete('index.sig');
  const prefix = `releases/${EXCERPT_RELEASE_ID}`;
  const moduleDirectory = `${prefix}/modules/daily-cycles-r1-2026.1.2-r3`;
  for (const [path, bytes] of newFiles) files.set(`${moduleDirectory}/${path}`, bytes);
  const manifestBytes = json({ ...oldManifest, version: '2026.1.2', revision: 3, files: newFiles.map(([path, bytes]) => record(path, bytes)) });
  const manifestPath = `${moduleDirectory}/manifest.json`;
  files.set(manifestPath, manifestBytes);
  const cyclesEntry = { ...oldCycles, version: '2026.1.2', manifest_path: manifestPath, manifest_bytes: manifestBytes.length,
    manifest_sha256: sha256(manifestBytes), signature_path: `${moduleDirectory}/manifest.sig` };
  const releasePath = `${prefix}/release-set.json`, releaseSignaturePath = `${prefix}/release-set.sig`;
  const releaseBytes = json({ ...oldSet, release_set_id: EXCERPT_RELEASE_ID, sequence: 4,
    min_clients: { android: 35, ios: '0.1.0' }, modules: oldSet.modules.map(module => module.module_id === 'daily-cycles-r1' ? cyclesEntry : module) });
  files.set(releasePath, releaseBytes);
  const indexBytes = json({ ...oldIndex, sequence: 4, issued_at: '2026-09-18T12:31:45Z',
    channels: { production: { release_set_id: EXCERPT_RELEASE_ID, path: releasePath, bytes: releaseBytes.length, sha256: sha256(releaseBytes), signature_path: releaseSignaturePath } } });
  files.set('index.json', indexBytes);
  const request = {
    schema_version: 'svetlost33-signing-request-1', state: 'UNSIGNED_CANDIDATE', release_set_id: EXCERPT_RELEASE_ID,
    sequence: 4, key_id: KEY_ID, expected_public_key_sha256: PUBLIC_KEY_SHA256,
    source_index_sha256: sha256(source.files.get('index.json')), source_release_sha256: oldIndex.channels.production.sha256,
    approval_sha256: EXCERPT_APPROVAL_SHA256, signature_algorithm: 'RSA-PSS-SHA256', salt_length: 32,
    signature_encoding: 'base64-with-final-newline', minimum_clients: { android: 35, ios: '0.1.0' },
    documents_to_sign: [[manifestPath, cyclesEntry.signature_path], [releasePath, releaseSignaturePath], ['index.json', 'index.sig']].map(([path, signature_path]) => ({ path, signature_path, bytes: files.get(path).length, sha256: sha256(files.get(path)) })),
    unchanged_active_module_ids: ['library-annual-2026-r1', 'calendar-2026-r1', 'organizations-v1'],
    compatibility_note: 'Android below 35 must retain its prior local content. Android 35 uses verified M0 file records for annual projection. iOS 0.1.0 ignores unknown optional quote fields. No existing source manifest is rewritten.',
    all_candidate_files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
  files.set('signing-request.json', json(request));
  return { files, request };
}

export async function prepareWidgetExcerptRelease(out, options = {}) {
  const plan = await createWidgetExcerptPlan(options);
  await writeNewTree(out, plan.files);
  return plan.request;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--out', '--source'].includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error('Usage: node scripts/prepare-widget-excerpts-v2.mjs --out <new-directory> [--source <signed-s3-or-later-root>]');
    values.set(args[i], args[i + 1]);
  }
  if (!values.has('--out')) throw new Error('A new output directory is required');
  const result = await prepareWidgetExcerptRelease(values.get('--out'), { sourceDirectory: values.get('--source') });
  console.log(`Prepared unsigned ${result.release_set_id}; exactly five excerpt pairs, three new detached signatures required. No private key accessed.`);
}
