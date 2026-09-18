#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const ORGANIZATIONS_MODULE = Object.freeze({
  module_type: 'organizations', required: false,
  capability: 'organizations-v1', payload_path: 'data/organizations-v1.json'
});
export const MAX_REGISTRY_BYTES = 256 * 1024;
const schema = JSON.parse(await readFile(new URL('../schemas/organizations-v1/registry.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateShape = ajv.compile(schema);

export class OrganizationsValidationError extends Error {
  constructor(code, path = '') {
    // Fixed codes and JSON paths only; never include banking details or raw URLs.
    super(`${code}${path ? `: ${path}` : ''}`);
    this.code = code;
    this.path = path;
  }
}
const fail = (code, path) => { throw new OrganizationsValidationError(code, path); };

export function validateOfficialHttpsUrl(value, { allowSynthetic = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('https://') ||
      /[\s\u0000-\u0020\u007f\\#]/u.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return false;
  const authority = value.slice(8).split(/[/?]/u, 1)[0];
  // Canonical ASCII DNS only: no credentials (including empty @), IP literals,
  // encoded hostnames, explicit ports, Unicode/punycode lookalikes, or dot tricks.
  if (!authority || authority !== url.hostname || authority !== authority.toLowerCase() ||
      authority.endsWith('.') || authority.includes('xn--') || isIP(authority) ||
      !authority.includes('.') || authority.length > 253 ||
      !authority.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return false;
  if (/(?:^|\.)(?:localhost|local|internal|invalid|test)$/u.test(authority)) return false;
  const synthetic = /(?:^|\.)(?:example\.org|example\.com|example\.net)$/u.test(authority);
  if (synthetic && !allowSynthetic) return false;
  return true;
}

const unique = (records, path) => {
  const seen = new Set();
  records.forEach((record, index) => {
    if (seen.has(record.id)) fail('DUPLICATE_ID', `${path}/${index}/id`);
    seen.add(record.id);
  });
};
const plainText = (value, path = '', depth = 0) => {
  if (depth > 16) fail('DEPTH', path);
  if (typeof value === 'string') {
    if (!value.trim() || /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/u.test(value)) fail('UNSAFE_TEXT', path);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) plainText(child, `${path}/${key}`, depth + 1);
  }
};
function reviewShape(record, path, issued) {
  const hasVerified = record.verified_at !== null;
  const hasUntil = record.valid_until !== null;
  if (hasVerified !== hasUntil) fail('PARTIAL_REVIEW', path);
  if (record.status === 'active' && !hasVerified) fail('MISSING_REVIEW', path);
  if (hasVerified && Date.parse(record.valid_until) <= Date.parse(record.verified_at)) fail('REVIEW_RANGE', path);
  if (hasVerified && Date.parse(record.verified_at) > issued) fail('REVIEW_AFTER_ISSUE', path);
}
const statusBlockers = (status, prefix) => status === 'active' ? [] : [`${prefix}_${status}`];
const reviewBlockers = (record, now) => record.verified_at === null ? ['review_missing'] :
  now < Date.parse(record.verified_at) ? ['review_not_yet_valid'] :
    now >= Date.parse(record.valid_until) ? ['review_expired'] : [];

/** Structural validation is separate from eligibility. Call on authenticated,
 * locally activated content; transport signatures/replay checks live in M0.
 * The default unauthenticated context deliberately enables no actions.
 */
export function validateOrganizationsRegistry(registry, options = {}) {
  const now = options.now === undefined ? Date.now() :
    (typeof options.now === 'function' ? new Date(options.now()).getTime() : new Date(options.now).getTime());
  if (!Number.isFinite(now)) fail('CLOCK');
  plainText(registry);
  if (Buffer.byteLength(JSON.stringify(registry) ?? '', 'utf8') > MAX_REGISTRY_BYTES) fail('LIMIT');
  if (!validateShape(registry)) fail('SCHEMA', validateShape.errors?.[0]?.instancePath || '/');
  const synthetic = registry.dataset_kind === 'synthetic_test_only';
  if (synthetic && options.allowSynthetic !== true) fail('SYNTHETIC_TEST_ONLY');
  const issued = Date.parse(registry.issued_at);
  if (Date.parse(registry.expires_at) <= issued) fail('REGISTRY_RANGE', '/expires_at');
  unique(registry.organizations, '/organizations');
  const registryBlockers = [];
  const clientCapabilities = Array.isArray(options.clientCapabilities) ? options.clientCapabilities : [];
  const supportedCountries = Array.isArray(options.supportedCountries) ? options.supportedCountries : ['RS'];
  const supportedRailTypes = new Set(['domestic_rs', 'swift']);
  if (options.contentAuthenticated !== true) registryBlockers.push('content_not_authenticated');
  if (registry.dataset_kind === 'candidate') registryBlockers.push('candidate_only');
  if (now < issued) registryBlockers.push('registry_not_yet_valid');
  if (now >= Date.parse(registry.expires_at)) registryBlockers.push('registry_expired');
  if (!clientCapabilities.includes(ORGANIZATIONS_MODULE.capability)) registryBlockers.push('capability_unsupported');
  const context = options.moduleContext;
  if (!context) registryBlockers.push('module_context_missing');
  else {
    if (context.module_type !== ORGANIZATIONS_MODULE.module_type || context.required !== false ||
        context.payload_path !== ORGANIZATIONS_MODULE.payload_path || !Array.isArray(context.capabilities) ||
        !context.capabilities.includes(ORGANIZATIONS_MODULE.capability)) fail('MODULE_CONTEXT');
    if (context.version !== registry.version || context.revision !== registry.revision) fail('MODULE_IDENTITY');
    if (context.capabilities.some(capability => !clientCapabilities.includes(capability))) {
      if (!registryBlockers.includes('capability_unsupported')) registryBlockers.push('capability_unsupported');
    }
  }

  const organizations = registry.organizations.map((org, orgIndex) => {
    const path = `/organizations/${orgIndex}`;
    unique(org.sources, `${path}/sources`);
    unique(org.links, `${path}/links`);
    unique(org.payment_rails, `${path}/payment_rails`);
    const sources = new Map(org.sources.map(source => [source.id, source]));
    const inspectUrl = (url, urlPath) => {
      if (!validateOfficialHttpsUrl(url, { allowSynthetic: synthetic })) fail('URL', urlPath);
      if (synthetic && !/(?:^|\.)(?:example\.org|example\.com|example\.net)$/.test(new URL(url).hostname)) fail('SYNTHETIC_URL', urlPath);
    };
    org.sources.forEach((source, index) => {
      inspectUrl(source.url, `${path}/sources/${index}/url`);
      if (Date.parse(`${source.fetched_on}T00:00:00Z`) > issued) fail('SOURCE_AFTER_ISSUE', `${path}/sources/${index}`);
    });
    if (registry.dataset_kind === 'candidate' && (org.status !== 'draft' ||
        org.links.some(link => link.status !== 'draft') || org.payment_rails.some(rail => rail.status !== 'draft'))) fail('CANDIDATE_STATUS', path);
    const inspectReview = (record, recordPath) => {
      reviewShape(record, recordPath, issued);
      for (const id of record.source_ids) {
        const source = sources.get(id);
        if (!source) fail('SOURCE_REFERENCE', `${recordPath}/source_ids`);
        if (record.verified_at !== null && Date.parse(`${source.fetched_on}T00:00:00Z`) > Date.parse(record.verified_at)) fail('REVIEW_BEFORE_SOURCE', recordPath);
      }
    };
    const orgBlockers = [...registryBlockers, ...statusBlockers(org.status, 'organization')];
    if (!supportedCountries.includes(org.country)) orgBlockers.push('country_unsupported');
    const links = org.links.map((link, index) => {
      const linkPath = `${path}/links/${index}`;
      inspectUrl(link.url, `${linkPath}/url`);
      inspectReview(link, linkPath);
      const blockers = [...orgBlockers, ...statusBlockers(link.status, 'link'), ...reviewBlockers(link, now)];
      if (link.kind === 'donation' && options.paymentSessionFresh !== true) blockers.push('payment_session_not_fresh');
      return { id: link.id, kind: link.kind, enabled: blockers.length === 0, blockers };
    });
    const paymentRails = org.payment_rails.map((rail, index) => {
      const railPath = `${path}/payment_rails/${index}`;
      inspectReview(rail, railPath);
      if (org.legal_name !== null && rail.payee.legal_name !== org.legal_name) fail('PAYEE_IDENTITY', `${railPath}/payee/legal_name`);
      if (rail.payee.country !== org.country) fail('PAYEE_COUNTRY', `${railPath}/payee/country`);
      if (rail.type === 'domestic_rs' && rail.payee.country !== 'RS') fail('DOMESTIC_COUNTRY', `${railPath}/payee/country`);
      if (rail.type === 'domestic_rs' && ((rail.details.model === null) !== (rail.details.reference === null))) fail('PARTIAL_REFERENCE', `${railPath}/details`);
      if (rail.type === 'domestic_rs') {
        if ([...`${rail.payee.legal_name}\n${rail.payee.address}`].length > 70) fail('DOMESTIC_PAYEE_LENGTH', `${railPath}/payee`);
        if (rail.details.reference !== null && [...rail.details.reference].length > 25) fail('DOMESTIC_REFERENCE_LENGTH', `${railPath}/details/reference`);
        for (const [script, purpose] of Object.entries(rail.details.purpose)) {
          const effective = rail.source_marker.enabled ? `${purpose} ${rail.source_marker.value}` : purpose;
          if ([...effective].length > 35 || /[|\r\n]/u.test(effective)) fail('DOMESTIC_PURPOSE', `${railPath}/details/purpose/${script}`);
        }
        if (/[|\r\n]/u.test(rail.payee.legal_name) || /[|\r\n]/u.test(rail.payee.address)) fail('DOMESTIC_PAYEE_DELIMITER', `${railPath}/payee`);
      }
      if (rail.suggested_amount !== null) {
        if (rail.suggested_amount.currency !== rail.currency) fail('AMOUNT_CURRENCY', `${railPath}/suggested_amount`);
        if (BigInt(rail.suggested_amount.decimal.replace('.', '')) <= 0n) fail('AMOUNT_NONPOSITIVE', `${railPath}/suggested_amount`);
      }
      const blockers = [...orgBlockers, ...statusBlockers(rail.status, 'rail'), ...reviewBlockers(rail, now)];
      if (org.legal_name === null) blockers.push('legal_identity_unresolved');
      if (!supportedRailTypes.has(rail.type)) blockers.push('rail_type_unsupported');
      if (rail.source_marker.enabled) {
        inspectReview(rail.source_marker.agreement, `${railPath}/source_marker/agreement`);
        if (rail.type !== 'domestic_rs') blockers.push('marker_placement_unsupported');
        blockers.push(...statusBlockers(rail.source_marker.agreement.status, 'marker_agreement'),
          ...reviewBlockers(rail.source_marker.agreement, now).map(reason => `marker_${reason}`));
      }
      if (options.paymentSessionFresh !== true) blockers.push('payment_session_not_fresh');
      return { id: rail.id, type: rail.type, enabled: blockers.length === 0, blockers };
    });
    let logo = null;
    if (org.logo) {
      const logoPath = `${path}/logo`;
      if (org.logo.path.split('/').some(part => !part || part === '.' || part === '..')) fail('LOGO_PATH', `${logoPath}/path`);
      inspectReview(org.logo.rights, `${logoPath}/rights`);
      const blockers = [...orgBlockers, ...statusBlockers(org.logo.rights.status, 'logo_rights'),
        ...reviewBlockers(org.logo.rights, now).map(reason => `logo_${reason}`)];
      const files = Array.isArray(context?.files) ? context.files : [];
      const matches = files.filter(file => file.path === org.logo.path);
      const file = matches[0];
      if (matches.length !== 1 || file.sha256 !== org.logo.sha256 || file.content_type !== org.logo.content_type ||
          file.image?.width !== org.logo.width || file.image?.height !== org.logo.height) blockers.push('logo_file_unverified');
      logo = { enabled: blockers.length === 0, blockers };
    }
    return { id: org.id, status: org.status, links, payment_rails: paymentRails, logo };
  });
  return {
    valid: true, schema_version: registry.schema_version, version: registry.version, revision: registry.revision,
    dataset_kind: registry.dataset_kind, evaluated_at: new Date(now).toISOString(),
    registry_eligible: registryBlockers.length === 0, blockers: registryBlockers, organizations
  };
}

export async function validateOrganizationsFile(path, options = {}) {
  const bytes = await readFile(path);
  if (bytes.length > MAX_REGISTRY_BYTES) fail('LIMIT');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('UTF8'); }
  let registry;
  try { registry = JSON.parse(source); } catch { fail('JSON'); }
  return validateOrganizationsRegistry(registry, options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const nowIndex = process.argv.indexOf('--now');
  if (!file) {
    console.error('Usage: node scripts/validate-organizations-v1.mjs <registry.json> [--now <UTC timestamp>]');
    process.exitCode = 2;
  } else {
    try {
      // CLI deliberately has no production-authentication or synthetic override.
      const result = await validateOrganizationsFile(file, { now: nowIndex < 0 ? undefined : process.argv[nowIndex + 1] });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error instanceof OrganizationsValidationError ? error.message : 'READ');
      process.exitCode = 1;
    }
  }
}
