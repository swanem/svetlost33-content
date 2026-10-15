// Shared, side-effect-free radio monitor core. No scheduler, publishing or signing.
// Derived from svetlost33-github/scripts/monitor-radio-calendar.mjs; exact-year,
// full-range and normalized-date checks are stricter here. Existing runner is untouched.
import { createHash } from 'node:crypto';

const books = new Map([
  ['Матеју', 'MAT'], ['Матеја', 'MAT'], ['Матеј', 'MAT'],
  ['Марку', 'MRK'], ['Марка', 'MRK'], ['Марко', 'MRK'],
  ['Луки', 'LUK'], ['Луке', 'LUK'], ['Лука', 'LUK'],
  ['Јовану', 'JHN'], ['Јована', 'JHN'], ['Јован', 'JHN'],
]);
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const text = html => normalize(html.replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"'));

export function supportedYear(year) {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error('unsupported_year');
  return year;
}
export function sourceURL(year) {
  return `https://www.slovoljubve.com/cir/TumacenjaJevandjeljaKalendar.asp?Godina=${supportedYear(year)}`;
}
export function buildGospelIndex(corpus) {
  const index = new Map();
  for (const book of corpus.books) for (const chapter of book.chapters) {
    const key = `${book.id}:${chapter.number}`;
    if (index.has(key)) throw new Error('duplicate_corpus_chapter');
    const verses = new Set(chapter.verses.map(verse => verse.number));
    if (!verses.size || verses.size !== chapter.verses.length) throw new Error('invalid_corpus_verses');
    index.set(key, verses);
  }
  if (index.size !== 89) throw new Error('incomplete_gospel_corpus');
  return index;
}
export function referenceErrors(raw, index) {
  const match = normalize(raw).match(/^Јеванђеље\s+(?:по|од)?\s*(\S+?),?\s+зачало\s*[,\s\d]+(?:\s+од пола)?[.\s(]+([0-9,; .–—-]+)\)?$/u);
  if (!match || !books.has(match[1])) return [{ code: 'unparsed_reference' }];
  const errors = [], book = books.get(match[1]);
  let inheritedChapter = null;
  for (const [segment, part] of match[2].trim().replace(/[–—]/g, '-').split(';').entries()) {
    const range = part.trim().match(/^(?:(\d+),)?(\d+)(?:-(?:(\d+),)?(\d+))?$/);
    if (!range) { errors.push({ code: 'unparsed_range', segment }); continue; }
    const chapter = range[1] ? Number(range[1]) : inheritedChapter;
    const endChapter = range[3] ? Number(range[3]) : chapter;
    const first = Number(range[2]), last = range[4] ? Number(range[4]) : first;
    inheritedChapter = endChapter;
    if (!Number.isInteger(chapter) || !Number.isInteger(endChapter)
        || chapter < 1 || endChapter < chapter || endChapter > 28
        || first < 1 || last < 1 || (chapter === endChapter && first > last)) {
      errors.push({ code: 'invalid_or_reversed_range', segment }); continue;
    }
    if (!index.get(`${book}:${chapter}`)?.has(first)
        || !index.get(`${book}:${endChapter}`)?.has(last)) {
      errors.push({ code: 'invalid_verse_endpoint', segment }); continue;
    }
    for (let c = chapter; c <= endChapter; c++) {
      const verses = index.get(`${book}:${c}`);
      if (!verses?.size) { errors.push({ code: 'missing_chapter', segment, chapter: c }); break; }
      const from = c === chapter ? first : 1;
      const to = c === endChapter ? last : Math.max(...verses);
      for (let verse = from; verse <= to; verse++) {
        if (!verses.has(verse)) errors.push({ code: 'missing_interior_verse', segment, chapter: c, verse });
      }
    }
  }
  return errors;
}
export function parseRadioHtml(html, year, index) {
  supportedYear(year);
  if (typeof html !== 'string' || Buffer.byteLength(html) > 5_000_000) throw new Error('response_limit');
  if (!text(html).includes(`Тумачења Јеванђеља за ${year}. годину`)) throw new Error('year_header_mismatch');
  const rows = [], seen = new Set();
  const starts = [...html.matchAll(/<tr\b[^>]*\bid\s*=\s*["'](Datum[^"']*)["']/gi)];
  const matches = [...html.matchAll(/<tr\b[^>]*\bid\s*=\s*["'](Datum[^"']*)["'][^>]*>([\s\S]*?)<\/tr>/gi)];
  if (starts.length !== matches.length) throw new Error('html_shape_changed');
  for (const match of matches) {
    if (!/^Datum\d{8}$/.test(match[1])) throw new Error('invalid_date_row_id');
    const compact = match[1].slice(5);
    const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6)}`;
    const parsed = Date.parse(`${date}T00:00:00Z`);
    if (!date.startsWith(`${year}-`) || Number.isNaN(parsed)
        || new Date(parsed).toISOString().slice(0, 10) !== date) throw new Error('invalid_civil_date');
    if (seen.has(date)) throw new Error('duplicate_date');
    seen.add(date);
    const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(value => value[1]);
    if (cells.length !== 3) throw new Error('html_shape_changed');
    const chunks = [...new Set(cells[2].split(/<br\s*\/?\s*>/i).map(text).filter(Boolean))];
    const references = chunks.filter(value => value.includes('Јеванђеље'));
    const notes = chunks.filter(value => !value.includes('Јеванђеље'));
    rows.push({ date, references, notes,
      supplemental_blessing: notes.some(value => value.includes('нема читања')),
      validation_errors: references.flatMap((value, reference) =>
        referenceErrors(value, index).map(error => ({ reference, ...error }))),
    });
  }
  if (!rows.length || rows.length > 366) throw new Error('no_usable_rows');
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function reviewObservation(previous, rows, { year, checkedAt }) {
  supportedYear(year);
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row.date.startsWith(`${year}-`))) throw new Error('invalid_observation');
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error('invalid_check_time');
  if (previous && previous.year !== year) throw new Error('mixed_year_state');
  const before = new Map((previous?.rows ?? []).map(row => [row.date, row]));
  const after = new Map(rows.map(row => [row.date, row]));
  const added = [], changed = [], removed = [];
  for (const row of rows) {
    if (!before.has(row.date)) added.push(row);
    else if (JSON.stringify(before.get(row.date)) !== JSON.stringify(row)) changed.push({ date: row.date, before: before.get(row.date), after: row });
  }
  for (const row of before.values()) if (!after.has(row.date)) removed.push(row);
  const diff = { added, changed, removed };
  const changedAny = added.length + changed.length + removed.length > 0;
  const fingerprint = hash(JSON.stringify({ year, diff }));
  const alreadySeen = previous?.seen_fingerprints?.includes(fingerprint) ?? false;
  const validationFailed = rows.some(row => row.validation_errors.length > 0);
  const state = { year,
    rows: structuredClone(validationFailed ? (previous?.rows ?? []) : rows),
    last_success_at: validationFailed ? (previous?.last_success_at ?? null) : checkedAt,
    last_observed_at: checkedAt,
    seen_fingerprints: [...new Set([...(previous?.seen_fingerprints ?? []), ...(changedAny ? [fingerprint] : [])])] };
  return { state, candidate: changedAny ? {
    schema_version: 'radio-calendar-review-candidate-2', year, source_url: sourceURL(year),
    checked_at: checkedAt, fingerprint, diff, validation_failed: validationFailed,
    release_allowed: false, production_ready: false,
  } : null, notification_needed: changedAny && !alreadySeen, validation_failed: validationFailed };
}
