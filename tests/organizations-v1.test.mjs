import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OrganizationsValidationError, ORGANIZATIONS_MODULE, validateOrganizationsRegistry, validateOrganizationsFile, validateOfficialHttpsUrl } from '../scripts/validate-organizations-v1.mjs';

const fixtures = JSON.parse(await readFile(new URL('../fixtures/organizations-v1/cases.json', import.meta.url), 'utf8'));
const candidateURL = new URL('../fixtures/organizations-v1/registry.candidate.json', import.meta.url);
const candidate = JSON.parse(await readFile(candidateURL, 'utf8'));
const tokens = pointer => pointer.split('/').slice(1).map(value => value.replace(/~1/g, '/').replace(/~0/g, '~'));
const at = (document, pointer) => tokens(pointer).reduce((value, key) => value[key], document);
function patch(document, operations) {
  for (const operation of operations) {
    const keys = tokens(operation.path);
    const key = keys.pop();
    const parent = keys.reduce((value, part) => value[part], document);
    if (operation.op === 'remove') {
      assert.ok(Object.hasOwn(parent, key));
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (operation.op === 'replace') {
      assert.ok(Object.hasOwn(parent, key));
      parent[key] = structuredClone(operation.value);
    } else if (operation.op === 'add' || operation.op === 'copy') {
      const value = structuredClone(operation.op === 'copy' ? at(document, operation.from) : operation.value);
      if (Array.isArray(parent)) parent.splice(key === '-' ? parent.length : Number(key), 0, value);
      else parent[key] = value;
    } else throw new Error(`Unsupported fixture operation ${operation.op}`);
  }
  return document;
}
const allActions = result => result.organizations.flatMap(org => [...org.links, ...org.payment_rails]);
const enabled = (result, kind) => result.organizations.flatMap(org => org[kind].filter(action => action.enabled).map(action => `${org.id}/${action.id}`));

test('portable organizations-v1 wire cases', async t => {
  assert.equal(fixtures.test_only, true);
  assert.equal(new Set(fixtures.cases.map(value => value.id)).size, fixtures.cases.length);
  for (const fixture of fixtures.cases) {
    await t.test(fixture.id, () => {
      const input = patch(structuredClone(fixture.base === 'candidate' ? candidate : fixtures.synthetic_registry), fixture.patch);
      // Per-case options replace individual top-level options; nested moduleContext
      // is replaced in full. Mutations are RFC 6902 operations on the base document.
      const options = { ...structuredClone(fixtures.default_options), ...structuredClone(fixture.options || {}) };
      const expected = fixture.expected;
      if (expected.error) {
        assert.throws(() => validateOrganizationsRegistry(input, options), error =>
          error instanceof OrganizationsValidationError && error.code === expected.error);
        return;
      }
      const result = validateOrganizationsRegistry(input, options);
      assert.equal(result.valid, expected.valid);
      if (Object.hasOwn(expected, 'registry_eligible')) assert.equal(result.registry_eligible, expected.registry_eligible);
      if (expected.all_disabled) assert.ok(allActions(result).every(action => !action.enabled));
      if (expected.enabled_links) assert.deepEqual(enabled(result, 'links'), expected.enabled_links);
      if (expected.enabled_rails) assert.deepEqual(enabled(result, 'payment_rails'), expected.enabled_rails);
      if (expected.blocker) assert.ok([...result.blockers, ...allActions(result).flatMap(action => action.blockers)].includes(expected.blocker));
    });
  }
});

test('real candidate has the agreed distinct IDs, draft links, no payment rails or logo claim', async () => {
  assert.deepEqual(candidate.organizations.map(org => org.id), ['nurdor-rs', 'norbs-plus-rs', '28-jun-rs']);
  assert.equal(candidate.organizations[1].legal_name, 'Fondacija NORBS Plus');
  assert.equal(candidate.organizations[2].legal_name, null);
  for (const org of candidate.organizations) {
    assert.equal(org.status, 'draft');
    assert.deepEqual(org.payment_rails, []);
    assert.ok(org.links.every(link => link.status === 'draft' && link.verified_at === null && link.valid_until === null));
    assert.ok(org.sources.every(source => source.fetched_on === '2026-09-18'));
    assert.ok(!Object.hasOwn(org, 'logo'));
  }
  const result = await validateOrganizationsFile(candidateURL, { now: fixtures.default_options.now });
  assert.equal(result.valid, true);
  assert.equal(result.registry_eligible, false);
  assert.ok(allActions(result).every(action => !action.enabled));
});

test('time-dependent eligibility is recalculated on use without mutating payload', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  const before = JSON.stringify(input);
  let instant = '2026-10-18T11:59:59Z';
  const options = { ...fixtures.default_options, now: () => instant };
  assert.equal(enabled(validateOrganizationsRegistry(input, options), 'payment_rails').length, 2);
  instant = '2026-10-18T12:00:00Z';
  assert.equal(enabled(validateOrganizationsRegistry(input, options), 'payment_rails').length, 0);
  assert.equal(JSON.stringify(input), before);
});

test('URL policy rejects parser normalization and unsafe network destinations', () => {
  for (const url of [
    'https://@example.org/', 'https://example.org/#', 'https://example.org:443/',
    'https://EXAMPLE.ORG/', 'https://example.org./', 'https://example.org\\@evil.test/',
    'https://%65xample.org/', 'https://127.1/', 'https://[::1]/', 'https://localhost/',
    'https://host.internal/', 'https://xn--test-pqa.org/', 'https://example.org/%0d%0a',
    'https://example.org/%5Cpath', 'https://example.org/ with-space', 'file:///tmp/data',
    'intent://bank', 'data:text/html,text', 'https://example.org/'
  ]) assert.equal(validateOfficialHttpsUrl(url), false, url);
  assert.equal(validateOfficialHttpsUrl('https://example.org/test-only', { allowSynthetic: true }), true);
  assert.equal(validateOfficialHttpsUrl('https://www.nurdor.org/podrzi-nurdor'), true);
  assert.equal(validateOfficialHttpsUrl('https://norbs.rs/fondacija-norbs-plus/'), true);
  assert.equal(validateOfficialHttpsUrl('https://28jun.org/'), true);
});

test('synthetic fixture cannot be relabeled reviewed to enable real donation actions', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  input.dataset_kind = 'reviewed';
  assert.throws(() => validateOrganizationsRegistry(input, fixtures.default_options), error => error.code === 'URL');
});

test('mixed rails stay independently eligible when one review expires', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  input.organizations[0].payment_rails[0].valid_until = fixtures.default_options.now;
  const result = validateOrganizationsRegistry(input, fixtures.default_options);
  assert.deepEqual(enabled(result, 'payment_rails'), ['synthetic-org/synthetic-swift']);
  assert.deepEqual(enabled(result, 'links'), ['synthetic-org/synthetic-donation-link']);
});

test('module context requires optional organizations identity and exact payload path', () => {
  assert.equal(ORGANIZATIONS_MODULE.required, false);
  for (const mutation of [{ required: true }, { payload_path: '../data/organizations-v1.json' }, { module_type: 'library' }, { capabilities: [] }]) {
    assert.throws(() => validateOrganizationsRegistry(fixtures.synthetic_registry, {
      ...fixtures.default_options, moduleContext: { ...fixtures.default_options.moduleContext, ...mutation }
    }), error => error.code === 'MODULE_CONTEXT');
  }
});

test('a malformed optional registry yields fixed safe error codes without exposing banking/URL fields', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  input.organizations[0].links[0].url = 'https://secret:secret@example.org/path';
  assert.throws(() => validateOrganizationsRegistry(input, fixtures.default_options), error => {
    assert.equal(error.code, 'URL');
    assert.equal(error.message, 'URL: /organizations/0/links/0/url');
    assert.doesNotMatch(error.message, /secret|example/);
    return true;
  });
});

test('logo needs reviewed rights and exact authenticated manifest media metadata', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  const descriptor = {
    path: 'media/synthetic-logo.png', sha256: 'a'.repeat(64), content_type: 'image/png', width: 32, height: 32,
    rights: {
      license: 'SYNTHETIC TEST ONLY - NO REAL ASSET OR LICENSE',
      attribution: { 'sr-Latn': 'TEST ONLY', 'sr-Cyrl': 'САМО ТЕСТ' },
      source_ids: ['synthetic-source'], status: 'active',
      verified_at: '2026-09-17T12:00:00Z', valid_until: '2026-10-18T12:00:00Z'
    }
  };
  input.organizations[0].logo = descriptor;
  let result = validateOrganizationsRegistry(input, fixtures.default_options);
  assert.equal(result.organizations[0].logo.enabled, false);
  assert.ok(result.organizations[0].logo.blockers.includes('logo_file_unverified'));
  const options = {
    ...fixtures.default_options,
    moduleContext: {
      ...fixtures.default_options.moduleContext,
      files: [{ path: descriptor.path, sha256: descriptor.sha256, content_type: descriptor.content_type, image: { width: 32, height: 32 } }]
    }
  };
  result = validateOrganizationsRegistry(input, options);
  assert.equal(result.organizations[0].logo.enabled, true);
  input.organizations[0].logo.rights.status = 'revoked';
  result = validateOrganizationsRegistry(input, options);
  assert.equal(result.organizations[0].logo.enabled, false);
  assert.ok(result.organizations[0].logo.blockers.includes('logo_rights_revoked'));
  assert.equal(enabled(result, 'payment_rails').length, 2);
  input.organizations[0].logo.path = 'media/test/../logo.png';
  assert.throws(() => validateOrganizationsRegistry(input, options), error => error.code === 'LOGO_PATH');
});

test('agreed marker expiry blocks its rail and never rewrites a reference', () => {
  const fixture = fixtures.cases.find(value => value.id === 'agreed-purpose-marker');
  const input = patch(structuredClone(fixtures.synthetic_registry), fixture.patch);
  const rail = input.organizations[0].payment_rails[0];
  rail.details.model = '00';
  rail.details.reference = 'TEST ONLY';
  rail.source_marker.agreement.valid_until = fixtures.default_options.now;
  const before = JSON.stringify(input);
  const result = validateOrganizationsRegistry(input, fixtures.default_options);
  assert.equal(result.organizations[0].payment_rails[0].enabled, false);
  assert.ok(result.organizations[0].payment_rails[0].blockers.includes('marker_review_expired'));
  assert.equal(JSON.stringify(input), before);
});

test('payment-session freshness defaults to false, independently of cached authentication', () => {
  const options = { ...fixtures.default_options };
  delete options.paymentSessionFresh;
  const result = validateOrganizationsRegistry(fixtures.synthetic_registry, options);
  assert.equal(result.registry_eligible, true);
  assert.ok(allActions(result).every(action => !action.enabled && action.blockers.includes('payment_session_not_fresh')));
});

test('marker final purpose and payee combined length enforce domestic bounds', () => {
  const fixture = fixtures.cases.find(value => value.id === 'agreed-purpose-marker');
  const input = patch(structuredClone(fixtures.synthetic_registry), fixture.patch);
  input.organizations[0].payment_rails[0].source_marker.value = 'TEST ONLY MARKER TOO LONG';
  assert.throws(() => validateOrganizationsRegistry(input, fixtures.default_options), error => error.code === 'DOMESTIC_PURPOSE');
  const another = structuredClone(fixtures.synthetic_registry);
  another.organizations[0].payment_rails[0].payee.address = 'TEST ONLY '.repeat(8);
  assert.throws(() => validateOrganizationsRegistry(another, fixtures.default_options), error => error.code === 'DOMESTIC_PAYEE_LENGTH');
});

test('unknown rail details are depth bounded before JSON serialization or rendering', () => {
  const input = structuredClone(fixtures.synthetic_registry);
  const rail = input.organizations[0].payment_rails[0];
  rail.type = 'future_rail';
  rail.details = {};
  let current = rail.details;
  for (let count = 0; count < 25; count++) { current.child = {}; current = current.child; }
  assert.throws(() => validateOrganizationsRegistry(input, fixtures.default_options), error => error.code === 'DEPTH');
});
