import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hash = b => createHash('sha256').update(b).digest('hex');
const inputs = [
  ['saints-year-end-block1-2026-10-06', '13e19c3406397d5bf30ab0e03c8e060d4ae8fafd1be38583b76dc18615777ca1'],
  ['saints-year-end-block2-2026-10-06', '54bb0a1475199c0aa0884c7a32409ca0aef9033967d4055c14717751b5f1cc8d'],
];
const blocks = [];
for (const [folder, pin] of inputs) {
  const root = resolve(here, '..', folder);
  const hb = await readFile(resolve(root, 'handoff.json'));
  assert.equal(hash(hb), pin);
  const h = JSON.parse(hb);
  const files = {};
  for (const name of ['master.json', 'sources.json']) {
    const b = await readFile(resolve(root, name));
    const record = h.artifacts.find(x => x.path === name);
    assert.equal(b.length, record.bytes); assert.equal(hash(b), record.sha256);
    files[name] = JSON.parse(b);
  }
  assert.equal(files['master.json'].owner_approval, null);
  assert.equal(files['master.json'].articles.length, 21);
  blocks.push({ master: files['master.json'], sources: files['sources.json'].sources });
}
const outputs = [];
for (const script of ['sr-Cyrl', 'sr-Latn']) {
  const cyrl = script === 'sr-Cyrl';
  const file = cyrl ? 'PREGLED-CIRILICA.md' : 'PREGLED-LATINICA.md';
  const other = cyrl ? 'PREGLED-LATINICA.md' : 'PREGLED-CIRILICA.md';
  const lines = [
    cyrl ? '# Нацрт 42 нова текста о светитељима и празницима' : '# Nacrt 42 nova teksta o svetiteljima i praznicima', '',
    cyrl ? 'За преглед и одобрење за апликацију Светлост33. Обухват је од 20. новембра до 31. децембра 2026. Постојећа 62 одобрена текста остају непромењена. Ових 42 текста још нису одобрена нити објављена.' : 'Za pregled i odobrenje za aplikaciju Svetlost33. Obuhvat je od 20. novembra do 31. decembra 2026. Postojeća 62 odobrena teksta ostaju nepromenjena. Ovih 42 teksta još nisu odobrena niti objavljena.', '',
    cyrl ? 'Кратки ауторски сажеци ослањају се на наведене црквене изворе. Одељак „Шта издвајамо” је засебна уредничка поука, а не цитат из извора. Избор датума прати постојећи календар апликације; ово није потпуна листа свих дневних спомена нити црквено одобрено издање.' : 'Kratki autorski sažeci oslanjaju se na navedene crkvene izvore. Odeljak „Šta izdvajamo” je zasebna urednička pouka, a ne citat iz izvora. Izbor datuma prati postojeći kalendar aplikacije; ovo nije potpuna lista svih dnevnih spomena niti crkveno odobreno izdanje.', '',
    cyrl ? 'За Григорија Горњачког место и тачна година упокојења нису наведени јер нису усаглашени. Не додају се непроверене тврдње.' : 'Za Grigorija Gornjačkog mesto i tačna godina upokojenja nisu navedeni jer nisu usaglašeni. Ne dodaju se neproverene tvrdnje.', '',
    `[${cyrl ? 'Исти текстови на латиници' : 'Isti tekstovi na ćirilici'}](${other})`, '',
  ];
  let count = 0;
  for (const { master, sources } of blocks) for (const row of master.rows) {
    const article = master.articles.find(a => a.id === row.article_id);
    assert.ok(article); const c = article.content[script];
    const [year, month, day] = row.date.split('-');
    const monthName = month === '11' ? (cyrl ? 'новембар' : 'novembar') : (cyrl ? 'децембар' : 'decembar');
    lines.push(`## ${Number(day)} ${monthName} ${year} ${c.title}`, '', c.intro, '', ...c.body.flatMap(p => [p, '']));
    const links = article.source_ids.map(id => { const source = sources.find(s => s.id === id); assert.ok(source); return `[${source.title}](${source.url})`; });
    lines.push(`${cyrl ? 'Извори' : 'Izvori'}: ${links.join('; ')}.`, '', `### ${cyrl ? 'Шта издвајамо' : 'Šta izdvajamo'}`, '', c.takeaway, '');
    count++;
  }
  assert.equal(count, 42);
  const b = Buffer.from(lines.join('\n'));
  await writeFile(resolve(here, file), b, { flag: 'wx' });
  outputs.push({ path: file, bytes: b.length, sha256: hash(b), articles: count, script });
}
const receipt = { status: 'EXACT_PENDING_MASTER_READING_VIEWS_NOT_APPROVAL', inputs: inputs.map(([folder, sha256]) => ({ folder, handoff_sha256: sha256 })), outputs, source_text_modified: false, published: false, owner_approval: null };
await writeFile(resolve(here, 'preview-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt, null, 2));
