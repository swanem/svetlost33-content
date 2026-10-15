// Read-only inventory of the exact media handoff. Never edits or publishes images.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';

export const SOURCE_ROOT = resolve(import.meta.dirname,
  '../../../svetlo-figma-assets/praznici-prvih-sedam-v1');
export const SOURCE_MANIFEST_SHA256 = '0c7d361720a1b02456ebc29f8c5469a94b55771c39fc89715d425d13d4cc964c';
const IDS = ['pokrov', 'sveti-luka', 'vavedenje', 'badnji-dan', 'bogojavljenje', 'veliki-petak', 'vaskrs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeRelativePath(value) {
  assert.equal(typeof value, 'string');
  assert(value.length > 0 && value.length <= 160 && !value.startsWith('/') && !value.includes('\\'));
  assert(value.split('/').every(part => part && part !== '.' && part !== '..'));
  return value;
}

async function sourceBytes(root, path, maximum = 20 * 1024 * 1024) {
  const target = resolve(root, safeRelativePath(path));
  const stat = await lstat(target);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Not a regular file: ${path}`);
  const inside = relative(await realpath(root), await realpath(target));
  assert(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith(sep));
  assert(stat.size > 0 && stat.size <= maximum, `Size limit: ${path}`);
  return readFile(target);
}

export async function inspectSource(root = SOURCE_ROOT) {
  const manifestBytes = await sourceBytes(root, 'manifest.json', 256 * 1024);
  assert.equal(hash(manifestBytes), SOURCE_MANIFEST_SHA256, 'Source manifest changed; create a new reviewed revision');
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest.items.map(item => item.id), IDS);
  const items = [];
  for (const item of manifest.items) {
    const variants = {};
    for (const variant of ['clean', 'named']) {
      const expected = item[variant];
      const bytes = await sourceBytes(root, expected.path);
      assert.equal(bytes.length, expected.bytes, `${item.id}/${variant} bytes`);
      assert.equal(hash(bytes), expected.sha256, `${item.id}/${variant} hash`);
      const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 16_000_000 }).metadata();
      const decoded = await sharp(bytes, { failOn: 'error', limitInputPixels: 16_000_000 })
        .raw().toBuffer({ resolveWithObject: true });
      assert.equal(metadata.format, 'png');
      assert.equal(metadata.pages ?? 1, 1);
      assert.equal(decoded.info.width, expected.width);
      assert.equal(decoded.info.height, expected.height);
      assert(expected.width <= 4096 && expected.height <= 4096);
      variants[variant] = { ...expected, content_type: 'image/png', full_decode: 'passed' };
    }
    const prompt = await sourceBytes(root, item.prompt_file, 256 * 1024);
    items.push({
      id: `feast-${item.id}`, source_id: item.id, title: item.title, caption: item.caption,
      appearance: item.appearance, variants,
      prompt: { path: item.prompt_file, sha256: hash(prompt) },
      provenance: { kind: 'ai_generated', engine: manifest.engine, created_on: manifest.created_date },
      review: { visual_clean: 'reviewed_for_candidate', source_qa: item.qa.visual_review,
        device_crop: 'pending', caption_overlay: 'pending', owner_exact_revision: 'pending' },
      calendar_binding: null, auto_rotation: false,
    });
  }
  const candidate = {
    schema_version: 'svetlost33-media-review-candidate-1',
    candidate_id: 'feast-backgrounds-2026-09-30-r1',
    status: 'local_review_only', production_release: false,
    approved_platforms: [], intended_platforms: ['android', 'ios'],
    source: { directory: 'svetlo-figma-assets/praznici-prvih-sedam-v1',
      manifest_sha256: SOURCE_MANIFEST_SHA256 },
    application_variant: 'clean',
    clean_original_bytes: items.reduce((sum, item) => sum + item.variants.clean.bytes, 0),
    all_original_bytes: items.reduce((sum, item) => sum + item.variants.clean.bytes + item.variants.named.bytes, 0),
    dates_imported_as_runtime_rules: false,
    rights: { provenance: 'first_party_ai_generation', license_label: null,
      distribution_review: 'pending', territories: [],
      note: 'Image prompts are provenance, not a CC0 or public-domain license; no third-party license is inferred.' },
    unchanged_existing_approval_id: 'shared-backgrounds-v1-2026-09-16',
    items,
  };
  assert.equal(candidate.clean_original_bytes, 17_414_965);
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(await inspectSource(), null, 2)}\n`);
}
