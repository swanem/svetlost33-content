# Kanonski moduli

Ovaj direktorijum sadrži uredničke izvore sadržajnih modula. Podloge su
odlukom od 05.10.2026. isključivo build resurs aplikacije, ne udaljeni modul.
Potpisani r1 bajtovi ostaju u
`releases/legacy/annual-2026-r1`. Skripta `scripts/generate-development-rc.mjs`
ih za testiranje raspoređuje u tri privremena M0 v2 modula bez promene bajtova:

- `library-core`: psalmi, molitve, Jevanđelja, izvori i licence na oba pisma;
- `daily-cycles`: sedmodnevni ciklus na oba pisma;
- `calendar-2026`: godišnji kalendar sa eksplicitno nerešenim vrednostima.

Razvojni RC koristi jednokratni testni ključ i nije produkcijsko izdanje.
Potpisani Android izvoz je u `releases/v2/annual-2026-r1` i koristi stabilne
module `library-annual-2026-r1`, `daily-cycles-r1` i `calendar-2026-r1`.
Biblioteka nosi i tačan vlasnikov zapis odobrenja, izvorni manifest i potpisani
opis obima. Podloge v1 sada imaju inventar i odobrenje prava po pojedinačnoj
slici u `approvals/shared-backgrounds-v1-2026-09-16` i
`licenses/backgrounds-v1.json`. OTA podloga je otkazan; originali i
umanjeni pregledi ostaju odobreni ulazi za app build.

`organizations-v1/2026.9.18-r1/data/organizations-v1.json` sada sadrži zaseban
pregledani registar tri odobrene dobrotvorne kartice: NURDOR, Fondacija NORBS+
i Srbi za Srbe. Sadrži samo šest odobrenih spoljašnjih veza, oba pisma,
identitet sa zvaničnih stranica i rokove pregleda; nema naloga za uplatu niti
logotipa. [Tačan obim, hash i predaja](../approvals/charity-cards-2026-09-18/IMPLEMENTATION.md)
prate novi opcioni modul. Sam izvor nije potpisan runtime paket.

Razvojni generatori slikovnog OTA više nisu deo aktivnog alata.
[Zapis uklanjanja](../approvals/ota-removal-2026-10-05/removal-receipt.json)
čuva inventar i način oporavka. Istorijski izlazi nisu novi runtime paketi.
