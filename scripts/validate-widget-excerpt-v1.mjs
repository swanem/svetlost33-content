import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../schemas/widget-excerpt-v1/widget-excerpt.schema.json', import.meta.url)));
const validShape = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const blocked = reason => ({ eligible: false, reason });
const exactArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const consecutive = values => Array.isArray(values) && values.length > 0 && values.every((v, i) => Number.isInteger(v) && v > 0 && (i === 0 || v === values[i - 1] + 1));
export const WIDGET_EXCERPT_LABEL = Object.freeze({ 'sr-Cyrl': 'извод', 'sr-Latn': 'izvod' });

export function excerptReference(locale, psalmId, verseNumbers) {
  const prefix = locale === 'sr-Cyrl' ? 'Пс' : 'Ps';
  const translator = locale === 'sr-Cyrl' ? 'Даничић' : 'Daničić';
  const verses = verseNumbers.length === 1 ? `${verseNumbers[0]}` : `${verseNumbers[0]}–${verseNumbers.at(-1)}`;
  return `${prefix} ${psalmId.slice(6)},${verses} · ${translator}`;
}

export function evaluateWidgetExcerpt(excerpt, context = {}) {
  if (excerpt === undefined || excerpt === null) return blocked('absent');
  if (typeof excerpt === 'object' && !Array.isArray(excerpt) && typeof excerpt.schema_version === 'string' && excerpt.schema_version !== 'svetlost33-widget-excerpt-1') return blocked('unsupported_schema');
  if (!validShape(excerpt) || [excerpt.text, excerpt.reference].some(value => value.trim() !== value || /[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/u.test(value))) return blocked('malformed');
  if (excerpt.review_status !== 'approved') return blocked('unapproved');
  if (context.contentAuthenticated !== true) return blocked('content_not_authenticated');
  const quote = context.quote, psalm = context.psalm;
  if (!quote || !psalm || typeof quote.text !== 'string' || excerpt.locale !== context.locale || excerpt.source_slot_id !== context.slotId ||
      ['psalm_id', 'source_id', 'source_url', 'numbering'].some(key => excerpt[key] !== quote[key]) ||
      psalm.id !== quote.psalm_id || psalm.source_id !== quote.source_id || psalm.numbering !== quote.numbering) return blocked('source_mismatch');
  if (hash(quote.text) !== excerpt.source_text_sha256) return blocked('source_hash_mismatch');
  if (hash(excerpt.text) !== excerpt.text_sha256) return blocked('text_hash_mismatch');
  if (!quote.text.startsWith(excerpt.text) || excerpt.text.length >= quote.text.length) return blocked('not_literal_prefix');
  if (excerpt.source_range.start !== 0 || excerpt.source_range.end !== [...excerpt.text].length) return blocked('range_mismatch');
  if (!consecutive(quote.verse_numbers) || !consecutive(excerpt.verse_numbers) ||
      !exactArray(excerpt.verse_numbers, quote.verse_numbers.slice(0, excerpt.verse_numbers.length)) || !Array.isArray(psalm.verses)) return blocked('verse_mismatch');
  const verseText = numbers => {
    const selected = numbers.map(number => psalm.verses.filter(verse => verse.number === number));
    if (selected.some(matches => matches.length !== 1 || typeof matches[0].text !== 'string')) return null;
    return selected.map(matches => matches[0].text).join(' ');
  };
  const full = verseText(quote.verse_numbers), selected = verseText(excerpt.verse_numbers);
  if (full !== quote.text || selected === null || !selected.startsWith(excerpt.text)) return blocked('verse_mismatch');
  if (excerpt.reference !== excerptReference(context.locale, quote.psalm_id, excerpt.verse_numbers) ||
      quote.reference !== excerptReference(context.locale, quote.psalm_id, quote.verse_numbers)) return blocked('reference_mismatch');
  return { eligible: true, reason: null };
}
