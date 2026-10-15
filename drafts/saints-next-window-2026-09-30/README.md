# Sledeći saints prozor — lokalni urednički kandidat

Datum pripreme: **30.09.2026.** Opseg: **21.10–19.11.2026, svih 30 dana**.
Status: **DRAFT — izvorno provereni sažeci za ljudski pregled, nisu odobreni niti objavljeni**.
Ovaj paket sprovodi P2b odobrenog plana. Liturgijski tekst ostaje pauziran.

## Rezultat

- Pripremljeno 30 novih kratkih tekstova, svaki 105–111 reči po postojećem
  `saints-v1` brojanju: uvod, telo i uredničko „Šta izdvajamo“.
- Jedan nov ćirilični rukopis i deterministički latinični izvoz, provereni
  postojećom zajedničkom funkcijom transliteracije.
- Otvorena su 32 biografska izvora zvaničnih crkvenih izdavača: OCA,
  Mitropolija crnogorsko-primorska i Svetosavsko Zvonce/SPC. Tačni URL-ovi,
  naslovi, izdavači, datum pregleda i uredničke rezerve nalaze se u `sources.json`.
- Izvršivi spoj čuva svih 32 stara članka, 32 stara dana, stare izvore i
  tačan calendar binding. Rezultat: **62 članka**, od dozvoljena 64;
  kompaktni unsigned DRAFT preview: **211.961 bajt**, ispod 262.144.
- Nema praznine u rukopisu izabranog prozora. To nije tvrdnja o potpunoj
  listi svih svetitelja: svaki dan zadržava `complete_saint_list: false`.

Rad je organizovan u tri pregledive grupe: 21–30.10, 31.10–09.11 i 10–19.11.
Svaki datum, ID članka i izvori povezani su u `inventory.json`; stvarni
čitalački tekst na oba pisma uređuje se samo u `manuscript.json`. Za lakši
ljudski pregled postoji izvedeni [PREGLED.md](PREGLED.md), sa datumima,
celim tekstovima na oba pisma i izvorima. `export-review.mjs` deterministički
izvozi taj pregled na standardni izlaz i proverava njegovu podudarnost; pregled
nije paralelna ručno uređivana kopija. Format ostaje isti kao u prethodnom saints paketu.

## Granice tačnosti i prava

Novi tekstovi su originalni kratki sažeci pripremljeni uz AI pomoć, ne prepis
dugog žitija ili tuđeg prevoda. Nema namernih doslovnih citata, slika, ikona,
tropara, kondaka ili molitava. Činjenice o životu predstavljene su kao sadržaj
navedenog crkvenog žitija/predanja, ne kao nezavisno utvrđen istorijski nalaz.
Uredničko izdvajanje na kraju jeste naš kratak osvrt, ne citat svetitelja.

Per-day `rights_provenance` i zajednički authorship objašnjavaju ovaj postupak;
ne proglašavaju izvorni tekst javnim dobrom, ne izmišljaju licencu izdavača
i ne zamenjuju vlasnikov pregled nove tačne revizije. `owner_approval` i
`clerical_review` ostaju null. Odobrenja nepromenjenih 32 stara teksta ne
otvaraju se ponovo, ali se ne prenose na ovih 30 novih tekstova.

Svaki biografski URL je otvoren tokom ovog istraživanja. Nisu sačuvane sirove
HTML kopije; zato `source_snapshot_sha256` ostaje null, bez izmišljanja hasha.
Godina u OCA URL-u nije datum objavljivanja. OCA označava crkveni mesec/dan;
građanski/julijanski datumi dolaze iz postojećeg tačno vezanog SPC godišnjeg
kalendara, ne iz računanja +13 dana u aplikaciji.

Oktobarski kalendar ponovo je otvoren i izabrani datumi poklapaju se sa
sačuvanim godišnjim podacima. **Novembarski URL pri proveri nije bio dostupan**:
taj deo se oslanja na nepromenjene odobrene annual bajtove i njihov evidentiran
primarni source zapis od 15.09.2026. Ovo nije novi novembarski mrežni readback.
Ograničenje je mašinski zapisano u `sources.json` i izlazu inspektora.

Sačuvane su važne razlike: dva Jakova; Filip đakon naspram apostola iz
Dvanaestorice; Paraskeva Epivatska; azijski Kozma/Damjan; Đurđic kao poseban
događaj, ne Đurđevdan; zasebne ličnosti Dimitrija i Nestora. Nesigurne precizne
godine i sporni detalji kod Prohora, Markijana/Martirija, hrama u Lidi i
Galaktiona/Epistime nisu predstavljeni kao potvrđene činjenice.

## Kanonske veze

U postojećem S10 katalogu ovom prozoru odgovaraju samo:

- 27.10: `paraskeva-epivates` → postojeći `obs-paraskeva`;
- 08.11: `demetrius-thessalonica` → postojeći `obs-demetrius`.

To su **pending predlozi novih article link-ova**, ne već objavljene reviewed
veze. Ostalih 28 članaka nema izmišljeni active canonical ID. Novi članak ne
omogućava automatski Sačuvaj; potrebna je zasebno pregledana veza u katalogu.
Posebno se Đurđic ne vezuje za postojeći `obs-george` čija je pojava Đurđevdan.
Nijedan katalog, legacy slava link ili native model nije promenjen.

## Izvršiva provera — bez upisa

Iz korena `svetlost33-content`:

```sh
node drafts/saints-next-window-2026-09-30/inspect.mjs
node --test drafts/saints-next-window-2026-09-30/inspect.test.mjs
node drafts/saints-next-window-2026-09-30/export-review.mjs --check
```

Inspektor čita pinovane baseline bajtove, pravi **samo u memoriji** saints-v1
draft, proverava svih 30 dana, oba pisma, broj reči, izvore, limite i očuvanje
starih zapisa. Nema write/export/sign/publish opcije niti mrežnih poziva.
`manifest.json` veže tačne lokalne datoteke, izvedeni pregled i sačuvani validation report.
Native kompatibilnost ovde nije testirana niti se tvrdi runtime autentifikacija.

Postojeća saints-v1 šema traži string `approval_id` čak i za draft. Zato
in-memory preview koristi očigledni locator `pending-saints-next-window-2026-09-30`
uz `review_status: draft`; to **nije postojeći niti izmišljen approval record**.
Stvarni `owner_approval` kandidata je null i runtime ga ne sme prihvatiti.

Pre daljeg izdavanja ostaju: ljudski urednički pregled tačnih tekstova i
metapodataka, vlasnikovo odobrenje nove revizije, review eventualnih novih
kanonskih veza, novo tačno saints/catalog povezivanje na tada aktuelnoj osnovi,
oba native prihvatanja i posebno produkciono odobrenje. Ako se godišnji
kalendar promeni, ponovno proveriti svaku vezu; ne olabaviti exact binding.

U ovom koraku nisu menjani dirty stari `TEKSTOVI.md`, charity fajlovi, native
repoi, objavljeni immutable artefakti, ključevi ili aktivni discovery.
