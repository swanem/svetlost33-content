# DRAFT NOT APPROVED — predlog kratkih odlomaka za mali vidžet v0.24.3

Datum nacrta: 18.09.2026. Status: **DRAFT NOT APPROVED / NIJE ODOBRENO ZA AKTIVACIJU**.

Ovaj dokument predlaže tačne odlomke za urednički pregled. Nije odobrenje,
runtime sadržaj, deo modula, potpisanog izdanja ili evidencije odobrenja.
Postojeći puni citati, njihovi ID-jevi, bajtovi, reference i potpisi ostaju
neizmenjeni. Nacrt nije komitovan. Nijedan odlomak ne sme da uđe u aplikacije,
vidžete, podloge ili zajednički paket pre vlasnikovog odobrenja baš tog teksta
na oba pisma i naknadne provere prikaza.

## Zašto je nacrt pripremljen

**Dopuna posle Android merenja 18.09.2026:** bolji raspored smanjio je
fallback sa15 na7 od42 kombinacije, odnosno na pet različitih citata.
Za sledeće odobrenje predlažu se samo ovih pet parova iz tabele:
`general-day-2-morning`, `general-day-4-morning`, `general-day-5-morning`,
`general-day-6-morning`, `general-day-6-noon`. Preostalih šest redova su
rezervni nacrti, ne deo ovog zahteva za odobrenje. iOS fit provera još nije
potvrđena; nove potrebe van ovih pet ostaju zasebna odluka.
Dokazi: Android `docs/evidence/android-0.16.2/widget-fit-240x180-after.json`
i `docs/STATUS-IMPLEMENTACIJE-v0.24.3-ANDROID.md`.

Početni Android WG-S01 izveštaj za standardni mali format 240 × 180 dp pokazao
je rezervni prikaz za 15 od 42 kombinacije dnevnog citata i pisma: 11 ćiriličnih
i četiri latinične. Obuhvaćeno je 11 različitih zajedničkih ID-jeva ispod.
Četiri latinična slučaja su `general-day-4-morning`,
`general-day-5-morning`, `general-day-6-morning` i `general-day-6-noon`.

Pročitani izveštaj bio je:
`/Users/nemanjaveselic/Documents/ChatGPT/Projects/svetlost33-github/app/build/outputs/androidTest-results/connected/debug/Svetlost33_API35(AVD) - 15/logcat-app.svetlost33.widget.WidgetRenderingTest-everyOfflineQuoteIsWholeOrUsesReferenceFallbackAtSupportedSizes.txt`.
Redovi oznake `WG03Coverage` pročitani su pre narednog native pokretanja koje
je uklonilo tu privremenu datoteku; njen SHA-256 zato nije zabeležen.
Ovo je početno stanje pre dodatnog rada na marginama, a ne rezultat poslednje
native provere. Root zasebno vodi poboljšanje rasporeda i ponovno merenje.
Broj znakova sam po sebi ne dokazuje da tekst staje.

## Tačan predlog za pregled

Svaki tekst u tabeli doslovan je neprekinuti početni deo postojećeg
`days[].slots[].quote.text`, bez prepričavanja, promene reči, velikog slova,
interpunkcije ili spajanja udaljenih delova. Izbor je isti na oba pisma.
Zarez ili tačka-zarez na kraju zadržan je zato što pripada izvornom tekstu;
nisu dodati tačka ili trotačke. To je urednički odabran odlomak, ne vizuelno
odsecanje teksta pri iscrtavanju.

Kolone „znakova” broje Unicode skalarne vrednosti, uključujući razmake i
interpunkciju, bez navodnika, reference ili oznake „odlomak”. Latinično
`lj`/`nj` čine dva znaka. Cilj 25–45 je orijentacioni:
Ps 4,8 ima koherentnu celinu od 24 znaka; Ps 92,1 i Ps 55,22 ostaju do 53
znaka radi očuvanja cele misli. Ovo nisu novi tekstovi ili novi ID-jevi.

| Zajednički ID slota/citata | Izvorna referenca | Tačan predlog sr-Cyrl | Znakova | Tačan predlog sr-Latn | Znakova |
|---|---|---|---:|---|---:|
| `general-day-1-evening` | Пс 4,8 | Ја мирно лежем и спавам; | 24 | Ja mirno ležem i spavam; | 24 |
| `general-day-2-morning` | Пс 90,14 | Ујутру нас насити доброте своје, | 32 | Ujutru nas nasiti dobrote svoje, | 32 |
| `general-day-2-noon` | Пс 46,1 | Бог нам је уточиште и сила, | 27 | Bog nam je utočište i sila, | 27 |
| `general-day-4-morning` | Пс 63,1 | Боже! Ти си Бог мој, к Теби раним, | 34 | Bože! Ti si Bog moj, k Tebi ranim, | 34 |
| `general-day-5-morning` | Пс 92,1–2 → одломак: Пс 92,1 | Лепо је хвалити Господа, и певати имену Твом, Вишњи, | 52 | Lepo je hvaliti Gospoda, i pevati imenu Tvom, Višnji, | 53 |
| `general-day-5-noon` | Пс 34,8 | Испитајте и видите како је добар Господ; | 40 | Ispitajte i vidite kako je dobar Gospod; | 40 |
| `general-day-5-evening` | Пс 16,7 | Благосиљам Господа, који ме уразумљује; | 39 | Blagosiljam Gospoda, koji me urazumljuje; | 41 |
| `general-day-6-morning` | Пс 59,16 | А ја ћу певати силу Твоју, | 26 | A ja ću pevati silu Tvoju, | 26 |
| `general-day-6-noon` | Пс 55,22 | Стави на Господа бреме своје, и Он ће те поткрепити. | 52 | Stavi na Gospoda breme svoje, i On će te potkrepiti. | 52 |
| `general-day-7-morning` | Пс 108,1 | Готово је срце моје, Боже; | 26 | Gotovo je srce moje, Bože; | 26 |
| `general-day-7-evening` | Пс 31,5 | У Твоју руку предајем дух свој; | 31 | U Tvoju ruku predajem duh svoj; | 31 |

Ps 92,1 zadržava ceo prvi stih sa pohvalom i obraćanjem „Вишњи/Višnji”;
postojeći dnevni citat obuhvata i drugi stih, koji se ovde ne bira.
Za njegov eventualni odobreni kraći prikaz tačna referenca bila bi
„Пс 92,1 · Даничић · извод” / „Ps 92,1 · Daničić · izvod”.
Originalna referenca punog dnevnog citata „Пс 92,1–2 / Ps 92,1–2” ostaje
neizmenjena. Ps 55,22 zadržava nalog i obećanje zajedno, do prve tačke.
Ostali redovi biraju početnu smislenu klauzu uz istu referencu i jasnu oznaku
„извод/izvod” prema WG-03 ako izbor naknadno bude odobren.

## Puni postojeći citati za uporedni pregled

Ovo je neizmenjen izvorni kontekst pročitan iz zajedničkog ciklusa, a ne
prepis iz Android loga. Za oba pisma svih 11 citata potvrđeno je i potpuno
podudaranje sa odgovarajućim stihom ili stihovima lokalne biblioteke psalama.

| Zajednički ID | Puni sr-Cyrl iz `quote.text` | Puni sr-Latn iz `quote.text` |
|---|---|---|
| `general-day-1-evening` | Ја мирно лежем и спавам; јер Ти, Господе, сам дајеш ми, те сам без страха. | Ja mirno ležem i spavam; jer Ti, Gospode, sam daješ mi, te sam bez straha. |
| `general-day-2-morning` | Ујутру нас насити доброте своје, и радоваћемо се и веселити у све дане своје. | Ujutru nas nasiti dobrote svoje, i radovaćemo se i veseliti u sve dane svoje. |
| `general-day-2-noon` | Бог нам је уточиште и сила, помоћник, који се у невољама брзо налази. | Bog nam je utočište i sila, pomoćnik, koji se u nevoljama brzo nalazi. |
| `general-day-4-morning` | Боже! Ти си Бог мој, к Теби раним, жедна је Тебе душа моја, за Тобом чезне тело моје у земљи сувој, жедној и безводној. | Bože! Ti si Bog moj, k Tebi ranim, žedna je Tebe duša moja, za Tobom čezne telo moje u zemlji suvoj, žednoj i bezvodnoj. |
| `general-day-5-morning` | Лепо је хвалити Господа, и певати имену Твом, Вишњи, Јављати јутром милост Твоју, и истину Твоју ноћу, | Lepo je hvaliti Gospoda, i pevati imenu Tvom, Višnji, Javljati jutrom milost Tvoju, i istinu Tvoju noću, |
| `general-day-5-noon` | Испитајте и видите како је добар Господ; благо човеку који се узда у Њ. | Ispitajte i vidite kako je dobar Gospod; blago čoveku koji se uzda u Nj. |
| `general-day-5-evening` | Благосиљам Господа, који ме уразумљује; томе ме и ноћу учи шта је у мени. | Blagosiljam Gospoda, koji me urazumljuje; tome me i noću uči šta je u meni. |
| `general-day-6-morning` | А ја ћу певати силу Твоју, рано ујутру гласити милост Твоју; јер си ми био одбрана и уточиште у дан невоље моје. | A ja ću pevati silu Tvoju, rano ujutru glasiti milost Tvoju; jer si mi bio odbrana i utočište u dan nevolje moje. |
| `general-day-6-noon` | Стави на Господа бреме своје, и Он ће те поткрепити. Неће дати довека праведнику да посрне. | Stavi na Gospoda breme svoje, i On će te potkrepiti. Neće dati doveka pravedniku da posrne. |
| `general-day-7-morning` | Готово је срце моје, Боже; певаћу и хвалићу заједно са славом својом. | Gotovo je srce moje, Bože; pevaću i hvaliću zajedno sa slavom svojom. |
| `general-day-7-evening` | У Твоју руку предајем дух свој; избављао си ме, Господе, Боже истинити! | U Tvoju ruku predajem duh svoj; izbavljao si me, Gospode, Bože istiniti! |

## Poreklo iz punog psalma

Prevod/numeracija: `danicic-ebible-srp1868` /
`DANICIC_EBIBLE_SRP1868` — Đura Daničić, digitalni tekst eBible srp1868.
Brojevi u tabeli su brojevi ovog izdanja. Postojeći LXX podatak predstavlja
samo odnos broja celog psalma; nije drugačiji prevod niti novo mapiranje
stihova. `lxx_verse_mapping` ostaje `null`.

Veze i hash-evi arhiviranih stranica preuzeti su iz postojećeg zajedničkog
izvora. Spoljašnje stranice nisu ponovo preuzimane za ovaj nacrt i izvorni
snapshot hash nije predstavljen kao hash današnje žive stranice.
Čitač i veza do punog lokalnog psalma ostaju očuvani.

| Zajednički ID | Puni lokalni psalam; izvorni stihovi | Zavedeni izvor punog teksta | Izvorni `source_snapshot_sha256` |
|---|---|---|---|
| `general-day-1-evening` | `psalm-4`; 8 | [EBIBLE-PSA004](https://ebible.org/srp1868/PSA004.htm#V8) | `31741de285aa948929dfc7d91445f6a6872c5cc2f9c48f1e426564dd27145ccb` |
| `general-day-2-morning` | `psalm-90`; 14 | [EBIBLE-PSA090](https://ebible.org/srp1868/PSA090.htm#V14) | `d625d8ebae5ce7e96ed25a396471b38d2920f23a7b023d8322f90ed57c09fd0c` |
| `general-day-2-noon` | `psalm-46`; 1 | [EBIBLE-PSA046](https://ebible.org/srp1868/PSA046.htm#V1) | `6bd3aea72246ad37736a599814d28ca3da28c10cc32d3969a6c122c58e1ff13e` |
| `general-day-4-morning` | `psalm-63`; 1 | [EBIBLE-PSA063](https://ebible.org/srp1868/PSA063.htm#V1) | `06619da8804f0511e6604e67b3b7591108dd7db80411820297dbb0c575384796` |
| `general-day-5-morning` | `psalm-92`; 1, 2 | [EBIBLE-PSA092](https://ebible.org/srp1868/PSA092.htm#V1) | `030e76ab1645c4169fc2fa9186846a2524dff76ae71e3bea3d44ccd5de5fe723` |
| `general-day-5-noon` | `psalm-34`; 8 | [EBIBLE-PSA034](https://ebible.org/srp1868/PSA034.htm#V8) | `385788e5fe5834bb7d939154b967573cd226c2a73751bc734df261925869fa60` |
| `general-day-5-evening` | `psalm-16`; 7 | [EBIBLE-PSA016](https://ebible.org/srp1868/PSA016.htm#V7) | `d369a9f03532b8b1cb157a4f363beb697307fa61f2100530914b76f197a82bd8` |
| `general-day-6-morning` | `psalm-59`; 16 | [EBIBLE-PSA059](https://ebible.org/srp1868/PSA059.htm#V16) | `ecafe07ef98ba1b45b9e2d2caec023f3f0527bf491260169fdd2f35eb8360905` |
| `general-day-6-noon` | `psalm-55`; 22 | [EBIBLE-PSA055](https://ebible.org/srp1868/PSA055.htm#V22) | `f23708ac600bdcf8adeed842974da41d215c51546b5630c6f6aded991d8dca71` |
| `general-day-7-morning` | `psalm-108`; 1 | [EBIBLE-PSA108](https://ebible.org/srp1868/PSA108.htm#V1) | `fd6266abcdd5880bbfcb6d43105f5ceb670296adb1796c14d241775aa3d655a3` |
| `general-day-7-evening` | `psalm-31`; 5 | [EBIBLE-PSA031](https://ebible.org/srp1868/PSA031.htm#V5) | `2b861e4de139861b530ba3fa71f26c4b1db914ffac542ad7c5715c54fc22a30a` |

Nema posebnog `quote.id` polja u ovom istorijskom ciklusu: stabilni
`days[].slots[].id` identifikuje pripadajući `quote`. Nacrt ne uvodi
paralelan identitet citata. Sledeće putanje važe u oba ciklusna JSON-a;
intervali su nulti, poluotvoreni opsezi Unicode znakova u `quote.text`.

| Zajednički ID | JSON Pointer u izvornom ciklusu | sr-Cyrl opseg | sr-Latn opseg |
|---|---|---|---|
| `general-day-1-evening` | `/days/0/slots/2/quote/text` | `[0, 24)` | `[0, 24)` |
| `general-day-2-morning` | `/days/1/slots/0/quote/text` | `[0, 32)` | `[0, 32)` |
| `general-day-2-noon` | `/days/1/slots/1/quote/text` | `[0, 27)` | `[0, 27)` |
| `general-day-4-morning` | `/days/3/slots/0/quote/text` | `[0, 34)` | `[0, 34)` |
| `general-day-5-morning` | `/days/4/slots/0/quote/text` | `[0, 52)` | `[0, 53)` |
| `general-day-5-noon` | `/days/4/slots/1/quote/text` | `[0, 40)` | `[0, 40)` |
| `general-day-5-evening` | `/days/4/slots/2/quote/text` | `[0, 39)` | `[0, 41)` |
| `general-day-6-morning` | `/days/5/slots/0/quote/text` | `[0, 26)` | `[0, 26)` |
| `general-day-6-noon` | `/days/5/slots/1/quote/text` | `[0, 52)` | `[0, 52)` |
| `general-day-7-morning` | `/days/6/slots/0/quote/text` | `[0, 26)` | `[0, 26)` |
| `general-day-7-evening` | `/days/6/slots/2/quote/text` | `[0, 31)` | `[0, 31)` |

## Tačni zajednički ulazni bajtovi

Izvor je odobrena nepromenljiva godišnja revizija
`shared-annual-2026-r1-m0v2-s2`, moduli `daily-cycles-r1` i
`library-annual-2026-r1`, oba verzije `2026.1.1`, revizije `2`.
Naknadni dodatak organizacija koristi te iste godišnje module bez izmene.
Istorijska draft polja u payload-u sačuvana su kao poreklo; kasnije zajedničko
odobrenje godišnje sadržajne revizije zapisano je odvojeno i ne predstavlja
odobrenje novih odlomaka iz ovog dokumenta.

Svih šest datoteka ispod ponovo je provereno prema veličini i SHA-256 zapisu
u odgovarajućem zajedničkom manifestu pre sastavljanja nacrta.

| Uloga | Datoteka u sadržajnom repozitorijumu | Bajtova | SHA-256 |
|---|---|---:|---|
| sr-Cyrl/cycles | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/data/legacy-cycle.sr-Cyrl.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/data/legacy-cycle.sr-Cyrl.json) | 66639 | `7e0de7104845133e26c326f770cdd9faef1b91993261ef78bcdf6b9629a7f4c4` |
| sr-Cyrl/psalms | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/psalms.sr-Cyrl.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/psalms.sr-Cyrl.json) | 707117 | `71918c97fe6fcc6d9f21a1990aaf0ceb2399bc503a43a9106f8e680f67844e83` |
| sr-Cyrl/sources | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/sources.sr-Cyrl.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/sources.sr-Cyrl.json) | 117364 | `0dba9e468f7e6e541bd2ce2b2f6f203642f15a0b6d8f8d0b3157337a83a070a0` |
| sr-Latn/cycles | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/data/legacy-cycle.sr-Latn.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/data/legacy-cycle.sr-Latn.json) | 58613 | `5becca805591135d7120c89c3052f577633072fa60fb0eaf691450baefe5c0f3` |
| sr-Latn/psalms | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/psalms.sr-Latn.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/psalms.sr-Latn.json) | 553977 | `01b2657d85430ec68bcc56d8a0b7b45e03449d1c2cb658a07d130ea57cf8a63d` |
| sr-Latn/sources | [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/sources.sr-Latn.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/sources.sr-Latn.json) | 104511 | `b837e9c284548a9613efe6f129e889fb821402346f3639c6812a29dad8fc1b6c` |

Manifesti korišćeni za tu proveru:

- [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/manifest.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/daily-cycles-r1-2026.1.1-r2/manifest.json) — SHA-256 `91cff26f0a872afc654d1f5086bbdc78786c106f8e3c6e88830647112d1e600e`.
- [releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/manifest.json](../releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/manifest.json) — SHA-256 `5247bedb3d3deaf5f81601ff2f7a274417b0ce11ac1cebbb3f4b518cd26ee16d`.

## Šta ostaje pre bilo kakve aktivacije

1. Završiti native pokušaj poboljšanja rasporeda i utvrditi preostale stvarne
   slučajeve koji ne staju na oba pisma i pri zahtevanim veličinama teksta.
2. Vlasnik treba da odobri tačne parove odlomaka i njihove reference/oznaku.
   Ovaj nacrt, tehnička provera doslovnosti ili ranije odobrenje punih citata
   nisu to odobrenje.
3. Tek posle toga pripremiti zaseban zajednički sadržajni ugovor i novu
   nepromenljivu reviziju sa dokazom odobrenja; ne prepisivati pune citate
   niti potpisane bajtove postojećeg paketa.
4. Proveriti stvarno merenje i prikaz na oba klijenta. Kraći odlomak koji i
   dalje ne staje mora u dozvoljeni rezervni prikaz; nije dopušteno novo
   automatsko skraćivanje, trotačke ili neodobreno smanjivanje teksta.

Dok odobrenje i te provere ne postoje, ostaje važeći puni citat ili dozvoljena
referenca sa otvaranjem čitača. Nacrt ostaje isključivo u `docs/`.
