import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateOrganizationsRegistry } from '../../scripts/validate-organizations-v1.mjs';

const root = new URL('./', import.meta.url);
const repo = new URL('../../', import.meta.url);
const json = async (path, base = root) => JSON.parse(await readFile(new URL(path, base), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = await json('data/organizations-v1.json');
const baseline = await json('baseline.json');
const review = await json('evidence/source-review.json');
const manifest = await json('manifest.json');
const old = await json(baseline.organizations.payload_path, repo);
const context = { module_type: 'organizations', required: false, capabilities: ['organizations-v1'],
  payload_path: 'data/organizations-v1.json', version: candidate.version, revision: candidate.revision };
const options = { now: candidate.issued_at, contentAuthenticated: true, paymentSessionFresh: true,
  clientCapabilities: ['organizations-v1'], moduleContext: context };
// Simulated policy states only: never written, signed, or treated as content approval.
const modeledReviewed = () => {
  const model = structuredClone(candidate); model.dataset_kind = 'reviewed';
  model.organizations.forEach(org => { org.status = 'active'; org.links.forEach(link => { link.status = 'active'; }); });
  return model;
};

test('draft schema is valid and no action is enabled even under a modeled authenticated context', () => {
  const result = validateOrganizationsRegistry(candidate, options);
  assert.equal(result.valid, true); assert.equal(result.registry_eligible, false);
  assert.ok(result.blockers.includes('candidate_only'));
  assert.ok(result.organizations.every(org => org.links.every(link => !link.enabled)));
});

test('all three stable identities, six old URLs and neutral-logo/no-payment-rail scope survive', () => {
  assert.deepEqual(candidate.organizations.map(x => x.id), old.organizations.map(x => x.id));
  assert.equal(candidate.organizations.flatMap(x => x.links).length, 15);
  for (const org of candidate.organizations) {
    const previous = old.organizations.find(x => x.id === org.id);
    for (const field of ['name', 'description', 'legal_name', 'country', 'payment_rails', 'logo']) {
      assert.deepEqual(org[field], previous[field]);
    }
    assert.equal(org.logo, null); assert.deepEqual(org.payment_rails, []);
    for (const link of previous.links) {
      const next = org.links.find(x => x.id === link.id);
      for (const field of ['id', 'kind', 'label', 'url', 'source_ids']) assert.deepEqual(next[field], link[field]);
    }
  }
});

test('nine additions are explicitly attested by official pages and every destination was fetched', () => {
  assert.equal(review.new_links.length, 9);
  const successful = new Map(review.http_checks.filter(x => x.status === 200).map(x => [x.url, x]));
  for (const org of candidate.organizations) for (const link of org.links) {
    assert.ok(successful.has(link.url), link.id);
    assert.equal(successful.get(link.url).final_url, link.url);
  }
  for (const link of review.new_links) {
    const org = candidate.organizations.find(x => x.id === link.organization_id);
    assert.equal(org.links.find(x => x.id === link.id).url, link.url);
    assert.ok(successful.has(link.official_source));
    if (!link.id.endsWith('-website')) {
      const sources = review.http_checks.filter(x => x.url === link.official_source ||
        (link.organization_id === 'nurdor-rs' && x.url === 'https://www.nurdor.org/identifikacioni-podaci'));
      assert.ok(sources.some(x => x.social_hrefs?.includes(link.url)), link.id);
    }
  }
});

test('review interval is exactly 30 days with one timestamp per link', () => {
  assert.equal(Date.parse(candidate.expires_at) - Date.parse(candidate.issued_at), 30 * 86400000);
  for (const org of candidate.organizations) for (const link of org.links) {
    assert.equal(link.verified_at, candidate.issued_at); assert.equal(link.valid_until, candidate.expires_at);
  }
});

test('modeled future approval preserves freshness requirement for donation only', () => {
  const fresh = validateOrganizationsRegistry(modeledReviewed(), options);
  assert.ok(fresh.organizations.every(x => x.links.every(link => link.enabled)));
  const stale = validateOrganizationsRegistry(modeledReviewed(), { ...options, paymentSessionFresh: false });
  const links = stale.organizations.flatMap(x => x.links);
  assert.equal(links.filter(x => x.enabled).length, 12);
  assert.ok(links.filter(x => x.kind === 'donation').every(x => x.blockers.includes('payment_session_not_fresh')));
  const unauthenticated = validateOrganizationsRegistry(modeledReviewed(), { ...options, contentAuthenticated: false });
  assert.ok(unauthenticated.organizations.every(x => x.links.every(link => !link.enabled)));
});

test('expiry boundary and withdrawal block actions without affecting unrelated organizations', () => {
  const model = modeledReviewed();
  const before = validateOrganizationsRegistry(model, { ...options, now: Date.parse(candidate.expires_at) - 1 });
  assert.equal(before.registry_eligible, true);
  const expired = validateOrganizationsRegistry(model, { ...options, now: candidate.expires_at });
  assert.ok(expired.blockers.includes('registry_expired'));
  assert.ok(expired.organizations.every(x => x.links.every(link => !link.enabled)));
  model.organizations[0].status = 'revoked';
  const revoked = validateOrganizationsRegistry(model, options);
  assert.ok(revoked.organizations[0].links.every(x => !x.enabled));
  assert.ok(revoked.organizations.slice(1).every(x => x.links.every(link => link.enabled)));
});

test('S10 baseline remains intact and all six non-charity descriptors are pinned', async () => {
  assert.equal(hash(await readFile(new URL(baseline.index.path, repo))), baseline.index.sha256);
  assert.equal(hash(await readFile(new URL(baseline.release_set.path, repo))), baseline.release_set.sha256);
  assert.equal(hash(await readFile(new URL(baseline.organizations.payload_path, repo))), baseline.organizations.payload_sha256);
  const release = await json(baseline.release_set.path, repo);
  assert.equal(release.sequence, 10); assert.equal(baseline.new_sequence, null);
  assert.deepEqual(release.modules.filter(x => x.module_id !== 'organizations-v1'), baseline.preserve_modules);
  assert.equal(baseline.preserve_modules.length, 6);
});

test('manifest schema and every proposed file hash match; no signing or production-ready release exists', async () => {
  const schema = await json('schemas/v2/module-manifest.schema.json', repo);
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.equal(manifest.key_id, 'unsigned-candidate');
  assert.deepEqual(manifest.capabilities, ['organizations-v1']);
  assert.equal(manifest.version, candidate.version); assert.equal(manifest.revision, candidate.revision);
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(file.path, root));
    assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
  }
  for (const absent of ['manifest.sig', 'index.json', 'index.sig', 'release-set.json', 'release-set.sig']) {
    await assert.rejects(access(new URL(absent, root)));
  }
  const lock = await json('candidate-lock.json');
  assert.equal(lock.signed, false); assert.equal(lock.approved, false);
  for (const file of lock.files) assert.equal(hash(await readFile(new URL(file.path, root))), file.sha256);
});
