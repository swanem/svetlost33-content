# I3 — први уреднички пакет, 21.09–20.10.2026.

Статус: **радни нацрт, без одобрења за објаву**. Ово није нови saints-v1 payload, каталог, fixture или издање. Нема новог потписа, активирања, аутентификационог контекста нити измене постојећих бајтова. Налог да се I3 настави није одобрење ових тачних текстова.

У прозору од 30 дана већ је објављено пет текстова (21–25. септембар). Припремљено је седам нових нацрта (26. септембар–2. октобар); преосталих 18 дана нема нови нацрт. Дакле, сада је доступно 5/30 дана, не 12/30: седам нацрта тек чека преглед. Свих седам раније одобрених текстова, укључујући 19–20. септембар ван овог прозора, остају непромењени.

## Садржај радног пакета

- [TEKSTOVI.md](TEKSTOVI.md): једини ручно уређиван ћирилични читалачки рукопис; седам оригиналних сажетака.
- [articles.json](articles.json): врста текста, датуми, маркер рукописа и кратка мапа тврдњи по одељцима. `body[0]` значи први пасус одељка „За читање”.
- [sources.json](sources.json): примарни црквени извори, начин приступа, изворни издавач/аутор и нерешена питања. Нема копираних житија.
- [coverage.json](coverage.json): тачни календарски редови и везе на непромењене објављене артефакте.
- [canonical-inventory.json](canonical-inventory.json): снимак постојећих идентитета и article links; нови односи су само предлози за преглед.
- [VALIDATION.json](VALIDATION.json): резултат доле наведене провере; није уредничко, власничко или црквено одобрење.

Основа је TR-04 и I3 (§7) у канонској спецификацији/плану суседног svetlost33-github репозиторијума. Закључани продуктни улаз је commit `77fbf5bc32115a73eff9b2e4e246433d2f70ff6d`: спецификација SHA-256 `bb91445592a6e8bc072328d1745fe53f0d08239bddf3e2f2f5b40b5c09cfbfc8`; план `d297e0216ed61456daa1bc52e9b27148ca996b331042aef714a1746b18d93420`. Захтеви се овде не редефинишу.

## Датуми и границе доказа

Матрица потиче из тачног `calendar-2026-r1 / 2026.1.1 / r2` артефакта, SHA-256 `a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`, употребљеног у објављеном S7. Чувају се `date`, `julian_date`, изворни наслов и source IDs. Разлика 13 дана проверава се само за овај прозор 2026, не као универзални алгоритам за све векове.

Сви редови су `SOURCE_RECORDED`, али `complete_saint_list_verified=false`. Наслеђене DRAFT ознаке ширег календара остају забележене: ово не одобрава пост, богослужбени распоред или потпун списак светих. Доказ месеца је постојећи снимак извора од 15.09.2026, не нова тврдња да су све странице поново преузете.

Биографски извори су проверени на вебу 20.09.2026. OCA датум у адреси није грађански датум СПЦ нити датум објављивања; **никада се не увози као date-proof**. Извори из претраге и успешно отворени пуни прикази разликују се у евиденцији. Житијни наводи су црквено предање; нису представљени као независно утврђена историја сваког детаља.

| Грађански (2026) | Јулијански (2026) | Тачан назив у постојећем календару | Уредничко стање |
|---|---|---|---|
| 09-21 | 09-08 | Рођење Пресвете Богородице – Мала Госпојина | Постојећи одобрени текст |
| 09-22 | 09-09 | Свети праведни богородитељи Јоаким и Ана | Постојећи одобрени текст |
| 09-23 | 09-10 | Свете мученице Минодора, Митродора и Нимфодора | Постојећи одобрени текст |
| 09-24 | 09-11 | Преподобна Теодора Александријска | Постојећи одобрени текст |
| 09-25 | 09-12 | Свети свештеномученик Автоном (Оданије Рођења Пресвете Богородице) | Постојећи одобрени текст |
| 09-26 | 09-13 | Спомен освећења храма Васкрсења Господњег | Нови нацрт — чека преглед |
| 09-27 | 09-14 | Воздвижење часног Крста – Крстовдан | Нови нацрт — чека преглед |
| 09-28 | 09-15 | Свети великомученик Никита | Нови нацрт — чека преглед |
| 09-29 | 09-16 | Преподобни Доротеј | Нови нацрт — чека преглед |
| 09-30 | 09-17 | Свете мученице Вера, Нада и Љубав и мајка им Софија | Нови нацрт — чека преглед |
| 10-01 | 09-18 | Свети Евменије Гортински | Нови нацрт — чека преглед |
| 10-02 | 09-19 | Свети мученици Трофим, Саватије и Доримедонт | Нови нацрт — чека преглед |
| 10-03 | 09-20 | Свети великомученик Јевстатије | Нема новог текста |
| 10-04 | 09-21 | Свети апостол Кодрат (Оданије Воздвижења) | Нема новог текста |
| 10-05 | 09-22 | Свети свештеномученик Фока | Нема новог текста |
| 10-06 | 09-23 | Зачеће Светог Јована Претече и Крститеља | Нема новог текста |
| 10-07 | 09-24 | Света првомученица Текла | Нема новог текста |
| 10-08 | 09-25 | Преподобна Ефросинија | Нема новог текста |
| 10-09 | 09-26 | Свети апостол и јеванђелист Јован Богослов | Нема новог текста |
| 10-10 | 09-27 | Свети мученик Калистрат и остали | Нема новог текста |
| 10-11 | 09-28 | Преподобни Харитон Исповедник | Нема новог текста |
| 10-12 | 09-29 | Преподобни Киријак Отшелник – Михољдан | Нема новог текста |
| 10-13 | 09-30 | Свети свештеномученик Григорије | Нема новог текста |
| 10-14 | 10-01 | Покров Пресвете Богородице | Нема новог текста |
| 10-15 | 10-02 | Св. свештеномуч. Кипријан и Св. муч. Јустина девица | Нема новог текста |
| 10-16 | 10-03 | Свети свештеномученик Дионисије Ареопагит | Нема новог текста |
| 10-17 | 10-04 | Свети Јеротеј Атински | Нема новог текста |
| 10-18 | 10-05 | Света мученица Харитина | Нема новог текста |
| 10-19 | 10-06 | Свети апостол Тома – Томиндан | Нема новог текста |
| 10-20 | 10-07 | Свети мученици Сергије и Вакхо – Срђевдан | Нема новог текста |

Календарске напомене остају уз дан: на пример оданије 25.09. чува се из постојећег saints артефакта; оданије у наслову 04.10. није аутоматски нов текст о Кодрату или поновна појава Крстовдана. Не додајемо молитве, тропаре или кондаке.

## Идентитети и следећи инкремент

Активни каталог има 12 субјеката, 15 спомена, 13 годишњих појава и две article везе. У овом прозору постоје Мала Госпојина (21.09, са чланком) и Михољдан (12.10, без чланка). Михољдан је приоритет следећег пакета, уз нову проверу биографског извора, не аутоматски препис из имена.

Пет од седам ранијих чланака још нема везу са каталошким споменом. Нови предлози захтевају преглед идентитета, observance и article link; ниједан article ID није аутоматски saint ID. Избор из претраге чува observance; article-only чување тражи тачно једну проверену везу. Предлози у овом пакету не укључују ту функцију. Подаци за 2027. нису проширени; датум из 2026. не сме се приказати као датум за 2027.

## Пре одобрења и евентуалне објаве

Потребни су људски уреднички преглед тачног рукописа и идентитета, завршетак отворених изворних провера, разрешавање статуса права новог пакета и засебно власничко одобрење тачне ревизије. Нема прећутне црквене рецензије. Постојеће одобрење седам текстова није одобрење ових седам.

Изворни издавач и аутор нису аутори нашег сажетка. OCA збирна атрибуција превода не претвара се у доказан индивидуални потпис сваке странице. Уреднички текст је оригинално сажимање припремљено уз AI; „Шта издвајамо” је уреднички осврт, не цитат или молитва.

Сваки читалачки текст има 100–200 речи укупно у intro/body/takeaway, без наслова и метаподатака. Латиница се детерминистички изводи постојећом функцијом `toLatin`; не постоји други ручни мастер. Овде је проверена у меморији, није направљен runtime payload. Ако се касније одобри овај пакет, библиотека би имала 14, не 30 чланака. Постојеће границе су 64 чланка и 256 KiB; тек будући стварни извоз пролази пуне schema/byte/release провере.

За непокривене дане остаје искрена недоступност; не приказивати јучерашњи текст као данашњи. Радна матрица није резервна ауторитативна табела у апликацији.

## Поновљива провера

Из корена content репозиторијума; команда само чита. Проверава тачне изворне бајтове/датуме, број речи оба писма, везе извора, pending статусе и очуваност старог рукописа. Не проверава историјску истинитост предања, права или одобрење за објаву. Очуваност туђих локалних измена проверена је засебно током рада; њихов привремени hash није зависност овог садржајног пакета.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { wordCount, toLatin, SAINTS_LIMITS } from './scripts/validate-saints-v1.mjs';
const dir = 'drafts/saints-expansion-2026-09-21/';
const read = name => JSON.parse(fs.readFileSync(dir + name, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const coverage = read('coverage.json'), inventory = read('canonical-inventory.json');
const articles = read('articles.json'), sources = read('sources.json');
const bytes = fs.readFileSync(dir + 'TEKSTOVI.md'), md = bytes.toString('utf8');
const calendarBytes = fs.readFileSync(coverage.calendar_binding.repository_path);
const saintsBytes = fs.readFileSync(coverage.saints_binding.repository_path);
const catalogBytes = fs.readFileSync(coverage.catalog_binding.repository_path);
for (const [binding, payload] of [[coverage.calendar_binding, calendarBytes],
  [coverage.saints_binding, saintsBytes], [coverage.catalog_binding, catalogBytes]])
  assert.equal(sha(payload), binding.sha256);
assert.equal(sha(fs.readFileSync(coverage.baseline.production_index_path)),
  coverage.baseline.production_index_sha256);
assert.equal(sha(fs.readFileSync('drafts/saints-pilot-2026-09-19/TEKSTOVI.md')),
  '5847568a2aab22446ef4ab875fbceceecc9e800fad9344e5f23df59c4931ee2a');
const calendar = JSON.parse(calendarBytes), saints = JSON.parse(saintsBytes);
const catalog = JSON.parse(catalogBytes);
assert.equal(coverage.days.length, 30);
const shift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z')
  + n * 86400000).toISOString().slice(0, 10);
for (const [index, day] of coverage.days.entries()) {
  assert.equal(day.date, shift('2026-09-21', index));
  const original = calendar.days.find(d => d.date === day.date);
  assert.ok(original);
  assert.equal(day.julian_date, original.julian_date);
  assert.equal(day.julian_date, shift(day.date, -13)); // 2026 window only.
  assert.equal(day.calendar_title_cyrl, original.commemoration.title_cyrl);
  assert.equal(day.calendar_status, 'SOURCE_RECORDED');
  assert.equal(day.complete_saint_list_verified, false);
  assert.deepEqual(day.calendar_source_ids, original.commemoration.source_ids);
  const prior = saints.days.find(d => d.date === day.date);
  assert.deepEqual(day.existing_article_ids, prior?.article_ids ?? []);
  assert.deepEqual(day.existing_calendar_notes, prior?.calendar_notes ?? []);
  assert.deepEqual(day.existing_catalog_occurrence_ids,
    catalog.occurrences.filter(o => o.date === day.date).map(o => o.id));
}
assert.equal(coverage.days.filter(d => d.editorial_state === 'published_existing').length, 5);
assert.equal(coverage.days.filter(d => d.editorial_state === 'draft_pending').length, 7);
assert.equal(coverage.days.filter(d => d.editorial_state === 'not_drafted').length, 18);
assert.equal(inventory.counts.existing_article_links, 2);
assert.deepEqual(inventory.existing_article_links, catalog.article_links);
assert.equal(inventory.existing_articles.filter(a => !a.existing_observance_ids.length).length, 5);
assert.equal(articles.review_status, 'pending_human_review');
assert.equal(articles.owner_approval, null);
const sourceIds = new Set([...sources.sources, ...sources.date_proof.sources].map(s => s.id));
const chunks = md.split(/^## /m).slice(1);
assert.equal(chunks.length, 7);
assert.equal(articles.articles.length, 7);
assert.equal(new Set(articles.articles.map(a => a.id)).size, 7);
const counts = chunks.map(chunk => {
  const id = chunk.match(/<!-- article:(.*?) -->/)[1];
  const entry = articles.articles.find(a => a.id === id);
  assert.ok(entry);
  const text = ['Кратко', 'За читање', 'Шта издвајамо'].map(heading =>
    chunk.split('### ' + heading + '\n\n')[1].split('\n### ')[0].trim()).join('\n\n');
  assert.ok(!/[A-Za-z]/u.test(text), id + ': Cyrillic prose');
  const count = wordCount(text), latin = toLatin(text);
  assert.ok(count >= SAINTS_LIMITS.wordsMin && count <= SAINTS_LIMITS.wordsMax);
  assert.ok([...text].length <= SAINTS_LIMITS.proseScalars);
  assert.equal(wordCount(latin), count);
  assert.ok(!/[А-Яа-яЂђЈјЉљЊњЋћЏџ]/u.test(latin));
  assert.equal(entry.review_status, 'pending_human_review');
  assert.equal(entry.owner_approval, null);
  assert.equal(entry.rights_status, 'pending_for_new_package');
  assert.ok(entry.source_ids.length >= 1 && entry.source_ids.length <= 8);
  for (const sourceId of [...entry.source_ids, ...entry.claims.flatMap(c => c.source_ids)])
    assert.ok(sourceIds.has(sourceId), sourceId);
  const day = coverage.days.find(d => d.date === entry.date);
  assert.ok(day.draft_article_ids.includes(id));
  assert.equal(day.julian_date, entry.julian_date);
  assert.equal(entry.required_catalog_work.status, 'pending_identity_and_source_review');
  assert.equal(entry.required_catalog_work.article_link, 'not_created');
  return { id, words_sr_Cyrl: count, words_sr_Latn: wordCount(latin),
    prose_scalars: [...text].length, deterministic_latin_sha256: sha(latin) };
});
console.log(JSON.stringify({ status: 'PASS', scope: 'Editorial consistency only; not approval or release validation',
  calendar_rows: 30, existing_window_days: 5, pending_drafts: 7, remaining_undrafted_days: 18,
  master_sha256: sha(bytes), article_counts: counts }, null, 2));
NODE
```
