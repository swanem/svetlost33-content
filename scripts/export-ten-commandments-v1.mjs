#!/usr/bin/env node
// Deterministic local bundle resource only. No OTA schema, transport or publishing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const INPUTS = Object.freeze({
  manuscript: { path: 'drafts/ten-commandments-2026-10-05/manuscript.json', sha256: '55a86a22200408ef594eaf99bf2f4ab376dc2e7be3c2556cf8b7b66e160ffdaf' },
  sources: { path: 'drafts/ten-commandments-2026-10-05/sources.json', sha256: 'fdce8a0790bf25bda01b3852cba9a53e1428c659f8dada92135a00656525b15d' },
  approval: { path: 'approvals/ten-commandments-2026-10-05/approval.json', sha256: '17b0582b4fad2fe6257099f5cc76001c15552dbef6e5202deb43d3044756eeae' },
  validation: { path: 'drafts/ten-commandments-2026-10-05/validation.json', sha256: '01bf18fa0be1de5820f2eb503f7c91e59ecd788597aef3138523db4b011f84dd' }
});
export const OUTPUT = 'exports/ten-commandments-v1/ten-commandments.json';
export const LABELS = Object.freeze(['title', 'card_description', 'introduction', 'summary_label',
  'summary_attribution', 'explanation_label', 'explanation_note', 'full_text_label', 'sources_label']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const alphabet = [...'АБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШабвгдђежзијклљмнњопрстћуфхцчџш'];
const latin = ['A','B','V','G','D','Đ','E','Ž','Z','I','J','K','L','Lj','M','N','Nj','O','P','R','S','T','Ć','U','F','H','C','Č','Dž','Š','a','b','v','g','d','đ','e','ž','z','i','j','k','l','lj','m','n','nj','o','p','r','s','t','ć','u','f','h','c','č','dž','š'];
export const transliterate = text => [...text].map(c => { const i = alphabet.indexOf(c); return i < 0 ? c : latin[i]; }).join('');
const pair = cyrl => ({ 'sr-Cyrl': cyrl, 'sr-Latn': transliterate(cyrl) });
const pick = (value, fields) => Object.fromEntries(fields.map(k => [k, structuredClone(value[k])]));

export async function readInputs() {
  return Object.fromEntries(await Promise.all(Object.entries(INPUTS).map(async ([key, pin]) => [key, await readFile(resolve(ROOT, pin.path))])));
}
export function projectTenCommandments(raw) {
  const docs = {};
  for (const [name, pin] of Object.entries(INPUTS)) {
    assert.ok(Buffer.isBuffer(raw[name]), `${name} raw bytes required`);
    assert.equal(sha256(raw[name]), pin.sha256, `exact ${name} hash`);
    docs[name] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw[name]));
  }
  const { manuscript: m, sources: s, approval: a, validation: v } = docs;
  assert.equal(a.status, 'CONTENT_APPROVED_FOR_PLANNED_INTEGRATION');
  assert.deepEqual(pick(a.approved_manuscript, ['path', 'sha256', 'revision']), { ...INPUTS.manuscript, revision: 1 });
  assert.deepEqual(a.source_record, INPUTS.sources);
  assert.equal(v.manuscript_sha256, INPUTS.manuscript.sha256);
  assert.equal(v.localized_pairs, 48);
  assert.equal(m.id, 'ten-commandments'); assert.equal(m.revision, 1);
  assert.equal(m.items.length, 10); assert.equal(m.biblical_reading.verses.length, 17);
  // Explicit nested allowlist; no spread of manuscript/source draft objects.
  const out = {
    id: m.id, revision: m.revision, ...pick(m, LABELS),
    items: m.items.map(item => ({
      ...pick(item, ['id', 'number', 'text', 'explanation']),
      references: item.references.map(r => pick(r, ['source_id', 'book_id', 'chapter', 'verse_from', 'verse_to']))
    })),
    biblical_reading: {
      ...pick(m.biblical_reading, ['source_id', 'book_id', 'chapter', 'verse_from', 'verse_to', 'label', 'attribution']),
      verses: m.biblical_reading.verses.map(v => pick(v, ['number', 'text']))
    },
    sources: s.sources.map(source => ({
      id: source.id, url: source.url,
      ...(source.title ? { title: pair(source.title) } : {}),
      ...(source.translator ? { translator: pair(source.translator) } : {})
    }))
  };
  out.items.forEach((item, i) => {
    assert.equal(item.id, `commandment-${i + 1}`); assert.equal(item.number, i + 1);
    item.references.forEach(r => assert.ok(out.sources.some(s => s.id === r.source_id)));
  });
  out.biblical_reading.verses.forEach((verse, i) => assert.equal(verse.number, i + 1));
  return out;
}
export const serializeTenCommandments = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
export async function exportTenCommandments({ check = false } = {}) {
  const bytes = serializeTenCommandments(projectTenCommandments(await readInputs()));
  const path = resolve(ROOT, OUTPUT);
  if (check) assert.deepEqual(await readFile(path), bytes, 'checked-in export must match approved projection');
  else {
    await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, bytes, { flag: 'wx' }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; assert.deepEqual(await readFile(path), bytes, 'existing export differs; no overwrite'); }
  }
  return { status: 'PASS', path: OUTPUT, id: 'ten-commandments', revision: 1, bytes: bytes.length,
    sha256: sha256(bytes), commandments: 10, explanations: 10, biblical_verses: 17,
    copied_manuscript_localized_pairs: 48, derived_source_title_translator_pairs: 4,
    public_distribution_executed: false, native_acceptance_claimed: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'Usage: [--check]');
  console.log(JSON.stringify(await exportTenCommandments({ check: process.argv.includes('--check') }), null, 2));
}
