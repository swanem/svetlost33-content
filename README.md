# Svetlost33 content

Kanonski sadržajni repozitorijum za Android i iOS aplikaciju Svetlost33.

## Aktuelna zajednička objava — S11, 01.10.2026. po lokalnom vremenu

Produkcioni kanal koristi **S11**, `shared-content-refresh-2026-09-30-m0v2-s11`,
sa jednim sadržajnim odobrenjem za oba OS. Objavljeno je 30 novih kratkih
tekstova za **21.10–19.11.2026**, uz 32 sačuvana članka: ukupno 62 članka/dana.
Tri organizacije imaju 15 sveže proverenih veza. Platni podaci i logotipi nisu dodavani.
Četiri kanonske veze ka člancima sada koriste usklađen katalog i browser.

Biblioteka, ciklusi, godišnji kalendar, 21 odabrani praznik i 94 prospektivna
arhivska dana **29.09–31.12.2026** sačuvani su bez promene. Prošli dani se
otvaraju kako vreme prolazi; nema izmišljene retroaktivne arhive. Ovo nije
potpun spisak svih svetitelja niti odobren godišnji paket za 2027.

[Rezultat zajedničke objave](approvals/new-content-2026-09-30/publication-result.json)
i [javni HTTPS readback](approvals/new-content-2026-09-30/public-readback-s11.json)
potvrđuju 58 tačnih datoteka i 24 provere potpisa, završeno 30.09. u 22:11 UTC
(01.10. u 00:11 po lokalnom vremenu). Oba native toka prihvatila su tačan
potpisani kandidat. Ovo nije potvrda nove APK/iOS instalacije niti aktivacije
na fizičkom telefonu. [S10](approvals/calendar-browser-2026-09-27/PUBLICATION-STATUS.md)
i [S9](approvals/saints-completion-2026-09-21/RELEASE-VERIFICATION.md) istorijski dokazi ostaju neizmenjeni.

**Naknadno vlasničko odobrenje 30.09:** [tačan novi sadržaj za oba OS-a](approvals/new-content-2026-09-30/owner-approval.json)
odobren je za pripremu zajedničkog izdanja: 30 novih tekstova o svetiteljima,
sedam podloga, osvežene tri organizacije i 30 validnih radio-predloga uz njihove
izvorne ograde. S11 objavljuje samo gore navedeni kompatibilni podskup.
Sedam novih slika i radio-predlozi još nisu novi aktivni medijski/godišnji
sadržaj. Istorijski draft hashovi i njihove tehničke/izvorne kapije ostaju sačuvani.

## Istorijska osnova v0.15 i razvojni alati

Početna predaja završava iteracije **I0–I2** i produkcioni sadržajni deo **I5** plana v0.15:

- javni inventar, allowlist i migraciona mapa;
- bajt-po-bajt veran mirror odobrenog `annual-2026-r1` paketa;
- modularni M0 v2 ugovor, JSON šeme, referentni validator i zajednički testni primeri;
- potpisani Android modularni izvoz `annual-2026-r1-m0v2` sa svih 13 ranije
  odobrenih payload datoteka, bez promene njihovih bajtova.

Ovo samo po sebi nije zajednički produkcioni cutover. Aktuelnu Android integraciju
i njene dokaze vodi `svetlost33-github/docs/STATUS-IMPLEMENTACIJE-v0.15-ANDROID.md`;
iOS ima zasebnu klijentsku integraciju i tehničko prihvatanje zajedničkog kanala.

**Jedno odobrenje za oba OS-a — v0.17, 15.09.2026:** vlasnik jednom odobrava
sadržajnu reviziju za Android i iOS. [Zajednička r1 evidencija i predaja](approvals/README.md)
objedinjuje prethodne odluke za istih 13 datoteka, uz isti obim Srbije/BiH.
Zajednički produkcioni izvoz sada koristi jedan potpisani release-set i discovery kanal;
minimalne verzije i platformski QA nisu novo sadržajno odobrenje.
Postojeći potpisani M0 izvoz ostaje istorijski Android-only i ne prepisuje se.
Potpisani bajtovi su pripremljeni u `releases/v2/production`; javna objava i
platformsko prihvatanje vode se kao odvojeni koraci.

Za integracioni rad može se napraviti privremeni tro-modularni RC iz tačnih
`annual-2026-r1` bajtova:

```sh
npm run development:rc -- --out /tmp/svetlost33-development-rc
node scripts/validate-m0-v2.mjs /tmp/svetlost33-development-rc \
  --platform ios --client-version 0.15.0 --channel development \
  --key-id svetlost33-development-key-1
```

Generator koristi jednokratni testni ključ i ne zapisuje privatni ključ. RC nije
produkcijsko izdanje. Sadrži biblioteku, ciklus i kalendar. Podloge ostaju
izostavljene iz ovog istorijskog generatora.

**Podloge v1 — 16.09.2026:** katalog i svih 18 slika sada imaju zajedničko
Android/iOS odobrenje, tačan SHA-256 inventar i registar prava po slici u
`approvals/shared-backgrounds-v1-2026-09-16` i `licenses/backgrounds-v1.json`.
**Odluka 05.10.2026:** OTA podloga je otkazan. Originali, optimizovani
pregledi i katalog isporučuju se samo kroz novu verziju aplikacije po
zajedničkom SPEC-u BG-04. Tekstualni i kalendarski sadržaj zadržavaju
postojeći potpisani kanal.

Isključivi slikovni OTA generatori, izdavački adapteri, testovi i njihove
npm komande uklonjeni su. [Zapis uklanjanja i oporavka](approvals/ota-removal-2026-10-05/removal-receipt.json)
navodi tačne fajlove i provere. Istorijski fixture-i, odobrenja i izvori
ostaju kao evidencija, ne kao uputstvo za ponovno pokretanje OTA.

## Provera

**Dobročinstvo v0.24.3 — 18.09.2026:** tri kartice imaju zajedničko odobrenje i
tačan dvojezični `reviewed` izvor u
`modules/organizations-v1/2026.9.18-r1/data/organizations-v1.json`.
[Predaja sa hash-om i granicama pregleda](approvals/charity-cards-2026-09-18/IMPLEMENTATION.md)
opisuje novi opcioni modul, šest spoljašnjih veza i rok pregleda od 30 dana.
`npm run prepare:charity:v2 -- --out build/charity-v0243-candidate-archived-s2` priprema
nepotpisanu sekvencu 3 bez prepisivanja ranijih sadržaja. Produkcioni potpis,
native QA i objava ostaju odvojeni koraci.

Potreban je Node.js 20.9 ili noviji. `npm ci` instalira zaključani `sharp`
decoder kojim validator potpuno dekodira PNG/JPEG sadržaj.

```sh
npm ci
npm test
```

Test ponavlja uvoz iz lokalnog `svetlost33-github` repozitorijuma u privremeni
direktorijum, poredi 13 payload datoteka i istorijske release artefakte, validira
M0 v2 pozitivni primer i očekivano odbija svaki negativni primer.

## Struktura

- `inventory/` — I0 popis, javni allowlist i mapa porekla/novih putanja.
- `releases/legacy/annual-2026-r1/` — neizmenjeni M0 v1/r1 bajtovi.
- `releases/v2/annual-2026-r1/` — potpisani produkcioni Android M0 v2 izvoz:
  biblioteka, dnevni ciklus i kalendar.
- `releases/v2/production/` — stabilni discovery koren i nepromenljivi
  zajednički Android/iOS release-set paketi; aktuelnu sekvencu određuje `index.json`.
- `schemas/v2/` — mašinski čitljive M0 v2 šeme.
- `modules/` — mesto kanonskih modularnih izvora; trenutno sadrži uputstvo za
  sledeći, odobreni izvoz iz legacy paketa.
- `fixtures/v2/` — zamrznuti pozitivni i negativni primeri zajedničkog ugovora.
- `scripts/` — reproduktivan import, validator i generator.
- `licenses/` — granice licenci i atribucije; sadržaj nema jednu zbirnu licencu.
- `approvals/` — dodatne vlasnikove odluke sa tačnim sadržajnim obimom; nisu
  runtime paketi i ne menjaju istorijske potpise/odobrenja na mestu.

Normativna pravila proizvoda ostaju u `swanem/svetlost33`. Tehnički M0 v2
ugovor je opisan u [schemas/v2/README.md](schemas/v2/README.md).

## Produkcioni izvoz

Podrazumevana komanda ispod ostaje istorijski Android-only exporter i ne sme se
pokretati radi prepisivanja objavljenog r1. Zajednički režim v0.17 je zasebna
komanda sa novim izlaznim direktorijumom, sekvencom 2, verzijom modula 2026.1.1,
obe platforme i [jednim odobrenjem](approvals/README.md):

Izvoz zahteva privatni ključ van repozitorijuma i ponovo proverava istorijski
potpis, hash svake ulazne datoteke, odobrenje prava, broj sadržaja i eksplicitne
nepoznate vrednosti pre potpisivanja:

```sh
npm run export:r1:v2 -- --private-key /bezbedna/putanja/annual-content-private.pem
npm run export:r1:v2:shared -- --private-key /bezbedna/putanja/annual-content-private.pem
```

Zajednički režim proverava odobrenje, svih 13 neizmenjenih payload datoteka,
stvarne minimalne klijente Android code 10 / iOS 0.1.0 i odbija sekvencu koja
ne napreduje. Testovi ga izvršavaju samo u privremenom direktorijumu sa
jednokratnim ključem. Komitovani `releases/v2/production` je zasebno napravljen
spoljašnjim produkcijskim ključem i validiran za oba klijenta; to samo po sebi
ne dokazuje javnu objavu, instalaciju ili platformski QA.

Paket obuhvata 150 psalama, 18 molitava, četiri Jevanđelja, oba dnevna ciklusa
i svih 365 datuma. Za 173 datuma čitanje je označeno kao predlog na osnovu
izvora Radija Slovo ljubve; paket izričito ne tvrdi da je to kompletan
bogoslužbeni raspored. Preostalih 192 datuma i 91 nepotvrđena strogost posta
ostaju jasno nerešeni. Podloge nisu uključene jer r1 nema pregled prava po
pojedinačnoj slici.
