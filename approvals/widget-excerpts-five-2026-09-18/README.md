# Pet odobrenih izvoda za mali vidžet — zajednička revizija v0.24.4

Vlasnik je 18.09.2026. potvrdio: „odobravam pet predlozenih izvoda i nastavi sa
svim ostalim”. Odluka važi za oba OS-a i oba pisma, za tačnih pet parova ispod.
Izvorna konverzacija: `01a06b7f-775f-7d03-82b5-c2b416ade556`.
[approval.json](approval.json) beleži odluku, doslovne tekstove, reference,
poreklo i tačne hash-eve novih sadržajnih datoteka. Zapis nije kriptografski
potpis vlasnika niti tvrdnja o završenoj native proveri/objavi.

| Zajednički ID | Ćirilica | Latinica | Znakova ćir./lat. |
|---|---|---|---:|
| `general-day-2-morning` | Ујутру нас насити доброте своје, | Ujutru nas nasiti dobrote svoje, | 32 / 32 |
| `general-day-4-morning` | Боже! Ти си Бог мој, к Теби раним, | Bože! Ti si Bog moj, k Tebi ranim, | 34 / 34 |
| `general-day-5-morning` | Лепо је хвалити Господа, и певати имену Твом, Вишњи, | Lepo je hvaliti Gospoda, i pevati imenu Tvom, Višnji, | 52 / 53 |
| `general-day-6-morning` | А ја ћу певати силу Твоју, | A ja ću pevati silu Tvoju, | 26 / 26 |
| `general-day-6-noon` | Стави на Господа бреме своје, и Он ће те поткрепити. | Stavi na Gospoda breme svoje, i On će te potkrepiti. | 52 / 52 |

Preostalih šest redova prvog [nacrta](../../docs/PROPOSAL-SMALL-WIDGET-EXCERPTS-v0243.md)
ostaju neodobreni i nisu ugrađeni. Nacrt je sačuvan kao dokaz istorijskog
predloga; ovaj zaseban zapis određuje uži odobreni obim. Izvorne reči i
interpunkcija ostaju doslovni. Fiksna vidljiva oznaka je `извод` / `izvod`.
Ps 92,1 koristi referencu prvog stiha; puni citat i dalje označava Ps 92,1–2.

## Sadržaj i granice

Ugovor je [widget-excerpt-v1](../../schemas/widget-excerpt-v1/README.md), opcioni
`quote.widget_excerpt` unutar postojeće strukture ciklusa. Nova revizija
`daily-cycles-r1` ima verziju `2026.1.2`, reviziju `3` i iste capability/dependency
vrednosti kao prethodna. Puni tekstovi, reference, polja i čitalačke akcije
nisu menjani. Uklanjanjem samo deset novih opcionih objekata dobijaju se
bajt-po-bajt identični stari JSON-i na oba pisma.

| Novi izvor | Bajtova | SHA-256 |
|---|---:|---|
| `modules/daily-cycles-r1/2026.1.2-r3/data/legacy-cycle.sr-Cyrl.json` | 71899 | `46aedf8c494dc79dbc6756fbff19d858cec0885218af18af0ce551e004293415` |
| `modules/daily-cycles-r1/2026.1.2-r3/data/legacy-cycle.sr-Latn.json` | 63690 | `e02c2cdd593d2823e9cabe44e5618ea87746815d1fb3476b2309380237c20b84` |

Neispravan, nepoznat, neodobren ili nepovezan opcioni objekat ignoriše se;
čitanje i ceo citat ostaju dostupni. Dostupan izvod mora da prođe stvarno
merenje zajedno sa referencom i oznakom, uz izabrano/sistemsko uvećanje.
Ne sme se odsecati, prepričavati ili dodatno skraćivati da bi stao.

## Nepromenljivi kandidat sekvence 4

Kandidat: `build/widget-excerpts-v0243-candidate`, release ID
`shared-widget-excerpts-2026-09-18-m0v2-s4`. Osnova je već potpisani lokalni s3
`build/charity-v0243-signed`. [s3-source-files.json](s3-source-files.json)
zaključava sve njegove datoteke i potpise. Puni stari s2/s3 moduli ostaju
sačuvani, uključujući neizmenjene organizacije. Aktivni manifest ciklusa jedini
se zamenjuje referencom na novu reviziju; stari manifest nije prepisan.
S3 discovery bajtovi arhivirani su pod
`discovery-archive/shared-charity-2026-09-18-m0v2-s3/`.

Minimalni Android je **versionCode 35**: prethodni adapter vezivao je ciklus
za hash istorijskog godišnjeg manifesta. Novi native adapter koristi proverene
M0 zapise, bez slabljenja provere ili izmene biblioteke. Stariji Android
odbija s4 pri proveri minimalne verzije i zadržava lokalni sadržaj. iOS minimum
ostaje `0.1.0`; stariji decoder ignoriše dodatno polje. M0 prelazi 2→4 i 3→4
dozvoljeni su podržanim klijentima. Organizacije ostaju opcioni modul.

```sh
node scripts/prepare-widget-excerpts-v2.mjs \
  --source build/charity-v0243-signed \
  --out build/widget-excerpts-v0243-candidate

node scripts/sign-widget-excerpts-v2.mjs \
  --source build/charity-v0243-signed \
  --candidate build/widget-excerpts-v0243-candidate \
  --out build/widget-excerpts-v0243-signed \
  --private-key /explicit/external/existing-production-key.pem
```

Izlaz mora biti nov direktorijum. Priprema ne pristupa privatnom ključu.
Zasebni signer proverava tačne izvorne/kandidatske bajtove i postojeći javni
ključ pre potpisivanja. Pripremni agent nije čitao produkcioni privatni ključ,
potpisivao ili objavio ovo izdanje. Potpisivanje vodi root posle pregleda;
objava/aktivacija tek posle native QA oba klijenta.

## Provere

`npm test`: **179/179 prošlo**, uključujući 36 prenosivih excerpt slučajeva i
42 nova testa ukupno. Provereni su tačni tekstovi i pet ID-jeva, odsustvo
preostalih šest, izvorni hash-evi, obe reference, literalni prefiks, skalarski
opsezi, svi stari s3 bajtovi, reprodukcija posle promene live pokazivača,
transportni prelazi 2→4/3→4 sa privremenim testnim ključem, odbijanje starog
Android klijenta, opcioni skip organizacija, replay/tamper zaštita, zaštita
postojećeg izlaza i odbijanje pogrešnog ključa. To nisu dokazi stvarnog
native prihvatanja ili vizuelnog uklapanja; te provere vode native zadaci.

## Potpisani paket i provere aktivacije

Root je proverio odobrenje i nepromenjene izvorne tekstove, ponovio 42/42
fokusirana testa i potpisao kandidat postojećim produkcionim ključem.
Izlaz je `build/widget-excerpts-v0243-signed`; naziv direktorijuma zadržava
istorijsko ime pripreme, a važeća zajednička specifikacija je v0.24.4.
Index SHA-256: `c7e327ed6e7108a6c33a4df525934d85a945fd2baeccce0eccee161311d685e6`.
Release-set SHA-256: `6524151c4a249c85ad58bcb2ab475104a898ade76acefb417edb8561361e09c4`.
Pri potpisivanju javni index ostao je na sekvenci 2. Potom su oba native
zadatka prihvatila tačan potpisani paket: Android 0.16.3/code35 i iOS
0.1.0/build21. Prošli su prelazi 2→4 i 3→4, puna čitanja, prikaz vidžeta i
očuvanje podešavanja pri nadogradnji. Aktivacioni commit menja samo javni
discovery pokazivač i njegov odgovarajući potpis na sekvencu 4; stari paketi
ostaju nepromenjeni. Stvarna objava proverava se ponovnim preuzimanjem
javnog paketa i proverom potpisa, odvojeno od ovih lokalnih dokaza.
