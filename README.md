# Svetlost33 content

Kanonski sadržajni repozitorijum za Android i iOS aplikaciju Svetlost33.

Trenutna predaja završava iteracije **I0–I2** i produkcioni sadržajni deo **I5** plana v0.15:

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
Sledeća zajednička objava koristi jedan potpisani release-set i discovery kanal;
minimalne verzije i platformski QA nisu novo sadržajno odobrenje.
Postojeći potpisani M0 izvoz ostaje istorijski Android-only i ne prepisuje se.
Nova zajednička produkciona objava nije izvršena ovom dokumentacionom odlukom.

Za integracioni rad može se napraviti privremeni tro-modularni RC iz tačnih
`annual-2026-r1` bajtova:

```sh
npm run development:rc -- --out /tmp/svetlost33-development-rc
node scripts/validate-m0-v2.mjs /tmp/svetlost33-development-rc \
  --platform ios --client-version 0.15.0 --channel development \
  --key-id svetlost33-development-key-1
```

Generator koristi jednokratni testni ključ i ne zapisuje privatni ključ. RC nije
produkcijsko izdanje. Sadrži biblioteku, ciklus i kalendar; pozadine su izostavljene
dok ne dobiju inventar i odobrenje po svakoj slici.

## Provera

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

**Postojeća komanda ispod je istorijski Android-only exporter.** Nije novi
zajednički tok iz v0.17 i ne sme se pokretati radi prepisivanja objavljenog r1.
Za naredno zajedničko izdanje pratiti [predaju](approvals/README.md).

Izvoz zahteva privatni ključ van repozitorijuma i ponovo proverava istorijski
potpis, hash svake ulazne datoteke, odobrenje prava, broj sadržaja i eksplicitne
nepoznate vrednosti pre potpisivanja:

```sh
npm run export:r1:v2 -- --private-key /bezbedna/putanja/annual-content-private.pem
```

Paket obuhvata 150 psalama, 18 molitava, četiri Jevanđelja, oba dnevna ciklusa
i svih 365 datuma. Za 173 datuma čitanje je označeno kao predlog na osnovu
izvora Radija Slovo ljubve; paket izričito ne tvrdi da je to kompletan
bogoslužbeni raspored. Preostalih 192 datuma i 91 nepotvrđena strogost posta
ostaju jasno nerešeni. Podloge nisu uključene jer r1 nema pregled prava po
pojedinačnoj slici.
