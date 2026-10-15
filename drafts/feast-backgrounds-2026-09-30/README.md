# Sedam novih prazničnih podloga — lokalni kandidat

Korisnik je 30.09.2026. odobrio razvoj plana P0–P8 i naveo nove slike u
postojećem zadatku `media`. Njegov handoff je
`svetlo-figma-assets/praznici-prvih-sedam-v1/HANDOFF-OTA-2026-09-30.md`.

Ovo je **inventar/kandidat za pregled**, ne aktivan modul, potpisano izdanje
ili dozvola za javnu distribuciju. Originalni fajlovi ostaju u media kolekciji.
Nisu menjani pikseli, originalni manifest, prethodnih 18 podloga ili S10.

## Sadržaj

Pokrov, Sveti apostol Luka, Vavedenje, Badnji dan, Bogojavljenje, Veliki petak
i Vaskrs. Za aplikaciju se koriste **čisti originali**, ukupno 17.414.965 B
(oko 16,61 MiB), bez budućih sličica i metapodataka. Verzije sa nazivom ostaju
posebne media izvedenice; nisu garantovano identične čistoj slici uz tekst.

Šest motiva ima 841×1870 px; Bogojavljenje 793×1983 px. Ne označavati 4K.
Prvi vizuelni pregled svih sedam čistih originala: pogodni za tehnički
kandidat, simbolični motivi bez ljudskih figura, mirna gornja zona. To nije
provera prikaza na telefonu, čitljivosti natpisa ili teološka potvrda.

## Pravila integracije

- Isti nepromenjeni izvorni bajtovi za Android i iOS; bez nezavisnih izvoza.
- Proporcionalno uklapanje/crop u rendereru, bez rastezanja. Bogojavljenje
  obavezno proveriti u oba widget formata i na širokom/uskom ekranu.
- Naziv, ako ga trenutni prikaz dozvoljava, ide iz lokalizovanih metapodataka
  prema postojećem korisnikovom podešavanju; ne duplirati natpis u slici.
- Novi ID-jevi `feast-*` ne menjaju postojeće ID-jeve/default listu, rotaciju,
  slavu, automatiku ili stanje sistemske pozadine.
- **Ne uvoziti `schedule`/`next_observance` iz umetničkog manifesta kao
  runtime kalendar.** Slike se mogu koristiti ručno nezavisno od godine;
  povezivanje sa praznikom zahteva pregledani kanonski kalendar i tačan ID.
  Posebno ne pretvarati datum Vaskrsa/Velikog petka u ponavljajući MM-DD.
- Izvor je AI generisanje, ne fotografija stvarnog manastira, crkveno
  odobrena ikona ili sken. Ne uvoditi izmišljenu CC0/PD licencu. Konačna
  evidencija odobrenja obuhvata tačne hashove, atribuciju i obim distribucije.
- Nove sličice/transformacije su zasebni izvedeni artefakti sa provenance;
  ovaj korak ih ne stvara niti menja postojeći zaključani generator 18 slika.

## Ponovljiva provera

Iz content repozitorijuma:

```sh
node drafts/feast-backgrounds-2026-09-30/inspect.mjs
node --test drafts/feast-backgrounds-2026-09-30/inspect.test.mjs
```

Inspector samo čita. Proverava manifest hash, svih 14 SHA-256/veličina,
punu PNG dekodabilnost/dimenzije i prisustvo promptova. Izlaz je `candidate.json`;
test poredi rezultat sa sačuvanim kandidatom. Ne pristupa internetu ili ključevima.

Pre objave: vlasnikov pregled tačne revizije, zajednički OTA ugovor,
native integracija/QA i zasebno produkciono odobrenje.
