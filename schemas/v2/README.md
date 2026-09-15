# M0 v2 — modularni ugovor sadržaja

M0 v2 je zajednička transportna granica za Android i iOS. Ne menja istorijski
M0 v1/r1. Izdanje sadrži tačne bajtove `index.json`, `release-set.json`,
manifeste modula, njihove detached Base64 potpise i sve navedene datoteke.

Svi `module_id`, `version`, `key_id` i channel identiteti imaju
3–64 mala ASCII znaka, počinju slovom ili cifrom, a ostatak je `[a-z0-9._-]`.
Capability identiteti imaju 1–64 ASCII alfanumerička/`._-` znaka i čuvaju
veličinu slova, pa su zaključane vrednosti `sr-Cyrl` i `sr-Latn` važeće.
`required` je isključivo JSON Boolean. Android minimum je pozitivan celobrojni
`versionCode`, a iOS minimum je numerički `major.minor.patch`.

## Hijerarhija poverenja

1. Klijent bira ugrađeni javni ključ pomoću `key_id`; ključ preuzet sa paketom
   nikada nije autoritet.
2. Proverava RSA-PSS/SHA-256 potpis nad tačnim bajtovima indeksa.
3. Indeks zaključava putanju, dužinu i SHA-256 potpisanog release-seta.
4. Release-set zaključava tačne verzije, manifeste i potpise modula.
5. Svaki manifest zaključava sirove bajtove svojih datoteka i zavisnosti.

Detached potpis je kanonski Base64 sa opcionim spoljnim ASCII whitespace-om,
bez nevažećih ili unutrašnjih whitespace znakova, i fajl ima najviše 8 KiB.

`sequence` je strogo rastući broj mrežne odluke. Klijent odbija manji broj i
isti broj sa drugim bajtovima. Namerni urednički povratak zato dobija novi
release-set sa većim `sequence`; lokalni oporavak koristi prethodnu već proverenu
generaciju bez prihvatanja starog mrežnog indeksa.

Indeks je vremenski važeći samo kada je `issued_at <= sada < expires_at`.
Tačno u `issued_at` je važeći, a tačno u `expires_at` je istekao. Oba polja su
JSON Schema `date-time`/RFC 3339 vremenski trenuci; budući i istekli indeks se
odbijaju nakon poređenja njihovih normalizovanih instanata.

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
bajtovi i potpuno dekodiraju zaključanim `sharp`/libvips decoderom; ekstenzija
ili samo zaglavlje nisu dokaz formata. Native klijenti moraju da izvrše potpuno
dekodiranje svojim sistemskim decoderom i primene iste format/dimenzija granice.

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
`approved_platforms` je neprazan skup bez duplikata, sastavljen isključivo od
`android` i `ios`; klijent mora da pronađe sopstvenu platformu u tom skupu.
Obavezni modul sa nepodržanom capability vrednošću odbija skup. Opcioni modul
proverava do potpisanog manifesta, zatim se preskaču payload i zavisnosti i on
ostaje van aktivne kombinacije. Zato oštećen/nedostupan payload nepodržanog
opcionog modula ne blokira kompatibilne obavezne module.

HTTP transport nije deo bajtova paketa: dozvoljen je samo HTTPS, najviše tri
redirect-a, bez downgrade-a i samo ka unapred dozvoljenim hostovima. Klijent
ne šalje tajne. Ova I2 predaja ne objavljuje endpoint.

## JSON šeme i validator

### Izdavačka politika v0.17 — jedno sadržajno odobrenje

Nova zajednička produkciona izdanja ciljaju `approved_platforms: ["android", "ios"]`
uz [jedno vlasnikovo sadržajno odobrenje](../../approvals/README.md), zajedničke
module i jedan discovery kanal. Naziv postojećeg polja ne zahteva dva odobrenja:
ono ostaje potpisana transportna lista ciljanih platformi. `min_clients`,
capability i platformski QA proveravaju tehničku kompatibilnost odvojeno.

JSON šema već dopušta obe platforme i ovom dopunom **nije menjana**. Zadržati
čitanje istorijskih Android-only izdanja na Androidu i njihovo odbijanje na iOS-u.
Exporter novog zajedničkog izdanja mora uskladiti i unutrašnji scope/evidence;
ne samo spoljašnju listu platformi. Postojeći exporter još hardkodira Android;
ova dokumentacija ne predstavlja njegovu implementaciju ili novu objavu.

### Postojeće šeme i referentna provera

Šeme su Draft 2020-12 i dokumentuju zatvoren javni format. Referentni validator
dodatno proverava potpise, hashove, zavisnosti, slike i bezbedne putanje:

```sh
node scripts/validate-m0-v2.mjs fixtures/v2/positive/release
```

Referentni API zahteva platformu, verziju klijenta i capability skup. CLI za
fixture podrazumeva Android `versionCode` 10 i njegov zamrznuti capability skup;
iOS se proverava sa `--platform ios --client-version 0.15.0`.
