// KS01 static semantic implementation, preserving historical v1 rejection order.
// Kept separate to preserve byte-pinned historical validators and fixtures.
import { toLatin, validDate, articleWordCount, SAINTS_MODULE } from '../validate-saints-v1.mjs';
import { SAINTS_LIMITS } from './limits.mjs';
import { matchesSaintsShape as shape } from './schemas.mjs';
const blocked = reason => ({ eligible: false, reason });
const equalArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const localizedParity = value => value['sr-Latn'] === toLatin(value['sr-Cyrl']);
const unique = values => new Set(values).size === values.length;
const prose = value => [value.intro, ...value.body, value.takeaway].join(' ');

function safeText(value) {
  return value.trim() === value && !/[\u0000-\u001f\u007f-\u009f<>\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value);
}

function safeStrings(value) {
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.every(safeStrings);
  return value === null || typeof value !== 'object' || Object.values(value).every(safeStrings);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(url.hostname) &&
      !url.hostname.endsWith('.local') && !/[\s\\]/u.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value) &&
      value.startsWith(`https://${url.hostname}`) && !/^https:\/\/[^/?#]*@/.test(value);
  } catch { return false; }
}

/** Structural/editorial validation only. Success is NOT authentication or publication authority. */
export function validateSaintsPayload(payload) {
  if (payload == null) return { valid: false, reason: 'absent' };
  if (typeof payload === 'object' && typeof payload.schema_version === 'string' && payload.schema_version !== 'svetlost33-saints-1') return { valid: false, reason: 'unsupported_schema' };
  if (!shape(payload)) return { valid: false, reason: 'malformed' };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > SAINTS_LIMITS.bytes || !safeStrings(payload)) return { valid: false, reason: 'malformed' };
  const fail = () => ({ valid: false, reason: 'malformed' });
  if (!unique(payload.sources.map(source => source.id)) || !unique(payload.articles.map(article => article.id)) || !unique(payload.days.map(day => day.date))) return fail();
  if (!localizedParity(payload.authorship.attribution)) return fail();
  const sources = new Map(payload.sources.map(source => [source.id, source]));
  const articles = new Map(payload.articles.map(article => [article.id, article]));
  for (const source of payload.sources) {
    if (!safeUrl(source.url) || !validDate(source.reviewed_on) || (source.published_on !== null && !validDate(source.published_on))) return fail();
  }
  for (const article of payload.articles) {
    if ((article.type === 'feast') !== (article.subtype !== null) || article.source_ids.some(id => sources.get(id)?.kind !== 'article')) return fail();
    const cyrl = article.content['sr-Cyrl'], latn = article.content['sr-Latn'];
    if (['title', 'intro', 'takeaway'].some(key => latn[key] !== toLatin(cyrl[key])) || !equalArray(latn.body, cyrl.body.map(toLatin))) return fail();
    for (const text of [cyrl, latn]) {
      const words = articleWordCount(text);
      if (words < SAINTS_LIMITS.wordsMin || words > SAINTS_LIMITS.wordsMax || [...prose(text)].length > SAINTS_LIMITS.proseScalars) return fail();
    }
  }
  for (const day of payload.days) {
    if (!validDate(day.date) || !validDate(day.julian_date, true) || !localizedParity(day.calendar_title) || day.article_ids.some(id => !articles.has(id)) || day.calendar_source_ids.some(id => sources.get(id)?.kind !== 'calendar')) return fail();
    if (!unique(day.calendar_notes.map(note => note.kind))) return fail();
    for (const note of day.calendar_notes) {
      if (articles.get(note.related_article_id)?.type !== 'feast' || !localizedParity(note.label) || !day.calendar_title['sr-Cyrl'].includes(note.label['sr-Cyrl']) || note.source_ids.some(id => !day.calendar_source_ids.includes(id))) return fail();
    }
  }
  return { valid: true, reason: null };
}

/** Fatal UTF-8 decoding and raw-byte limit happen before any JSON parsing. */
export function parseSaintsPayload(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > SAINTS_LIMITS.bytes) return { valid: false, reason: 'malformed' };
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    const result = validateSaintsPayload(payload);
    return result.valid ? { ...result, payload } : result;
  } catch { return { valid: false, reason: 'malformed' }; }
}

/** Optional UI eligibility; never changes M0 signature/hash/replay/atomic-activation behavior. */
export function evaluateSaintsDay(payload, context = {}) {
  const validation = validateSaintsPayload(payload);
  if (!validation.valid) return blocked(validation.reason);
  if (payload.review_status !== 'approved') return blocked('unapproved');
  if (context.contentAuthenticated !== true) return blocked('content_not_authenticated');
  const module = context.moduleContext;
  if (!module || Object.entries(SAINTS_MODULE).some(([key, value]) => Array.isArray(value) ? !equalArray(module[key], value) : module[key] !== value) || module.version !== payload.version || module.revision !== payload.revision) return blocked('module_mismatch');
  if (context.calendarAuthenticated !== true) return blocked('calendar_not_authenticated');
  const calendar = context.calendarContext;
  if (!calendar || Object.entries(payload.calendar_binding).some(([key, value]) => calendar[key] !== value)) return blocked('calendar_mismatch');
  if (!validDate(context.date)) return blocked('invalid_date');
  const day = payload.days.find(item => item.date === context.date);
  if (!day) return blocked('uncovered_date');
  const activeDays = Array.isArray(calendar.days) ? calendar.days.filter(item => item?.date === context.date) : null;
  if (!activeDays || activeDays.length !== 1) return blocked('calendar_day_mismatch');
  const active = activeDays[0];
  if (active.julian_date !== day.julian_date || active.commemoration?.status !== 'SOURCE_RECORDED' || active.commemoration.title_cyrl !== day.calendar_title['sr-Cyrl'] || active.commemoration.complete_saint_list_verified !== false || !equalArray(active.commemoration.source_ids, day.calendar_source_ids)) return blocked('calendar_day_mismatch');
  return { eligible: true, reason: null, day, articles: day.article_ids.map(id => payload.articles.find(article => article.id === id)) };
}

