# Produkcioni M0 v2 izvozi

`annual-2026-r1` je prvi potpisani modularni izvoz odobrenog godišnjeg paketa.
Odobren je za Android i koristi isti sadržajni RSA ključ kao istorijski r1, ali
M0 v2 potpisi koriste RSA-PSS/SHA-256. Privatni ključ nije u repozitorijumu.

Izvoz čuva svih 13 istorijskih payload datoteka bajt-po-bajt. Naknadno
odobrenje je zapisano odvojeno u modulu biblioteke, tako da raniji statusi u
izvornim datotekama ostaju dokaz toka pregleda. `release-scope.json` određuje
tačno dozvoljeno tumačenje 173 radio-predloga i eksplicitno čuva 192 nerešena
datuma i 91 nepotvrđenu strogost posta.

Nisu uključene podloge: annual r1 ne sadrži njihov per-asset pregled prava.
Nije uključen modul organizacija ili donacija.

## Zajednički v0.17 izvoz i discovery raspored

`npm run export:r1:v2:shared` priprema narednu zajedničku tehničku reviziju u
novom izlaznom korenu `build/v0.17-shared-discovery-root`. Komanda ne može da
prepiše istorijski `releases/v2/annual-2026-r1`: zajednički release-set ima
identitet `shared-annual-2026-r1-m0v2-s2`, sekvencu 2, oba OS-a i iOS minimum
`0.1.0`.

Izlazni koren je spreman da bude sadržaj stabilne javne `/content/v2` adrese:

```text
index.json
index.sig
trusted-public-key.pem
releases/shared-annual-2026-r1-m0v2-s2/
  release-set.json
  release-set.sig
  modules/<module-id>-<version>-r<revision>/...
```

Samo potpisana discovery odluka `index.json`/`index.sig` menja se između
objava. Release-set, manifesti i payload ostaju ispod jedinstvene nepromenljive
putanje. Sve putanje u indeksu i release-setu računaju se od discovery korena,
što odgovara Android i iOS M0 v2 resolverima.

Exporter zahteva spoljašnji privatni ključ. Automatizovani test koristi samo
jednokratni ključ u privremenom direktorijumu i ne pravi produkcijski artefakt.
Zbog nasumične soli RSA-PSS potpisi nisu bajt-po-bajt ponovljivi; svi potpisani
dokumenti, payload i raspored putanja jesu, a svaki generisani potpis prolazi
punu proveru.
