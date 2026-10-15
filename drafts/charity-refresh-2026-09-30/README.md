# P2a — sveže Dobročinstvo, kandidat 30.09.2026.

Status: **NEPOTPISANO / NEODOBRENO / NIJE OBJAVLJENO**. Samo ovaj novi direktorijum je predmet izmene. Native kod, produkcioni discovery, stari S5 i dirty septembarski charity alati nisu menjani.

## Osnova i tačne razlike

Direktan javni HTTPS readback 30.09.2026. potvrdio je S10, sequence 10, index SHA-256 `cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23` i release-set `ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879`. [baseline.json](baseline.json) čuva svih šest ostalih module-descriptor zapisa. Novi broj sekvence nije rezervisan: pre eventualne isporuke ponovo se čita najnoviji indeks.

Nova revizija organizacija je **2026.9.30 / r3**. Prethodni javni r1 ima šest donation/story veza; r2 iz septembra nije korišćen kao aktivna osnova.

- Isti ID-jevi, nazivi, pravni nazivi, kratki opisi, zemlje i svih šest donation/story URL-ova.
- Dodate tri website i šest social veza. URL-ovi se podudaraju sa ranijim predlogom r2, ali su ponovo provereni iz zvaničnih izvora 30.09.
- Nova evidencija izvora; pregled svih veza 30.09.2026. 10:55:30 UTC, predloženi istek **30.10.2026. 10:55:30 UTC**.
- `dataset_kind=candidate`; svaka organizacija i veza su `draft`. Nijedna nije aktivna čak ni kada validator dobije modelovano autentifikovan kontekst.
- `logo:null` i prazni `payment_rails` ostaju za sve tri. Nema IPS/SWIFT podataka, evidencije uplata ili podsetnika.

| Organizacija | Website | Instagram | Facebook |
|---|---|---|---|
| NURDOR | https://www.nurdor.org/ | https://www.instagram.com/nurdor_srbija/ | https://www.facebook.com/nurdor/ |
| Fondacija NORBS+ | https://norbs.rs/fondacija-norbs-plus/ | https://www.instagram.com/norbsplus/ | https://www.facebook.com/NORBSPlus |
| Srbi za Srbe | https://www.srbizasrbe.org/ | https://www.instagram.com/srbizasrbe | https://www.facebook.com/srbizasrbe |

## Dokazi i ograničenja

[evidence/source-review.json](evidence/source-review.json) sadrži 22 direktna HTTPS GET rezultata: URL, vreme, finalni URL, HTTP status, veličinu/hash tela i kratke zaključke. Svi su vratili 200; svih 15 ponuđenih destinacija je pokriveno. Zvanična stranica potkrepljuje identitet društvenog profila; HTTP 200 sam za sebe nije dokaz vlasništva, potpune funkcionalnosti browsera ili uspešne uplate. HTML je obrađen u memoriji i odbačen; nema kopija priča, ličnih podataka donatora, logotipa ili slikovnih bajtova u kandidatu.

Identiteti su ponovo upoređeni sa [NURDOR podacima](https://www.nurdor.org/identifikacioni-podaci), [stranicom Fondacije NORBS+](https://norbs.rs/fondacija-norbs-plus/) i [podacima Srba za Srbe u Srbiji](https://www.srbizasrbe.org/srbija/). Ovo je provera njihovih objavljenih navoda, ne nezavisan APR audit. NORBS+ ostaje izdvojen od matične organizacije NORBS; profile `retkebolesti` ne koristimo.

Logo provenance: zvanični NURDOR i Srbi za Srbe asset URL-ovi su identifikovani, ali tačan upotrebljiv fajl/hash i dokumentovan osnov distribucije u aplikaciji nisu potvrđeni. Kod NORBS+ parent NORBS i kampanjski 1jeposeban znak nisu zamena za fondacijski znak. [NORBS uslovi](https://norbs.rs/uslovi-koriscenja/) posebno uređuju reprodukciju materijala i povezivanje. [NURDOR medijski kutak](https://www.nurdor.org/medijski-kutak) i [SZS saradnja](https://www.srbizasrbe.org/saradnja/) nisu u ovoj proveri dali upotrebljiv brand-kit/odobrenje za ovaj paket. To je evidencija dostupnih dokaza, ne blanket zaključak o svim mogućim pravnim osnovima. Organizacije nisu kontaktirane.

## Rok i sledeća isporuka

Produkcioni r1 i dalje ističe **18.10.2026. 10:35:15 UTC**. Ovaj draft taj rok ne menja. [review-policy.json](review-policy.json) predlaže 30 dana od stvarne provere, sledeći urednički pregled najkasnije 23.10, i novu proveru pre objave ako je ovaj pregled stariji od 24 sata. Potpisivanje ne pomera datum provere ili istek. Nije kreirana automatizacija.

Za isporuku još nedostaju:

1. Odobrenje tačne nove sadržajne revizije za oba OS-a; promocija iz draft-a zahteva novi hash.
2. Native prihvatanje finalnih bajtova na oba OS-a: offline opis, website/social prikaz, istek/povlačenje i obavezna sveža provera donation sesije. Ovde su izvršene samo shared-validator provere.
3. Pakovanje na tada aktuelnoj S10 ili novijoj osnovi, uz očuvanje ostalih modula i min-client/capability provere. Website/social vrste već postoje u organizations-v1; ovaj kandidat ne traži logo capability.
4. Zasebno odobreno potpisivanje/aktivacija; ovde nema produkcionog release-set-a, index-a ili potpisa.

Neutralni logo ne blokira taj tok. Non-null logo je zaseban kasniji kandidat sa dokumentovanim osnovom, tačnim PNG/JPEG bajtovima i dokazom oba klijenta.

## Provera

Iz korena content repozitorijuma:

```sh
node --test drafts/charity-refresh-2026-09-30/validate.test.mjs
```

Testovi pokrivaju schema, draft blokadu, tačne razlike, izvore svih veza, 30-dnevni interval, freshness, istek/povlačenje, S10 bazu i hash-eve. Modelovana reviewed/active stanja postoje samo u memoriji testa i nisu odobrenje. `manifest.json` ima `key_id=unsigned-candidate`; zaključani hash-evi su u `candidate-lock.json`.
