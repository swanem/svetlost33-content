# Svetlost33 content

Kanonski sadržajni repozitorijum za Android i iOS aplikaciju Svetlost33.

Trenutna predaja završava iteracije **I0–I2** i produkcioni sadržajni deo **I5** plana v0.15:

- javni inventar, allowlist i migraciona mapa;
- bajt-po-bajt veran mirror odobrenog `annual-2026-r1` paketa;
- modularni M0 v2 ugovor, JSON šeme, referentni validator i zajednički testni primeri;
- potpisani Android modularni izvoz `annual-2026-r1-m0v2` sa svih 13 ranije
  odobrenih payload datoteka, bez promene njihovih bajtova.

Ovo još nije produkcioni cutover. Android mora da integriše i prihvati ovaj izvoz,
a iOS dobija zaseban platformski release-set kada završi prihvatanje. Javni HTTPS
endpoint i fizičke provere takođe ostaju otvoreni.

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

Normativna pravila proizvoda ostaju u `swanem/svetlost33`. Tehnički M0 v2
ugovor je opisan u [schemas/v2/README.md](schemas/v2/README.md).

## Produkcioni izvoz

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
