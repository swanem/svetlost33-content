# Razvojni primer odobrenih podloga v1

Ovaj fixture se generiše iz tačnih odobrenih izvora; 18 PNG originala se ne
duplira u Git fixture direktorijumu. `build/` je ignorisan. Potreban je Node iz
repo zahteva, `npm ci` i lokalni izvorni checkout sa tačnim odobrenim bajtovima.

```sh
npm run development:backgrounds -- --out build/backgrounds-v1-qa
npm run development:combined -- --out build/combined-qa
```

Oba generatora prihvataju `--source /putanja/do/svetlost33-github`. Izvorni checkout
ne mora biti na istom HEAD-u: proveravaju se tačni hash-evi kataloga i originala
vezani za odobrenje `shared-backgrounds-v1-2026-09-16`. Nov katalog, original ili
registar prava ne mogu ponovo koristiti ovo odobrenje. Za ponovljeni izvoz izabrati
nov izlazni direktorijum; generator nikad ne briše postojeći izlaz.

Samostalni paket je potpisani M0 v2 `development` skup sa jednim opcionim modulom:

- `module_id: backgrounds-v1`, `version: 1.0.0`, `module_type: backgrounds`;
- `required: false`, capability `background-catalog-v1`, bez zavisnosti;
- obe platforme, razvojni minimum Android 10 / iOS 0.1.0;
- 42 manifestovane datoteke, uključujući 18 originala i 18 pregleda;
- samo javni testni ključ; privatni ključ nikad nije upisan.

`data/catalog-v1.json` koristi `schemaVersion`, `version`, `defaultIDs`, `provenance`
i native item polja `id`, `assetPath`, `titleLatn/Cyrl`, `captionLatn/Cyrl`, `isDark`,
`feastMonthDay`, `width`, `height`, `sha256`. Vrednosti su deterministički izvedene
iz odobrenog kataloga i source-manifesta. `assetPath` ostaje `backgrounds/...png`;
transportni original je na `media/<assetPath>`. Klijent izvodi thumbnail putanju
`thumbnails/<id>-<original-sha256>.jpg`; katalog nema novo `thumbnailPath` polje.

Pregledi imaju 480 × 853 piksela, JPEG quality 80, progressive, 4:2:0 i optimizovano
kodiranje. Lanczos resize koristi tačne ciljne dimenzije kao postojeći iOS generator.
Svaki preview je manji od 250.000 bajtova; generator ne dodaje natpise niti izmišlja
fokus ili licence. Encoder `sharp`/libvips i svi parametri su zabeleženi u
`evidence/derivations.json`, uz izvorni hash i tačan hash/broj bajtova svake sličice.

Potpisani manifest dodatno vezuje neizmenjene `evidence/owner-approval.json`,
`source-manifest.json`, `rights.json` i `approved-catalog.json`. `androidCatalog`
provenance upućuje na stvarni kanonski Android JSON, ne na izmišljeni Kotlin izvor.
Prava ostaju odobrenje vlasnika za trenutni Android/iOS obim RS/BA; ovo ne tvrdi
javnu licencu, autorstvo, proširenje teritorija ili odobrenje budućih revizija.

Kombinovani generator koristi isti backgrounds builder i prethodni godišnji
generator za svih 13 identičnih godišnjih payload datoteka. Sva četiri manifesta,
release-set i indeks dobijaju jedan nov razvojni ključ. Ne menja postojeće potpise
niti produkcionu sekvencu. Biblioteka/ciklusi/kalendar su obavezni; podloge ostaju
opcione. Klijentski projektor treba da koristi kombinovani primer za aktivaciju;
samostalni primer služi izolovanoj transportnoj proveri.

```sh
node scripts/validate-m0-v2.mjs build/backgrounds-v1-qa \
  --channel development --key-id svetlost33-development-backgrounds-key-1 \
  --platform ios --client-version 0.1.0
node scripts/validate-m0-v2.mjs build/combined-qa \
  --channel development --key-id svetlost33-development-key-1 \
  --platform android --client-version 10
npm test
```

Testovi proveravaju oba klijenta, sve originalne bajtove, veze dokaza i kataloga,
potpuno dekodirane JPEG-ove, deterministički payload, odbijanje izmenjenih ulaza i
nepromenjen produkcioni direktorijum. RSA ključ i PSS potpisi su namerno novi pri
svakom pokretanju, pa se determinističnost ne tvrdi za potpise. Referentni validator
preskače payload opcionog modula kada klijent nema capability. Kod podržanog
modula oštećen payload je greška; to nije dokaz klijentskog fallback/rollback toka.
Nijedan od ovih testova nije produkcijska objava ili platformsko prihvatanje.
