import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const approval = json('approvals/new-content-2026-09-30/owner-approval.json');
const item = id => approval.candidates.find(candidate => candidate.id === id);

test('one exact owner decision applies to both OS, not publication or future content', () => {
  assert.equal(approval.statement, 'odobri sav nov sadržaj');
  assert.equal(approval.status, 'OWNER_APPROVED_NOT_PUBLISHED');
  assert.deepEqual(approval.platforms, ['android', 'ios']);
  assert.deepEqual(approval.territories, ['RS', 'BA']);
  assert.equal(approval.candidates.length, 4);
  assert.equal(new Set(approval.candidates.map(x => x.id)).size, 4);
  for (const field of ['authorized_by_this_record', 'signed', 'published', 'active_discovery_changed',
    'release_sequence_reserved', 'native_app_release_authorized', 'device_install_authorized']) {
    assert.equal(approval.publication[field], false, field);
  }
  assert.equal(approval.snapshot_policy.future_unwritten_or_unfetched_content_approved, false);
  assert.equal(approval.rights_and_review.independent_legal_verification, false);
  assert.equal(approval.rights_and_review.clerical_review, null);
});

test('approved snapshots and their complete existing inventories retain exact hashes', () => {
  for (const candidate of approval.candidates) {
    const anchor = candidate.anchor;
    assert.match(anchor.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha(read(anchor.path)), anchor.sha256, anchor.path);
    const manifest = json(anchor.path);
    for (const file of manifest.files ?? []) {
      const resolved = resolve(root, dirname(anchor.path), file.path);
      const localPath = relative(root, resolved);
      assert.ok(!localPath.startsWith('..') && !isAbsolute(localPath));
      const bytes = readFileSync(resolved);
      assert.equal(bytes.length, file.bytes, localPath);
      assert.equal(sha(bytes), file.sha256, localPath);
    }
  }
});

test('saints approval covers thirty exact new days and no complete saint-list claim', () => {
  const candidate = item('saints-next-window-2026-09-30-r1');
  const manifest = json(candidate.anchor.path);
  assert.equal(candidate.scope.new_short_articles, manifest.prepared_articles);
  assert.equal(candidate.scope.existing_articles_preserved, manifest.preserved_articles);
  assert.equal(candidate.scope.total_articles, manifest.total_articles);
  assert.equal(candidate.scope.window_start, manifest.window.start);
  assert.equal(candidate.scope.window_end, manifest.window.end);
  assert.equal(candidate.scope.complete_saint_list, false);
  assert.equal(candidate.scope.new_prayers_troparia_kontakia, 0);
  const inventory = json('drafts/saints-next-window-2026-09-30/inventory.json');
  for (const link of candidate.proposed_article_links) {
    const day = inventory.days.find(x => x.date === link.date);
    assert.equal(day.article_id, link.article_id);
    assert.ok(day.active_canonical_observance_ids.includes(link.observance_id));
    assert.equal(day.canonical_link_status, 'EXISTING_ID_LINK_REVIEW_PENDING');
  }
  assert.equal(manifest.owner_approval, null); // Historical snapshot is not rewritten.
  assert.equal(manifest.publication_authorized, false);
});

test('charity approval retains exact three identities, fifteen links and no payment/logos', () => {
  const candidate = item('charity-refresh-2026-09-30-r3');
  const data = json('drafts/charity-refresh-2026-09-30/data/organizations-v1.json');
  assert.deepEqual(data.organizations.map(x => x.id), candidate.scope.organization_ids);
  assert.equal(data.organizations.reduce((n, org) => n + org.links.length, 0), candidate.scope.total_links);
  assert.equal(data.version, candidate.scope.version);
  assert.equal(data.revision, candidate.scope.revision);
  for (const org of data.organizations) {
    assert.equal(org.logo, null);
    assert.deepEqual(org.payment_rails, []);
    assert.equal(org.status, 'draft');
  }
});

test('only seven clean image originals are approved for app use, without calendar or rotation', () => {
  const candidate = item('feast-backgrounds-2026-09-30-r1');
  const data = json(candidate.anchor.path);
  assert.deepEqual(data.items.map(x => x.id), candidate.scope.image_ids);
  assert.equal(data.items.length, candidate.scope.clean_original_count);
  assert.equal(data.clean_original_bytes, candidate.scope.clean_original_bytes);
  assert.equal(candidate.scope.application_variant, 'clean');
  assert.equal(candidate.scope.named_variants_in_application, false);
  assert.equal(candidate.scope.artwork_dates_as_runtime_calendar, false);
  assert.equal(candidate.scope.automatic_rotation_enabled, false);
  assert.equal(data.production_release, false);
});

test('radio approval excludes whole malformed rows and cannot imply liturgical assignment', () => {
  const candidate = item('radio-refresh-2026-09-30-r1');
  const data = json('drafts/radio-refresh-2026-09-30/candidate.json');
  assert.equal(candidate.owner_status, 'APPROVED_AS_RADIO_SOURCE_PROPOSALS_ONLY');
  assert.equal(candidate.scope.candidate_projection, 'valid_added');
  assert.equal(data.valid_added.length, candidate.scope.valid_new_rows);
  for (const row of data.valid_added) {
    assert.ok(!candidate.scope.malformed_dates_excluded.includes(row.date));
    assert.deepEqual(row.validation_errors, []);
    assert.equal(row.status, candidate.scope.classification);
    assert.equal(row.service_assignment_status, 'UNRESOLVED');
    assert.equal(row.production_eligible, false);
  }
  assert.equal(data.release_allowed, false);
  assert.equal(data.publication_authorized, false);
  assert.deepEqual(data.errored_observations.map(x => x.date).sort(),
    [...candidate.scope.malformed_dates_excluded].sort());
});
