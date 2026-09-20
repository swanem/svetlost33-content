#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { toLatin, validDate } from './validate-saints-v1.mjs';

const schema = JSON.parse(await readFile(new URL('../schemas/liturgical-catalog-v1.schema.json', import.meta.url)));
const shape = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
export const CATALOG_LIMITS = Object.freeze({ bytes: 524288, queryScalars: 128, results: 50 });
export const CATALOG_MODULE = Object.freeze({ module_id: 'liturgical-catalog-v1', module_type: 'library', required: false,
  capabilities: ['liturgical-catalog-v1'], payload_path: 'data/liturgical-catalog-v1.json' });
const blocked = reason => ({ eligible: false, reason });
const invalid = reason => ({ valid: false, reason });
const unique = values => new Set(values).size === values.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identityFields = ['module_id', 'version', 'revision', 'path', 'sha256'];
const bindingMatches = (binding, host) => host && identityFields.every(key => binding[key] === host[key]);
const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const parity = value => value['sr-Latn'] === toLatin(value['sr-Cyrl']);
const validGeneration = value => value && typeof value.id === 'string' && value.id.length > 0 && Number.isSafeInteger(value.sequence) && value.sequence > 0 && typeof value.decision_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.decision_sha256);
const sameGeneration = (a, b) => validGeneration(a) && validGeneration(b) && ['id', 'sequence', 'decision_sha256'].every(key => a[key] === b[key]);
const safeStrings = value => typeof value === 'string' ? value.trim() === value && !/[\u0000-\u001f\u007f-\u009f<>\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value)
  : Array.isArray(value) ? value.every(safeStrings) : value === null || typeof value !== 'object' || Object.values(value).every(safeStrings);

export function catalogDependencies(payload) {
  const byModule = new Map();
  for (const binding of [...payload.calendar_bindings, ...payload.article_bindings]) {
    if (byModule.has(binding.module_id) && byModule.get(binding.module_id) !== binding.version) throw new Error('Conflicting active module versions');
    byModule.set(binding.module_id, binding.version);
  }
  return [...byModule].sort(([a], [b]) => ascii(a, b)).map(([module_id, version]) => ({ module_id, version }));
}

/** Structural/editorial checks only, not authentication or owner approval. */
export function validateCatalogPayload(payload) {
  if (payload === null || payload === undefined) return invalid('absent');
  if (typeof payload?.schema_version === 'string' && payload.schema_version !== 'svetlost33-liturgical-catalog-1') return invalid('unsupported_schema');
  if (!shape(payload) || !safeStrings(payload) || Buffer.byteLength(JSON.stringify(payload), 'utf8') > CATALOG_LIMITS.bytes) return invalid('malformed');
  const fail = () => invalid('malformed');
  for (const key of ['calendar_profiles', 'sources', 'subjects', 'observances', 'calendar_bindings', 'occurrences', 'article_bindings']) if (!unique(payload[key].map(item => item.id))) return fail();
  if (!unique(payload.legacy_slava_links.map(item => item.legacy_id)) || !unique(payload.coverage.map(item => `${item.calendar_profile_id}:${item.year}`))) return fail();
  const profiles = new Map(payload.calendar_profiles.map(item => [item.id, item]));
  const sources = new Map(payload.sources.map(item => [item.id, item]));
  const subjects = new Map(payload.subjects.map(item => [item.id, item]));
  const observances = new Map(payload.observances.map(item => [item.id, item]));
  const calendars = new Map(payload.calendar_bindings.map(item => [item.id, item]));
  const articles = new Map(payload.article_bindings.map(item => [item.id, item]));
  const sourceRefs = item => item.source_ids.every(id => sources.has(id));
  if (payload.calendar_profiles.some(item => !parity(item.name))) return fail();
  for (const source of payload.sources) {
    try { const url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname) || url.hostname.endsWith('.local') || /[\s\\]/u.test(source.url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(source.url)) return fail(); } catch { return fail(); }
    if (source.checked_on !== null && !validDate(source.checked_on)) return fail();
    if (source.review_status === 'reviewed' && source.checked_on === null) return fail();
  }
  for (const item of [...payload.subjects, ...payload.observances]) {
    if (!parity(item.name) || !sourceRefs(item) || !unique(item.aliases.map(alias => `${alias.locale}:${alias.text}`))) return fail();
    if (item.aliases.some(alias => !sourceRefs(alias) || normalizeCatalogQuery(alias.text) === '')) return fail();
  }
  for (const item of payload.observances) {
    if (!parity(item.description) || item.subject_ids.some(id => !subjects.has(id))) return fail();
    if (item.kind === 'saint_commemoration' && (item.subject_ids.length !== 1 || subjects.get(item.subject_ids[0]).type !== 'saint')) return fail();
    if (item.kind === 'group_commemoration' && (item.subject_ids.length !== 1 || subjects.get(item.subject_ids[0]).type !== 'group')) return fail();
  }
  if (!unique(payload.calendar_bindings.map(item => `${item.calendar_profile_id}:${item.year}`)) ||
      !unique(payload.article_bindings.map(item => `${item.module_id}:${item.path}`))) return fail();
  for (const binding of payload.calendar_bindings) if (!profiles.has(binding.calendar_profile_id) || binding.path !== `data/calendar.${String(binding.year).padStart(4, '0')}.json`) return fail();
  for (const item of [...payload.occurrences, ...payload.day_reviews]) {
    const binding = calendars.get(item.calendar_binding_id);
    if (!binding || !validDate(item.date) || !validDate(item.julian_date, true) || Number(item.date.slice(0, 4)) !== binding.year || !parity(item.calendar_title) || !sourceRefs(item) || item.calendar_source_ids.some(id => !sources.has(id))) return fail();
    if ('observance_id' in item && !observances.has(item.observance_id)) return fail();
  }
  if (!unique(payload.occurrences.map(item => `${item.calendar_binding_id}:${item.date}:${item.observance_id}`)) || !unique(payload.day_reviews.map(item => `${item.calendar_binding_id}:${item.date}`))) return fail();
  for (const day of payload.day_reviews) if (payload.occurrences.some(item => item.calendar_binding_id === day.calendar_binding_id && item.date === day.date)) return fail();
  if (!unique(payload.article_links.map(item => `${item.observance_id}:${item.article_binding_id}:${item.article_id}`))) return fail();
  for (const item of payload.article_links) if (!observances.has(item.observance_id) || !articles.has(item.article_binding_id) || !sourceRefs(item)) return fail();
  for (const binding of payload.article_bindings) if (!payload.article_links.some(item => item.article_binding_id === binding.id)) return fail();
  for (const item of payload.legacy_slava_links) if (item.observance_ids.some(id => !observances.has(id))) return fail();
  for (const coverage of payload.coverage) {
    if (!profiles.has(coverage.calendar_profile_id)) return fail();
    const binding = calendars.get(coverage.calendar_binding_id);
    if (coverage.status === 'unavailable') {
      if (coverage.calendar_binding_id !== null || coverage.mapped_dates !== 0 || coverage.occurrences !== 0 || payload.calendar_bindings.some(item => item.calendar_profile_id === coverage.calendar_profile_id && item.year === coverage.year)) return fail();
    } else {
      if (!binding || binding.calendar_profile_id !== coverage.calendar_profile_id || binding.year !== coverage.year) return fail();
      const occurrences = payload.occurrences.filter(item => item.calendar_binding_id === binding.id);
      const days = new Set([...occurrences, ...payload.day_reviews.filter(item => item.calendar_binding_id === binding.id)].map(item => item.date));
      if (coverage.mapped_dates !== days.size || coverage.occurrences !== occurrences.length) return fail();
    }
  }
  for (const binding of payload.calendar_bindings) if (!payload.coverage.some(item => item.calendar_binding_id === binding.id)) return fail();
  if (payload.review_status === 'approved' && payload.approval_id === null) return fail();
  try { catalogDependencies(payload); } catch { return fail(); }
  return { valid: true, reason: null };
}

export function parseCatalogPayload(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > CATALOG_LIMITS.bytes) return invalid('malformed');
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    const result = validateCatalogPayload(payload);
    return result.valid ? { ...result, payload } : result;
  } catch { return invalid('malformed'); }
}

const reviewedSources = (payload, item) => item.source_ids.every(id => payload.sources.some(source => source.id === id && source.review_status === 'reviewed' && source.checked_on !== null));
const reviewedItem = (payload, item) => item?.review_status === 'reviewed' && reviewedSources(payload, item);
const reviewedObservance = (payload, item) => reviewedItem(payload, item) && item.subject_ids.every(id => reviewedItem(payload, payload.subjects.find(subject => subject.id === id)));

/** Host context comes only from a captured, independently verified M0 generation. */
export function evaluateCatalog(payload, context = {}) {
  const validation = validateCatalogPayload(payload);
  if (!validation.valid) return blocked(validation.reason);
  if (payload.review_status !== 'approved') return blocked('unapproved');
  if (context.contentAuthenticated !== true) return blocked('content_not_authenticated');
  const module = context.moduleContext;
  const dependencies = catalogDependencies(payload);
  if (!module || Object.entries(CATALOG_MODULE).some(([key, value]) => Array.isArray(value) ? !same(value, module[key]) : module[key] !== value) || module.version !== payload.version || module.revision !== payload.revision || !Array.isArray(module.dependencies) || module.dependencies.length !== dependencies.length || dependencies.some((dependency, index) => module.dependencies[index]?.module_id !== dependency.module_id || module.dependencies[index]?.version !== dependency.version)) return blocked('module_mismatch');
  if (!sameGeneration(context.generation, module.generation)) return blocked('generation_mismatch');
  if (!Array.isArray(context.calendarContexts) || !Array.isArray(context.articleContexts)) return blocked('invalid_context');
  for (const binding of payload.calendar_bindings) {
    const matches = context.calendarContexts.filter(host => host.module_id === binding.module_id && host.path === binding.path);
    if (matches.length !== 1 || matches[0].authenticated !== true) return blocked('calendar_not_authenticated');
    const host = matches[0];
    if (!sameGeneration(host.generation, context.generation)) return blocked('generation_mismatch');
    if (!bindingMatches(binding, host) || host.year !== binding.year) return blocked('calendar_mismatch');
    for (const item of [...payload.occurrences, ...payload.day_reviews].filter(item => item.calendar_binding_id === binding.id)) {
      const matches = Array.isArray(host.days) ? host.days.filter(day => day.date === item.date) : [];
      if (matches.length !== 1) return blocked('calendar_day_mismatch');
      const day = matches[0];
      if (day.julian_date !== item.julian_date || day.commemoration?.status !== 'SOURCE_RECORDED' || day.commemoration.title_cyrl !== item.calendar_title['sr-Cyrl'] || !same(day.commemoration.source_ids, item.calendar_source_ids) || day.commemoration.complete_saint_list_verified !== false) return blocked('calendar_day_mismatch');
    }
  }
  for (const host of context.articleContexts) if (payload.article_bindings.some(binding => binding.module_id === host.module_id && binding.path === host.path) && !sameGeneration(host.generation, context.generation)) return blocked('generation_mismatch');
  return { eligible: true, reason: null };
}

export function resolveCatalogDay(payload, context, { date, calendar_profile_id }) {
  const eligible = evaluateCatalog(payload, context); if (!eligible.eligible) return eligible;
  if (!validDate(date)) return blocked('invalid_date');
  if (!payload.calendar_profiles.some(item => item.id === calendar_profile_id)) return blocked('unknown_profile');
  const coverage = payload.coverage.find(item => item.calendar_profile_id === calendar_profile_id && item.year === Number(date.slice(0, 4)));
  if (!coverage || coverage.status === 'unavailable') return { eligible: true, reason: null, state: 'year_unavailable', occurrence_ids: [] };
  const occurrences = payload.occurrences.filter(item => item.calendar_binding_id === coverage.calendar_binding_id && item.date === date && reviewedItem(payload, item) && reviewedObservance(payload, payload.observances.find(observance => observance.id === item.observance_id)));
  if (occurrences.length) return { eligible: true, reason: null, state: 'source_recorded', occurrence_ids: occurrences.map(item => item.id).sort(ascii) };
  const review = payload.day_reviews.find(item => item.calendar_binding_id === coverage.calendar_binding_id && item.date === date && reviewedItem(payload, item));
  return { eligible: true, reason: null, state: review?.status ?? 'uncovered', occurrence_ids: [] };
}

export function normalizeCatalogQuery(value) {
  return (toLatin(value).replace(/[A-ZČĆĐŠŽ]/gu, character => character.toLowerCase()).replaceAll('đ', 'dj').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').match(/[a-z0-9]+/g) ?? []).join(' ');
}

function availableArticles(payload, context, observance) {
  const ids = [];
  for (const link of payload.article_links.filter(link => link.observance_id === observance.id && reviewedItem(payload, link))) {
    const binding = payload.article_bindings.find(binding => binding.id === link.article_binding_id);
    const matches = context.articleContexts.filter(host => bindingMatches(binding, host));
    if (matches.length !== 1) continue;
    const host = matches[0];
    if (host.authenticated !== true || host.review_status !== 'approved' || !sameGeneration(host.generation, context.generation) || !payload.calendar_bindings.some(calendar => bindingMatches(calendar, host.calendar_binding))) continue;
    const articles = (host.articles ?? []).filter(article => article.id === link.article_id);
    const expectedType = observance.kind === 'saint_commemoration' ? 'saint' : observance.kind === 'group_commemoration' ? 'group' : 'feast';
    if (articles.length === 1 && articles[0].type === expectedType) ids.push(link.article_id);
  }
  return [...new Set(ids)].sort(ascii);
}

export function searchCatalog(payload, context, { query, locale, year, calendar_profile_id }) {
  const eligible = evaluateCatalog(payload, context); if (!eligible.eligible) return eligible;
  if (!['sr-Cyrl', 'sr-Latn'].includes(locale)) return blocked('unsupported_locale');
  if (typeof query !== 'string') return blocked('invalid_query');
  if ([...query].length > CATALOG_LIMITS.queryScalars) return blocked('query_too_long');
  if (!Number.isInteger(year) || year < 1 || year > 9999) return blocked('invalid_year');
  if (!payload.calendar_profiles.some(item => item.id === calendar_profile_id)) return blocked('unknown_profile');
  const normalized = normalizeCatalogQuery(query), tokens = normalized.split(' ');
  if (!normalized) return { eligible: true, reason: null, state: 'empty_query', truncated: false, results: [] };
  const coverage = payload.coverage.find(item => item.calendar_profile_id === calendar_profile_id && item.year === year);
  const ranked = [];
  for (const observance of payload.observances) {
    if (!reviewedObservance(payload, observance)) continue;
    const names = [observance, ...observance.subject_ids.map(id => payload.subjects.find(item => item.id === id))].flatMap(item => [item.name['sr-Cyrl'], item.name['sr-Latn'], ...item.aliases.filter(alias => reviewedSources(payload, alias)).map(alias => alias.text)]);
    const ranks = names.map(normalizeCatalogQuery).map(field => field === normalized ? 0 : field.startsWith(normalized) ? 1 : tokens.every(token => field.split(' ').some(word => word.startsWith(token))) ? 2 : 3);
    const rank = Math.min(...ranks); if (rank === 3) continue;
    const occurrences = payload.occurrences.filter(item => item.observance_id === observance.id && item.calendar_binding_id === coverage?.calendar_binding_id && reviewedItem(payload, item)).sort((a, b) => ascii(a.date, b.date) || ascii(a.id, b.id));
    ranked.push({ rank, sortDate: occurrences[0]?.date ?? '9999-99-99', result: { observance_id: observance.id, kind: observance.kind,
      name: observance.name[locale], description: observance.description[locale], subject_ids: observance.subject_ids,
      date_state: occurrences.length ? 'source_recorded' : 'unavailable', dates: [...new Set(occurrences.map(item => item.date))],
      occurrence_ids: occurrences.map(item => item.id), article_ids: availableArticles(payload, context, observance) } });
  }
  ranked.sort((a, b) => a.rank - b.rank || ascii(a.sortDate, b.sortDate) || ascii(a.result.observance_id, b.result.observance_id));
  return { eligible: true, reason: null, state: ranked.length ? 'matches' : 'no_match', truncated: ranked.length > CATALOG_LIMITS.results, results: ranked.slice(0, CATALOG_LIMITS.results).map(item => item.result) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = parseCatalogPayload(await readFile(process.argv[2] ?? new URL('../fixtures/liturgical-catalog-v1/catalog-candidate.json', import.meta.url)));
  console.log(JSON.stringify(result.valid ? { valid: true, runtime: evaluateCatalog(result.payload), subjects: result.payload.subjects.length, observances: result.payload.observances.length, coverage: result.payload.coverage } : result, null, 2));
  if (!result.valid) process.exitCode = 1;
}
