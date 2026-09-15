# Kanonski moduli

Ovaj direktorijum će sadržati uredničke izvore modula `library`, `cycles`,
`calendar-YYYY` i `backgrounds`. Potpisani r1 bajtovi ostaju u
`releases/legacy/annual-2026-r1`. Skripta `scripts/generate-development-rc.mjs`
ih za testiranje raspoređuje u tri privremena M0 v2 modula bez promene bajtova:

- `library-core`: psalmi, molitve, Jevanđelja, izvori i licence na oba pisma;
- `daily-cycles`: sedmodnevni ciklus na oba pisma;
- `calendar-2026`: godišnji kalendar sa eksplicitno nerešenim vrednostima.

Razvojni RC koristi jednokratni testni ključ i nije produkcijsko izdanje.
Potpisani Android izvoz je u `releases/v2/annual-2026-r1` i koristi stabilne
module `library-annual-2026-r1`, `daily-cycles-r1` i `calendar-2026-r1`.
Biblioteka nosi i tačan vlasnikov zapis odobrenja, izvorni manifest i potpisani
opis obima. Podloge ostaju izvan oba izvoza dok ne dobiju inventar i odobrenje
prava po pojedinačnoj slici; `organizations` ostaje odsutan jer nema odobrenih
podataka.
