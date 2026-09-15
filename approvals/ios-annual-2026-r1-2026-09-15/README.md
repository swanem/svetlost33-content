# Odobrenje vlasnika za iOS sadržaj — annual 2026 r1

**Istorijski zapis:** naknadna odluka v0.17 objedinjuje odobrenja za oba OS-a.
Za naredno izdavanje koristiti [zajednički registar i predaju](../README.md),
ne novi zasebni iOS sadržajni tok. Ovaj zapis i njegov JSON ostaju trag ranije odluke.

**Odobreno 15.09.2026.** Korisnik je, posle pregleda odvojenih Android/iOS
odobrenja, izričito zatražio: „odobri sve za ios izdavanje”.
[Evidencija odluke](approval.json) vezuje odobrenje za tačan izvorni commit,
SHA-256 godišnjeg manifesta i svih njegovih 13 sadržajnih datoteka.

## Šta je odobreno

Za iOS distribuciju u Srbiji i BiH odobren je isti neizmenjeni sadržaj kao u
annual r1: **150 psalama, 18 molitava (uključujući 12 istorijskih), četiri
Jevanđelja, postojeći sedmodnevni ciklus sa 21 terminom, oba pisma, lokalni
izvori/licence i godišnji kalendar sa 365 datuma**. Za ove iste tekstove ne
traži se ponovo korisnikovo sadržajno odobrenje samo zbog prelaska na iOS.

Odobrena su **173 radio-predloga**, ne kompletan bogoslužbeni raspored.
**192 nepotvrđena dnevna čitanja i 91 nepotvrđena strogost posta** ostaju
jasno nepotvrđeni. Odluka ne menja činjeničnu tačnost niti obim izvora.

## Šta ova odluka ne potvrđuje

- Ne potvrđuje završene iOS testove, potpisan produkcioni paket, aktivan
  endpoint, instalaciju ili App Store prihvatanje.
- Ne dodaje prava koja ne postoje u ranijoj evidenciji, crkveni blagoslov ili
  novu nezavisnu pravnu proveru. Teritorijalni obim ostaje Srbija/BiH;
  ovo nije nova opšta dozvola za globalnu distribuciju svih resursa.
- Podloge nisu u r1. Novi javni modul zahteva popis i dokaz prava za svaku
  konkretnu sliku; postojeće ugrađene slike ovom odlukom nisu menjane.
- Nema konkretnog registra udruženja/računa za odobravanje; ne izmišljati ga.

## Predaja za `ios mvp` i zajedničkog izdavača

Ovo je dodatna **urednička evidencija**, van potpisanih izdanja. Format
`svetlost33-owner-platform-approval-1` nije M0 runtime šema niti datoteka koju
klijent sme da koristi da zaobiđe provere potpisa ili platforme.

1. Proveriti hash izvornog manifesta i svih 13 datoteka. Sačuvati prethodno
   Android odobrenje i sve već potpisane/objavljene artefakte neizmenjene.
2. Pripremiti novo nepromenljivo iOS-kompatibilno izdanje sa usklađenim
   potpisanim opsegom i ovom evidencijom. Postojeći Android modul biblioteke
   sadrži `release-scope.json` ograničen na Android; promena samo spoljašnjeg
   `approved_platforms` nije dovoljna. Promena bajtova modula dobija novu
   verziju/reviziju, uz svih 13 identičnih izvornih sadržajnih datoteka.
3. Ne pokretati postojeći Android exporter nad njegovim podrazumevanim
   direktorijumom: taj tok ne priprema iOS odobrenje i ne sme prepisati izdanje.
4. U `ios mvp` završiti produkcione ulaze, offline osnovu, integraciju,
   nadogradnju i platformske provere prema jedinoj zajedničkoj specifikaciji.
   Sačuvati korisničke izbore i januarsku pokrivenost 2027. iz prethodne osnove.
5. Potpisivanje/objavu i aktivaciju evidentirati kao zasebne stvarno izvršene
   korake. Sam unos ove odluke nije njihovo izvršavanje.

Ovaj unos ne pokreće MVP teme, ne menja aplikacioni kod, build/lock/snapshot,
URL-ove, sadržajne bajtove, šeme M0 ili potpise i ne instalira aplikaciju.
