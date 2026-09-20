import { toLatin } from './validate-saints-v1.mjs';

/** Local semantic reference only. A view is NOT a content-authentication API. */
export const SAVED_SUBJECTS_SCHEMA = 'svetlost33-saved-subjects-local-1';
export const SAVED_SUBJECTS_LIMITS = Object.freeze({ bytes: 524288, entries: 256, nameScalars: 200 });
const kinds = new Set(['saint', 'group', 'observance']);
const idPattern = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === 'string' && idPattern.test(value);
const ascii = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const keyToken = key => `${key.kind}:${key.id}`;
const equalKey = (left, right) => left.kind === right.kind && left.id === right.id;
const clone = value => structuredClone(value);
const emptyStore = () => ({ schema_version: SAVED_SUBJECTS_SCHEMA, entries: [] });

function safeText(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f<>\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value);
}

export function validSavedKey(value) {
  return closed(value, ['kind', 'id']) && kinds.has(value.kind) && id(value.id);
}

function validName(value) {
  return closed(value, ['sr-Cyrl', 'sr-Latn']) && Object.values(value).every(text =>
    safeText(text) && [...text].length <= SAVED_SUBJECTS_LIMITS.nameScalars) &&
    value['sr-Latn'] === toLatin(value['sr-Cyrl']);
}

function validRecord(value) {
  return closed(value, ['key', 'last_known_name']) && validSavedKey(value.key) && validName(value.last_known_name);
}

/** null/undefined means absent storage; malformed existing data is never repaired. */
export function validateLocalStore(store) {
  if (store == null) return { valid: true, reason: null };
  if (object(store) && typeof store.schema_version === 'string' && store.schema_version !== SAVED_SUBJECTS_SCHEMA) {
    return { valid: false, reason: 'unsupported_schema' };
  }
  try {
    if (!closed(store, ['schema_version', 'entries']) || store.schema_version !== SAVED_SUBJECTS_SCHEMA ||
        !Array.isArray(store.entries) || store.entries.length > SAVED_SUBJECTS_LIMITS.entries ||
        !store.entries.every(validRecord) || new Set(store.entries.map(record => keyToken(record.key))).size !== store.entries.length ||
        Buffer.byteLength(JSON.stringify(store), 'utf8') > SAVED_SUBJECTS_LIMITS.bytes) {
      return { valid: false, reason: 'malformed' };
    }
    return { valid: true, reason: null };
  } catch { return { valid: false, reason: 'malformed' }; }
}

/** Presence of JSON null is corrupt, unlike an absent native file. No bytes are written. */
export function parseLocalStore(bytes) {
  if (bytes == null) return { valid: true, reason: null, store: emptyStore() };
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > SAVED_SUBJECTS_LIMITS.bytes) return { valid: false, reason: 'malformed' };
    const store = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    if (store == null) return { valid: false, reason: 'malformed' };
    const result = validateLocalStore(store);
    return result.valid ? { ...result, store } : result;
  } catch { return { valid: false, reason: 'malformed' }; }
}

function validGeneration(value) {
  return closed(value, ['id', 'sequence', 'decision_sha256']) && safeText(value.id) &&
    Number.isSafeInteger(value.sequence) && value.sequence > 0 &&
    typeof value.decision_sha256 === 'string' && hashPattern.test(value.decision_sha256);
}

function validArticleTarget(value) {
  return closed(value, ['article_binding_id', 'article_id', 'observance_ids']) &&
    id(value.article_binding_id) && id(value.article_id) && Array.isArray(value.observance_ids) &&
    value.observance_ids.length > 0 && value.observance_ids.every(id);
}

/** Valid shape is not authenticated. Native adapters enforce all frozen catalog checks. */
export function validateVerifiedView(view) {
  return closed(view, ['generation', 'identities']) && validGeneration(view.generation) &&
    Array.isArray(view.identities) && view.identities.every(identity =>
      closed(identity, ['key', 'name', 'article_targets']) && validSavedKey(identity.key) && validName(identity.name) &&
      Array.isArray(identity.article_targets) && identity.article_targets.every(validArticleTarget)) &&
    new Set(view.identities.map(identity => keyToken(identity.key))).size === view.identities.length;
}

function identityIn(view, key) {
  return validateVerifiedView(view) ? view.identities.find(identity => equalKey(identity.key, key)) : undefined;
}

export function target({ explicit_key = null, candidate_keys, view }) {
  if (explicit_key != null && !validSavedKey(explicit_key)) throw new TypeError('Invalid explicit saved-subject key');
  if (!Array.isArray(candidate_keys)) throw new TypeError('Invalid saved-subject target candidates');
  if (explicit_key != null) return identityIn(view, explicit_key)
    ? { state: 'available', key: clone(explicit_key) } : { state: 'unavailable' };
  if (!validateVerifiedView(view)) return { state: 'unavailable' };
  const candidates = new Map();
  for (const candidate of candidate_keys) {
    if (validSavedKey(candidate) && candidate.kind === 'observance' && identityIn(view, candidate)) {
      candidates.set(keyToken(candidate), candidate);
    }
  }
  if (candidates.size > 1) return { state: 'ambiguous' };
  return candidates.size === 1 ? { state: 'available', key: clone(candidates.values().next().value) } : { state: 'unavailable' };
}

function deduplicateTargets(targets) {
  const byTarget = new Map();
  for (const item of targets) {
    const key = `${item.article_binding_id}:${item.article_id}`;
    const existing = byTarget.get(key) ?? { article_binding_id: item.article_binding_id, article_id: item.article_id, observance_ids: new Set() };
    for (const observanceId of item.observance_ids) existing.observance_ids.add(observanceId);
    byTarget.set(key, existing);
  }
  return [...byTarget.values()].map(item => ({ ...item, observance_ids: [...item.observance_ids].sort(ascii) }))
    .sort((left, right) => ascii(left.article_binding_id, right.article_binding_id) || ascii(left.article_id, right.article_id));
}

export function resolve({ record, view }) {
  if (!validRecord(record)) throw new TypeError('Invalid saved-subject record');
  const result = { state: 'catalog_unavailable', key: clone(record.key), name: clone(record.last_known_name), article_targets: [], generation: null };
  if (!validateVerifiedView(view)) return result;
  result.generation = clone(view.generation);
  const identity = view.identities.find(item => equalKey(item.key, record.key));
  if (!identity) return { ...result, state: 'identity_unavailable' };
  const articles = deduplicateTargets(identity.article_targets);
  return { ...result, state: articles.length === 0 ? 'text_unavailable' : articles.length === 1 ? 'one_article' : 'choose_article',
    name: clone(identity.name), article_targets: articles };
}

/** Pure transaction model; write_succeeds simulates durable persistence, not native I/O. */
export function mutate({ store = null, action, key, view, write_succeeds }) {
  if (!['save', 'remove'].includes(action) || !validSavedKey(key) || typeof write_succeeds !== 'boolean') {
    throw new TypeError('Invalid saved-subject mutation');
  }
  if (!validateLocalStore(store).valid) return { state: 'store_unavailable', store };
  const current = store ?? emptyStore();
  const unchanged = state => ({ state, store: current });
  const index = current.entries.findIndex(record => equalKey(record.key, key));
  let entries, state;
  if (action === 'remove') {
    if (index < 0) return unchanged('unchanged');
    entries = current.entries.filter((_, itemIndex) => itemIndex !== index);
    state = 'removed';
  } else {
    const identity = identityIn(view, key);
    if (!identity) return unchanged('identity_unavailable');
    const record = { key: clone(key), last_known_name: clone(identity.name) };
    if (index >= 0) {
      if (['sr-Cyrl', 'sr-Latn'].every(locale => current.entries[index].last_known_name[locale] === record.last_known_name[locale])) {
        return unchanged('unchanged');
      }
      entries = current.entries.map((item, itemIndex) => itemIndex === index ? record : item);
    } else {
      if (current.entries.length === SAVED_SUBJECTS_LIMITS.entries) return unchanged('limit_reached');
      entries = [record, ...current.entries];
    }
    state = 'saved';
  }
  if (!write_succeeds) return unchanged('write_failed');
  return { state, store: { schema_version: SAVED_SUBJECTS_SCHEMA, entries: clone(entries) } };
}
