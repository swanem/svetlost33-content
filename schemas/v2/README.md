# M0 v2 — modularni ugovor sadržaja

M0 v2 je zajednička transportna granica za Android i iOS. Ne menja istorijski
M0 v1/r1. Izdanje sadrži tačne bajtove `index.json`, `release-set.json`,
manifeste modula, njihove detached Base64 potpise i sve navedene datoteke.

## Hijerarhija poverenja

1. Klijent bira ugrađeni javni ključ pomoću `key_id`; ključ preuzet sa paketom
   nikada nije autoritet.
2. Proverava RSA-PSS/SHA-256 potpis nad tačnim bajtovima indeksa.
3. Indeks zaključava putanju, dužinu i SHA-256 potpisanog release-seta.
4. Release-set zaključava tačne verzije, manifeste i potpise modula.
5. Svaki manifest zaključava sirove bajtove svojih datoteka i zavisnosti.

`sequence` je strogo rastući broj mrežne odluke. Klijent odbija manji broj i
isti broj sa drugim bajtovima. Namerni urednički povratak zato dobija novi
release-set sa većim `sequence`; lokalni oporavak koristi prethodnu već proverenu
generaciju bez prihvatanja starog mrežnog indeksa.

## Granice

- indeks i pojedinačni manifest: najviše 256 KiB;
- najviše 16 modula i 512 datoteka po modulu;
- pojedinačna datoteka najviše 20 MiB, skup najviše 100 MiB;
- relativna POSIX putanja najviše 160 znakova, bez praznih segmenata, `.`/`..`,
  obrnutih kosa crta, apsolutnih putanja ili dupliranja;
- dozvoljeni tipovi: UTF-8 JSON, PNG i JPEG; nema koda, HTML-a ili skripti;
- slike moraju stvarno da se dekodiraju do podržanog formata, imaju najviše
  4096×4096 i 16 miliona piksela.

Tekst se proverava kao strogi UTF-8 i JSON. Slike se proveravaju kao sirovi
bajtovi i dekodiraju prema magičnim bajtovima; ekstenzija nije dokaz formata.

## Moduli i zavisnosti

- `library` nosi stabilne ID-jeve, oba pisma, izvore i licence.
- `cycles` zavisi od tačne verzije `library`.
- `calendar-YYYY` zavisi od tačne verzije `library`; nepoznati podaci ostaju
  eksplicitni.
- `backgrounds` je nezavisan i opcioni modul. Njegov neuspeh ne blokira
  kompatibilan obavezni tekstualni skup.
- `organizations` je opcion i nije deo početne osnove.

Release-set je jedina odobrena kombinacija. `approved_platforms`, minimalne
verzije klijenata i potrebne capability vrednosti proveravaju se pre aktivacije.

HTTP transport nije deo bajtova paketa: dozvoljen je samo HTTPS, najviše tri
redirect-a, bez downgrade-a i samo ka unapred dozvoljenim hostovima. Klijent
ne šalje tajne. Ova I2 predaja ne objavljuje endpoint.

## JSON šeme i validator

Šeme su Draft 2020-12 i dokumentuju zatvoren javni format. Referentni validator
dodatno proverava potpise, hashove, zavisnosti, slike i bezbedne putanje:

```sh
node scripts/validate-m0-v2.mjs fixtures/v2/positive/release
```
