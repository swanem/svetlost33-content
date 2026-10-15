import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inspectCandidate, loadInputs, sha256, verifyManifest } from './inspect.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Pure review renderer. Output is derived, never a separately editable manuscript. */
export function renderReview(inputs) {
  const { report } = inspectCandidate(inputs);
  const manuscriptSha256 = sha256(Buffer.from(`${JSON.stringify(inputs.manuscript, null, 2)}\n`));
  const lines = [
    '# Svetitelji 21.10–19.11.2026 — pregled za odobrenje', '',
    'Status: **LOKALNI NACRT — nije odobren, potpisan ni objavljen.**', '',
    'Svih 30 novih sažetaka na oba pisma ispod je izvedeno iz istog rukopisa.',
    'Tekstovi su originalni sažeci uz AI pomoć; završno „Šta izdvajamo“ je urednički osvrt, ne citat svetitelja.',
    'Stara 32 članka nisu menjana. Novi tekstovi još čekaju ljudski urednički pregled i odobrenje vlasnika; sveštenički pregled nije evidentiran.', '',
    `Rukopis SHA-256: \`${manuscriptSha256}\`.`,
    `Spojeni DRAFT preview: ${report.total_articles} članaka, ${report.compact_preview_bytes} bajtova; SHA-256 \`${report.preview_sha256}\`.`, '',
    'Datumi su vezani za postojeći odobreni godišnji kalendar. Novembarski kalendarski URL nije ponovo otvoren 30.09.2026; koristi se pinovani source zapis od 15.09.2026. Biografski izvori otvoreni su 30.09.2026.',
    'Ovo je izbor jednog članka za svaki dan, ne potpuna lista svih svetiteljskih spomena.',
    'Kanonske veze za Svetu Petku i Svetog Dimitrija samo su predlozi za poseban pregled; ostalim člancima nije izmišljen aktivni kanonski ID.', '',
    'Ovaj fajl se ne uređuje ručno. Ponovljiv izvoz: `node drafts/saints-next-window-2026-09-30/export-review.mjs`; provera: ista komanda sa `--check`. Izvoz piše samo na standardni izlaz, nikada u produkciju.', '',
  ];
  for (const day of inputs.inventory.days) {
    const date = day.date.split('-').reverse().join('.');
    if (day.article_id === null) { lines.push(`## ${date} — nije pripremljeno`, '', day.gap_reason, ''); continue; }
    const article = inputs.manuscript.articles.find(x => x.id === day.article_id);
    lines.push(`## ${date} — ${article.content['sr-Latn'].title}`, '', `Članak: \`${article.id}\`. Julijanski datum iz kalendara: ${day.julian_date}.`, '');
    for (const [script, label, takeaway] of [['sr-Cyrl', 'Ћирилица', 'Шта издвајамо'], ['sr-Latn', 'Latinica', 'Šta izdvajamo']]) {
      const content = article.content[script];
      lines.push(`### ${label}`, '', content.title, '', content.intro, '');
      for (const paragraph of content.body) lines.push(paragraph, '');
      lines.push(`**${takeaway}:** ${content.takeaway}`, '');
    }
    lines.push('### Izvori i status', '');
    for (const id of article.source_ids) {
      const { source } = inputs.sources.biography_sources.find(x => x.source.id === id);
      lines.push(`- [${source.title}](${source.url}) — ${source.publisher}; pregledano ${source.reviewed_on}.`);
    }
    lines.push('', 'Prava/poreklo: originalni sažetak uz AI pomoć; bez doslovnih citata i bez tvrdnje o licenci izvornog teksta. Odobrenje novog rukopisa: čeka se.', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'only stdout export or read-only --check is supported');
  await verifyManifest();
  const inputs = await loadInputs();
  assert.equal(await readFile(resolve(here, 'manuscript.json'), 'utf8'), `${JSON.stringify(inputs.manuscript, null, 2)}\n`, 'review hash must identify exact manuscript bytes');
  const rendered = renderReview(inputs);
  if (process.argv[2] === '--check') {
    assert.equal(await readFile(resolve(here, 'PREGLED.md'), 'utf8'), rendered);
    console.log('PASS: PREGLED.md matches exact candidate manuscript, both scripts and source URLs. No writes.');
  } else process.stdout.write(rendered);
}
