#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { validDate } from './validate-saints-v1.mjs';
import { evaluateCatalog } from './validate-liturgical-catalog-v1.mjs';

const schema = JSON.parse(await readFile(new URL('../schemas/calendar-browser-v1.schema.json', import.meta.url)));
const shape = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
export const CALENDAR_BROWSER_LIMITS = Object.freeze({ bytes: 1048576, results: 50 });
export const CALENDAR_BROWSER_MODULE = Object.freeze({ module_id: 'calendar-browser-v1', module_type: 'library', required: false,
  capabilities: ['calendar-browser-v1'], payload_path: 'data/calendar-browser-v1.json' });
export const ARCHIVE_PHASES = Object.freeze(['morning', 'noon', 'evening']);
const invalid = reason => ({ valid: false, reason });
const blocked = reason => ({ eligible: false, reason });
const unique = values => new Set(values).size === values.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const increasing = values => values.every((value, index) => index === 0 || values[index - 1] < value);
const exact = (a, b, fields) => b && fields.every(key => a[key] === b[key]);
const manifestFields = ['module_id', 'version', 'revision', 'manifest_sha256'];
const payloadFields = ['module_id', 'version', 'revision', 'path', 'sha256'];
const validGeneration = value => value && typeof value.id === 'string' && value.id.length > 0 && Number.isSafeInteger(value.sequence) && value.sequence > 0 && typeof value.decision_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.decision_sha256);
const sameGeneration = (a, b) => validGeneration(a) && validGeneration(b) && exact(a, b, ['id', 'sequence', 'decision_sha256']);

/** Gregorian calendar arithmetic, independent of clocks, locale, timezone and DST. */
export function civilDayOrdinal(date) {
  if (!validDate(date)) throw new Error('Invalid civil date');
  const [year, month, day] = date.split('-').map(Number), prior = year - 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const beforeMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1];
  return prior * 365 + Math.floor(prior / 4) - Math.floor(prior / 100) + Math.floor(prior / 400) + beforeMonth + (leap && month > 2 ? 1 : 0) + day;
}

/** Optional domain references deliberately do not assert M0 transport dependencies. */
export function calendarBrowserDependencies() { return []; }

export function validateCalendarBrowserPayload(payload) {
  if (payload === null || payload === undefined) return invalid('absent');
  if (typeof payload?.schema_version === 'string' && payload.schema_version !== 'svetlost33-calendar-browser-1') return invalid('unsupported_schema');
  if (!shape(payload) || Buffer.byteLength(JSON.stringify(payload)) > CALENDAR_BROWSER_LIMITS.bytes) return invalid('malformed');
  const fail = () => invalid('malformed');
  if (payload.review_status === 'approved' && payload.approval_id === null) return fail();
  if (!unique(payload.feast_memberships.map(item => item.observance_id)) || !unique(payload.feast_memberships.flatMap(item => item.occurrence_ids))) return fail();
  if (payload.catalog_binding === null && payload.feast_memberships.length > 0) return fail();
  if (!unique(payload.archive_bindings.map(item => item.id)) || !increasing(payload.archive_days.map(item => item.date))) return fail();
  if (payload.archive_start_date === null) {
    if (payload.archive_days.length || payload.archive_bindings.length) return fail();
  } else if (!validDate(payload.archive_start_date) || payload.archive_days[0]?.date !== payload.archive_start_date) return fail();
  for (const binding of payload.archive_bindings) {
    if (binding.library_binding.module_id === binding.cycles_binding.module_id || !payload.archive_days.some(day => day.binding_id === binding.id)) return fail();
  }
  for (const day of payload.archive_days) {
    if (!validDate(day.date) || !payload.archive_bindings.some(binding => binding.id === day.binding_id)) return fail();
    if (day.status === 'withdrawn' ? day.phases.length !== 0 : day.phases.length === 0) return fail();
    if ((day.status === 'corrected') !== (day.correction_id !== null)) return fail();
    if (!increasing(day.phases.map(item => ARCHIVE_PHASES.indexOf(item.phase)))) return fail();
    for (const phase of day.phases) if (Number(phase.psalm_id.slice(6)) > 150 || !increasing(phase.verse_numbers)) return fail();
  }
  return { valid: true, reason: null };
}

export function parseCalendarBrowserPayload(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > CALENDAR_BROWSER_LIMITS.bytes) return invalid('malformed');
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    const validation = validateCalendarBrowserPayload(payload);
    return validation.valid ? { ...validation, payload } : validation;
  } catch { return invalid('malformed'); }
}

/** Pure checks over an independently authenticated, captured native snapshot. */
export function evaluateCalendarBrowser(payload, context = {}) {
  const validation = validateCalendarBrowserPayload(payload);
  if (!validation.valid) return blocked(validation.reason);
  if (payload.review_status !== 'approved') return blocked('unapproved');
  if (!context || typeof context !== 'object' || Array.isArray(context)) return blocked('invalid_context');
  if (context.contentAuthenticated !== true) return blocked('content_not_authenticated');
  const module = context.moduleContext;
  if (!module || Object.entries(CALENDAR_BROWSER_MODULE).some(([key, value]) => Array.isArray(value) ? !same(value, module[key]) : module[key] !== value)
      || module.version !== payload.version || module.revision !== payload.revision || !same(module.dependencies, [])) return blocked('module_mismatch');
  if (!sameGeneration(context.generation, module.generation)) return blocked('generation_mismatch');
  if (!Array.isArray(context.archiveContexts)) return blocked('invalid_context');
  return { eligible: true, reason: null };
}

const feastResult = (state, items = [], years = [], truncated = false) => ({ eligible: true, reason: null, state, coverage: 'limited_catalog', coverage_years: years, truncated, items });
const reviewedSources = (catalog, item) => item.source_ids.every(id => catalog.sources.some(source => source.id === id && source.review_status === 'reviewed' && source.checked_on !== null));
const reviewed = (catalog, item) => item?.review_status === 'reviewed' && reviewedSources(catalog, item);

export function upcomingBrowserFeasts(payload, context, { from_date, locale }) {
  const eligible = evaluateCalendarBrowser(payload, context); if (!eligible.eligible) return eligible;
  if (!validDate(from_date)) return blocked('invalid_date');
  if (!['sr-Cyrl', 'sr-Latn'].includes(locale)) return blocked('unsupported_locale');
  const host = context.catalogContext;
  let catalogEligible = false;
  try { catalogEligible = host && evaluateCatalog(host.payload, host.context).eligible; } catch { /* Malformed host metadata never crashes the optional view. */ }
  if (!payload.catalog_binding || !host || host.authenticated !== true || !exact(payload.catalog_binding, host, payloadFields)
      || !sameGeneration(host.generation, context.generation) || !sameGeneration(host.context?.generation, context.generation)
      || !catalogEligible) return feastResult('unavailable');
  const catalog = host.payload;
  if (!catalog.calendar_profiles.some(profile => profile.id === payload.calendar_profile_id)) return feastResult('unavailable');
  const occurrences = new Map(catalog.occurrences.map(item => [item.id, item]));
  const observances = new Map(catalog.observances.map(item => [item.id, item]));
  const calendars = new Map(catalog.calendar_bindings.map(item => [item.id, item]));
  const years = catalog.coverage.filter(item => item.calendar_profile_id === payload.calendar_profile_id && item.status === 'limited_catalog').map(item => item.year).sort((a, b) => a - b);
  const items = [];
  for (const [editorialOrder, membership] of payload.feast_memberships.entries()) {
    const observance = observances.get(membership.observance_id);
    if (!observance || membership.source_ids.some(id => !catalog.sources.some(source => source.id === id))) return feastResult('unavailable');
    for (const id of membership.occurrence_ids) {
      const occurrence = occurrences.get(id);
      if (!occurrence || occurrence.observance_id !== observance.id || calendars.get(occurrence.calendar_binding_id)?.calendar_profile_id !== payload.calendar_profile_id) return feastResult('unavailable');
      if (!reviewed(catalog, membership) || !reviewed(catalog, observance) || !reviewed(catalog, occurrence)
          || !observance.subject_ids.every(id => reviewed(catalog, catalog.subjects.find(subject => subject.id === id)))) continue;
      if (occurrence.date > from_date) items.push({ date: occurrence.date, days_away: civilDayOrdinal(occurrence.date) - civilDayOrdinal(from_date), observance_id: observance.id, occurrence_id: occurrence.id, name: observance.name[locale], editorialOrder });
    }
  }
  items.sort((a, b) => ascii(a.date, b.date) || a.editorialOrder - b.editorialOrder || ascii(a.occurrence_id, b.occurrence_id));
  const state = items.length ? 'matches' : years.some(year => year >= Number(from_date.slice(0, 4))) ? 'no_known_occurrence' : 'unavailable';
  let count = Math.min(items.length, CALENDAR_BROWSER_LIMITS.results);
  while (count < items.length && items[count].date === items[count - 1].date) count++;
  return feastResult(state, items.slice(0, count).map(({ editorialOrder, ...item }) => item), years, count < items.length);
}

const archiveResult = (date, state, phases = [], correction_id = null) => ({ eligible: true, reason: null, date, state, correction_id, phases });
const phaseResult = (phase, state, selection = null) => ({ phase, state, selection });
const one = values => Array.isArray(values) && values.length === 1 ? values[0] : null;
const completePhase = (host, selected, date) => {
  if (!Array.isArray(host.cycles.days) || !Array.isArray(host.library.psalms)) return false;
  const day = one(host.cycles.days.filter(day => day?.id === selected.cycle_day_id));
  if (!day || day.cycle_day !== (civilDayOrdinal(date) - 1) % 7 + 1 || !Array.isArray(day.slots)) return false;
  const slot = one(day.slots.filter(slot => slot?.id === selected.slot_id));
  if (!slot || slot.phase !== selected.phase || slot.psalm_id !== selected.psalm_id || slot.prayer_id !== selected.prayer_id || !same(slot.verse_numbers, selected.verse_numbers)) return false;
  const psalm = one(host.library.psalms.filter(psalm => psalm?.id === selected.psalm_id));
  return psalm && Array.isArray(psalm.verse_numbers) && increasing(psalm.verse_numbers) && psalm.verse_numbers.every(verse => Number.isSafeInteger(verse) && verse >= 1 && verse <= 176)
    && selected.verse_numbers.every(verse => psalm.verse_numbers.includes(verse))
    && Array.isArray(host.library.prayer_ids) && host.library.prayer_ids.filter(id => id === selected.prayer_id).length === 1;
};

export function resolveBrowserArchiveDay(payload, context, { date }) {
  const eligible = evaluateCalendarBrowser(payload, context); if (!eligible.eligible) return eligible;
  if (!validDate(date)) return blocked('invalid_date');
  if (payload.archive_start_date === null || date < payload.archive_start_date) return archiveResult(date, 'archive_unavailable');
  const day = payload.archive_days.find(day => day.date === date);
  if (!day) return archiveResult(date, 'uncovered');
  if (day.status === 'withdrawn') return archiveResult(date, 'withdrawn');
  const binding = payload.archive_bindings.find(binding => binding.id === day.binding_id);
  const host = one(context.archiveContexts.filter(host => host?.binding_id === binding.id));
  const available = host && host.authenticated === true && host.review_status === 'approved'
    && sameGeneration(host.generation, context.generation)
    && exact(binding.library_binding, host.library, manifestFields) && exact(binding.cycles_binding, host.cycles, manifestFields)
    && binding.policy_id === 'calendar-week-v1' && binding.policy_version === 1;
  const phases = ARCHIVE_PHASES.map(phase => {
    const selection = day.phases.find(item => item.phase === phase);
    if (!selection) return phaseResult(phase, 'phase_unavailable');
    if (!available || !completePhase(host, selection, date)) return phaseResult(phase, 'content_unavailable');
    return phaseResult(phase, 'available', { cycle_day_id: selection.cycle_day_id, slot_id: selection.slot_id, psalm_id: selection.psalm_id,
      verse_numbers: [...selection.verse_numbers], prayer_id: selection.prayer_id, policy_id: binding.policy_id, policy_version: binding.policy_version,
      library_binding: { ...binding.library_binding }, cycles_binding: { ...binding.cycles_binding }, generation: { ...context.generation } });
  });
  return archiveResult(date, phases.some(phase => phase.state === 'available') ? day.status : 'content_unavailable', phases, day.correction_id);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: validate-calendar-browser-v1.mjs <payload.json>');
  const result = parseCalendarBrowserPayload(await readFile(process.argv[2]));
  console.log(JSON.stringify(result.valid ? { valid: true, runtime: evaluateCalendarBrowser(result.payload) } : result));
  if (!result.valid) process.exitCode = 1;
}
