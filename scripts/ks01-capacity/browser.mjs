// Only catalog selection differs. Browser structure, limits and archive API are reused.
import { validDate } from '../validate-saints-v1.mjs';
import { CALENDAR_BROWSER_LIMITS, evaluateCalendarBrowser, civilDayOrdinal } from '../validate-calendar-browser-v1.mjs';
import { evaluateCatalog } from './catalog.mjs';
export { parseCalendarBrowserPayload, validateCalendarBrowserPayload, evaluateCalendarBrowser,
  resolveBrowserArchiveDay, calendarBrowserDependencies } from '../validate-calendar-browser-v1.mjs';
const blocked = reason => ({ eligible: false, reason });
const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const exact = (a, b, fields) => b && fields.every(key => a[key] === b[key]);
const payloadFields = ['module_id', 'version', 'revision', 'path', 'sha256'];
const validGeneration = value => value && typeof value.id === 'string' && value.id.length > 0 && Number.isSafeInteger(value.sequence) && value.sequence > 0 && typeof value.decision_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.decision_sha256);
const sameGeneration = (a, b) => validGeneration(a) && validGeneration(b) && exact(a, b, ['id', 'sequence', 'decision_sha256']);

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


