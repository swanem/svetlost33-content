import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateOrganizationsRegistry } from '../scripts/validate-organizations-v1.mjs';

const root = new URL('../', import.meta.url);
const payloadPath = 'modules/organizations-v1/2026.9.19-r2/data/organizations-v1.json';
const oldPath = 'modules/organizations-v1/2026.9.18-r1/data/organizations-v1.json';
const bytes = await readFile(new URL(payloadPath, root));
const payload = JSON.parse(bytes);
const original = JSON.parse(await readFile(new URL(oldPath, root), 'utf8'));
const sourceReview = JSON.parse(await readFile(new URL('approvals/charity-details-2026-09-19/source-review.json', root), 'utf8'));
const decision = JSON.parse(await readFile(new URL('approvals/charity-details-2026-09-19/decision-draft.json', root), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const reviewedAt = '2026-09-19T10:23:18Z';
const expiresAt = '2026-10-18T10:35:15Z';
const expectedNewLinks = [
  ['nurdor-rs', 'nurdor-website', 'website', 'https://www.nurdor.org/'],
  ['nurdor-rs', 'nurdor-instagram', 'social', 'https://www.instagram.com/nurdor_srbija/'],
  ['nurdor-rs', 'nurdor-facebook', 'social', 'https://www.facebook.com/nurdor/'],
  ['norbs-plus-rs', 'norbs-plus-website', 'website', 'https://norbs.rs/fondacija-norbs-plus/'],
  ['norbs-plus-rs', 'norbs-plus-instagram', 'social', 'https://www.instagram.com/norbsplus/'],
  ['norbs-plus-rs', 'norbs-plus-facebook', 'social', 'https://www.facebook.com/NORBSPlus'],
  ['srbi-za-srbe-rs', 'srbi-za-srbe-website', 'website', 'https://www.srbizasrbe.org/'],
  ['srbi-za-srbe-rs', 'srbi-za-srbe-instagram', 'social', 'https://www.instagram.com/srbizasrbe'],
  ['srbi-za-srbe-rs', 'srbi-za-srbe-facebook', 'social', 'https://www.facebook.com/srbizasrbe']
];
const allLinks = result => result.organizations.flatMap(org => org.links);
// Editorial preflight only: these explicit assumptions exercise future client
// eligibility. They neither authenticate this unsigned file nor create a release.
const editorialOptions = {
  now: reviewedAt,
  contentAuthenticated: true,
  clientCapabilities: ['organizations-v1'],
  moduleContext: {
    module_type: 'organizations', required: false, capabilities: ['organizations-v1'],
    payload_path: 'data/organizations-v1.json', version: '2026.9.19', revision: 2,
    files: []
  }
};

test('profile r2 preserves pinned source, approvals and current signed discovery bytes', async () => {
  assert.equal(sourceReview.preserved_files.length, 7);
  for (const record of sourceReview.preserved_files) {
    const preserved = await readFile(new URL(record.path, root));
    assert.equal(preserved.length, record.bytes, record.path);
    assert.equal(sha256(preserved), record.sha256, record.path);
  }
  assert.equal(sha256(await readFile(new URL(oldPath, root))),
    '4654b5c05b7c4e0ada963d022491c8683ac9d329c5db937a522925f6d10d89d7');
});

test('profile r2 changes only version, issue time and the nine sourced website/social links', () => {
  assert.equal(payload.schema_version, original.schema_version);
  assert.equal(payload.dataset_kind, 'reviewed');
  assert.equal(payload.version, '2026.9.19');
  assert.equal(payload.revision, 2);
  assert.equal(payload.issued_at, reviewedAt);
  assert.equal(payload.expires_at, original.expires_at);
  assert.equal(payload.expires_at, expiresAt);
  assert.deepEqual(payload.organizations.map(org => org.id), ['nurdor-rs', 'norbs-plus-rs', 'srbi-za-srbe-rs']);
  const additions = [];
  for (let index = 0; index < original.organizations.length; index += 1) {
    const before = original.organizations[index];
    const after = payload.organizations[index];
    const { sources: beforeSources, links: beforeLinks, ...beforeIdentity } = before;
    const { sources: afterSources, links: afterLinks, ...afterIdentity } = after;
    assert.deepEqual(afterIdentity, beforeIdentity);
    assert.deepEqual(afterSources.slice(0, beforeSources.length), beforeSources);
    assert.deepEqual(afterLinks.slice(0, beforeLinks.length), beforeLinks);
    assert.equal(afterSources.length, beforeSources.length + 1);
    assert.equal(afterLinks.length, beforeLinks.length + 3);
    assert.deepEqual(after.payment_rails, []);
    assert.equal(after.logo, null);
    const newSource = afterSources.at(-1);
    assert.equal(newSource.fetched_on, '2026-09-19');
    const evidence = sourceReview.organizations[index];
    assert.equal(evidence.organization_id, after.id);
    assert.equal(evidence.publishing_page, newSource.url);
    assert.equal(evidence.source_id, newSource.id);
    for (const link of afterLinks.slice(beforeLinks.length)) {
      assert.deepEqual(link.source_ids, [newSource.id]);
      assert.equal(link.status, 'active');
      assert.equal(link.verified_at, reviewedAt);
      assert.equal(link.valid_until, expiresAt);
      assert.equal(new URL(link.url).search, '');
      assert.equal(new URL(link.url).hash, '');
      additions.push([after.id, link.id, link.kind, link.url]);
    }
    assert.deepEqual(evidence.added_links.map(({ id, kind, url }) => [after.id, id, kind, url]), additions.slice(-3));
  }
  assert.deepEqual(additions, expectedNewLinks);
});

test('profile r2 evidence binds exact bytes without asserting logo rights or production activation', () => {
  for (const record of [sourceReview, decision]) {
    assert.deepEqual(record.payload_binding, {
      path: payloadPath, bytes: bytes.length, sha256: sha256(bytes), version: payload.version, revision: payload.revision
    });
  }
  assert.equal(decision.status, 'draft_for_coordinating_task_review');
  assert.equal(decision.logo_ui_scope_authorized, true);
  assert.equal(decision.third_party_logo_rights_verified, false);
  assert.equal(decision.review_limits.original_reviews_extended, false);
  assert.equal(decision.publication_state.unsigned, true);
  assert.ok(Object.entries(decision.publication_state).filter(([key]) => key !== 'unsigned').every(([, value]) => value === false));
  assert.equal(sourceReview.limits.independent_social_account_audit, false);
  assert.equal(sourceReview.limits.asset_downloaded, false);
  assert.equal(sourceReview.limits.production_signature_created, false);
  assert.equal(sourceReview.limits.published, false);
  assert.ok(sourceReview.logo_source_notes.every(note => note.rights_status === 'not_verified' && note.reusable_asset_approved === false));
});

test('unsigned profile r2 remains structurally valid but cannot enable runtime actions', () => {
  const result = validateOrganizationsRegistry(payload, { now: reviewedAt });
  assert.equal(result.valid, true);
  assert.equal(result.registry_eligible, false);
  assert.ok(result.blockers.includes('content_not_authenticated'));
  assert.ok(allLinks(result).every(link => !link.enabled));
});

test('editorial preflight preserves donation freshness gating and the original exclusive expiry', () => {
  const withoutFreshSession = validateOrganizationsRegistry(payload, editorialOptions);
  assert.equal(withoutFreshSession.registry_eligible, true);
  assert.equal(allLinks(withoutFreshSession).filter(link => link.enabled).length, 12);
  assert.ok(allLinks(withoutFreshSession).filter(link => link.kind === 'donation')
    .every(link => !link.enabled && link.blockers.includes('payment_session_not_fresh')));
  const withFreshSession = validateOrganizationsRegistry(payload, { ...editorialOptions, paymentSessionFresh: true });
  assert.equal(allLinks(withFreshSession).length, 15);
  assert.ok(allLinks(withFreshSession).every(link => link.enabled));
  assert.ok(withFreshSession.organizations.every(org => org.logo === null && org.payment_rails.length === 0));
  const expired = validateOrganizationsRegistry(payload, { ...editorialOptions, now: expiresAt, paymentSessionFresh: true });
  assert.equal(expired.registry_eligible, false);
  assert.ok(expired.blockers.includes('registry_expired'));
  assert.ok(allLinks(expired).every(link => !link.enabled));
});
