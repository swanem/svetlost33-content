import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = await readFile(new URL('./manuscript.json', import.meta.url));
const manuscript = JSON.parse(raw);
const sources = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const alphabet = [...'АБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШабвгдђежзијклљмнњопрстћуфхцчџш'];
const latin = ['A','B','V','G','D','Đ','E','Ž','Z','I','J','K','L','Lj','M','N','Nj','O','P','R','S','T','Ć','U','F','H','C','Č','Dž','Š','a','b','v','g','d','đ','e','ž','z','i','j','k','l','lj','m','n','nj','o','p','r','s','t','ć','u','f','h','c','č','dž','š'];
const transliterate = s => [...s].map(c => { const i = alphabet.indexOf(c); return i < 0 ? c : latin[i]; }).join('');
let localizedPairs = 0;
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if ('sr-Cyrl' in value) {
    assert.equal(value['sr-Latn'], transliterate(value['sr-Cyrl']));
    assert(!/\p{Script=Latin}/u.test(value['sr-Cyrl']));
    assert(!/\p{Script=Cyrillic}/u.test(value['sr-Latn']));
    localizedPairs++;
  }
  Object.values(value).forEach(visit);
}
visit(manuscript);
assert.equal(manuscript.items.length, 10);
assert.equal(manuscript.publication_authorized, false);
assert.equal(manuscript.runtime_schema, false);
assert.equal(manuscript.owner_approval, null);
assert.equal(manuscript.clerical_review, null);
const exodus = [[2,3],[4,6],[7,7],[8,11],[12,12],[13,13],[14,14],[15,15],[16,16],[17,17]];
const deuteronomy = [[6,7],[8,10],[11,11],[12,15],[16,16],[17,17],[18,18],[19,19],[20,20],[21,21]];
manuscript.items.forEach((item, index) => {
  assert.equal(item.number, index + 1);
  assert.equal(item.id, `commandment-${index + 1}`);
  assert.equal(item.text_kind, 'editorial_abbreviation');
  assert.deepEqual(item.references.map(r => [r.book_id, r.chapter, r.verse_from, r.verse_to]), [
    ['EXO', 20, ...exodus[index]], ['DEU', 5, ...deuteronomy[index]]
  ]);
  item.references.forEach(r => assert(sources.sources.some(s => s.id === r.source_id)));
});
assert.equal(manuscript.biblical_reading.verses.length, 17);
manuscript.biblical_reading.verses.forEach((v, i) => assert.equal(v.number, i + 1));
const report = {
  scope: 'Editorial draft validation, not native reader or publication validation',
  checked_at: new Date().toISOString(),
  manuscript_sha256: sha(raw),
  commandments: 10, biblical_verses: 17, localized_pairs: localizedPairs,
  numbering_and_references: 'PASS', script_and_transliteration: 'PASS',
  publication_authorized: false,
  live_source_comparison: 'NOT_RUN'
};
if (process.argv.includes('--verify-source')) {
  const url = 'https://ebible.org/srp1868/EXO20.htm';
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  assert(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  const html = bytes.toString('utf8');
  for (const verse of manuscript.biblical_reading.verses) {
    const start = html.indexOf(`id="V${verse.number}">`);
    assert(start >= 0);
    const afterNumber = html.indexOf('</span>', start) + 7;
    const end = html.indexOf('<span class="verse"', afterNumber);
    assert(end > afterNumber);
    const text = html.slice(afterNumber, end).replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    assert.equal(verse.text['sr-Cyrl'], text, `EXO 20:${verse.number}`);
  }
  report.live_source_comparison = '17/17 exact after HTML and whitespace normalization';
  report.source_url = url;
  report.source_html_sha256 = sha(bytes);
}
console.log(JSON.stringify(report, null, 2));
