# Svetlost33 content

Kanonski sadržajni repozitorijum za Android i iOS aplikaciju Svetlost33.

Trenutna predaja završava iteracije **I0–I2** plana v0.15:

- javni inventar, allowlist i migraciona mapa;
- bajt-po-bajt veran mirror odobrenog `annual-2026-r1` paketa;
- modularni M0 v2 ugovor, JSON šeme, referentni validator i zajednički testni primeri.

Ovo još nije produkcioni cutover. Mobilne aplikacije nastavljaju da koriste svoje
postojeće zaključane ulaze dok obe platforme ne integrišu i ne prihvate M0 v2.

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
- `schemas/v2/` — mašinski čitljive M0 v2 šeme.
- `modules/` — mesto kanonskih modularnih izvora; trenutno sadrži uputstvo za
  sledeći, odobreni izvoz iz legacy paketa.
- `fixtures/v2/` — zamrznuti pozitivni i negativni primeri zajedničkog ugovora.
- `scripts/` — reproduktivan import, validator i generator.
- `licenses/` — granice licenci i atribucije; sadržaj nema jednu zbirnu licencu.

Normativna pravila proizvoda ostaju u `swanem/svetlost33`. Tehnički M0 v2
ugovor je opisan u [schemas/v2/README.md](schemas/v2/README.md).
