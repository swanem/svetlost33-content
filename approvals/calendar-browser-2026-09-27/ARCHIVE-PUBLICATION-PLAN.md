# v0.28 — početak zajedničke arhive

Datum pregleda: 27.09.2026. Stanje: **PLANIRANO, NIJE OBJAVLJENO**.

## Šta postojeći dokazi stvarno potvrđuju

Android `docs/STATUS-SAJTA-v0.21.md` potvrđuje javnu isporuku zajedničkog
sedmičnog selektora 16.09.2026, ali beleži mogućnost drugačijeg izbora na
starom iOS-u. S9 `approvals/saints-completion-2026-09-21/RELEASE-VERIFICATION.md`
potvrđuje javnu dostupnost tačnih paketnih bajtova 21.09.2026. Nijedan zapis
ne određuje pregledan interval javnih datum/period dodela za novu arhivu.

Zato ne unosimo septembarsku istoriju samo na osnovu datuma izdanja,
repo istorije ili računanja dana u sedmici. Potvrđujemo samo ono za šta imamo
konkretne podatke; arhiva nije istorija korišćenja pojedinačnog telefona.

## Prospektivno objavljeni raspored

Pripremiti eksplicitne dodele jutro/dan/veče za **29.09–31.12.2026** iz
postojećih, neizmenjenih odobrenih biblioteke i ciklusa. To je unapred
objavljeni raspored aplikacije, ne novi bogoslužbeni raspored ili nove molitve.
U trenutku pripreme ovo je samo kandidat: nema tvrdnje da je već javno dostupan.

Rok za javnu aktivaciju i uspešno javno čitanje tačnih potpisanih bajtova je
**pre 28.09.2026. u 10:00 UTC**. Tada u UTC+14 počinje 29.09; ovaj konzervativni
rok osigurava da su sve dodele objavljene pre svog datuma i korisnicima koji
putuju izvan Srbije/BiH. Ako rok nije ispunjen, ne objavljivati iste datume
retroaktivno: pomeriti početak, regenerisati tačne bajtove i ponoviti provere.

Posle uspešnog javnog readback-a zabeležiti stvarni UTC trenutak, javni URL,
commit i SHA-256 index/release/module/payload-a. Potpisni ili Git timestamp
nisu zamena za readback. Do tada `publication_receipt` ostaje null.

## Ponašanje aplikacije

- Kalendar može znati buduće datume praznika; arhivsko čitanje se otvara samo
  za datum strogo pre stvarnog lokalnog današnjeg datuma, uključujući route,
  deep link i obnavljanje sačuvane navigacije.
- Današnji datum vraća realni živi DC-01; budući arhivski datum ostaje zatvoren.
- Kada datum prođe, već objavljene dodele postaju dostupna zajednička arhiva
  bez dnevnog update-a paketa ili aplikacije.
- Raniji nepokriveni dani ostaju nedostupni. Nema izmišljene popune od 01.01.
- Jutro/dan/veče u arhivi koristi eksplicitni izabrani datum. Prejutarnje
  prethodno veče u živom DC-01 ne pomera datum arhivske dodele.
- Naknadna promena teksta/dodele mora biti nova vidljivo ispravljena revizija;
  promena dostupnih tačnih biblioteka ne dozvoljava latest fallback.

## Zaključani izvori

| Izvor | SHA-256 |
|---|---|
| S9 index | `3205118f271828771b5fef50d645fc3636e2cd4d7e92201844c7c20da2c1f01a` |
| S9 release | `d95c571945fe6ea8f93adf47623b3de2ec40220c5f54cd13785800f26815cdf0` |
| library-annual-2026-r1 / 2026.1.1 / r2 manifest | `5247bedb3d3deaf5f81601ff2f7a274417b0ce11ac1cebbb3f4b518cd26ee16d` |
| daily-cycles-r1 / 2026.1.2 / r3 manifest | `b20e5ff4f29faf3b18b4e1e23d37dd5384a00b9cb54567fb838de71b095a630d` |

Hash inventar nije sam po sebi autentifikacija. Pripremni alat mora proveriti
postojeći javni ključ, potpise, payload bajtove i važenje celog uhvaćenog S9
grafa pre nego što u memoriji formira izvorni kontekst. Candidate JSON ne sme
sam proglasiti `authenticated: true`. Novi kandidat ostaje nepotpisan dok
zajedničke i native kapije nisu završene.
