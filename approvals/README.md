# Jedno odobrenje sadržaja za Android i iOS

Aktuelna politika od **15.09.2026, specifikacija v0.17 / UC-10**: vlasnik
odobrava tačnu sadržajnu reviziju **jednom za obe aplikacije**. Nema ponovnog
odobravanja istih tekstova ili slika samo zato što ih preuzima drugi OS.
Izvor, tačnost, prava, teritorije i promenjeni sadržaj i dalje zahtevaju pregled.

## Važeće zajedničko odobrenje

[shared-annual-2026-r1-2026-09-15](shared-annual-2026-r1-2026-09-15.json)
objedinjuje ranije Android/iOS odluke za istih 13 neizmenjenih annual r1
datoteka: **150 psalama, 18 molitava, četiri Jevanđelja, oba pisma, 21 dnevni
termin, lokalni izvori/licence i 365 kalendarskih datuma**, u obimu Srbije/BiH.
Hash izvornog manifesta zaključava tačan spisak datoteka i njihovih hashova.

Ostaje 173 radio-predloga, 192 nepotvrđena čitanja i 91 nepotvrđena strogost
posta. Podloge nisu u tom paketu i čekaju dokaze prava po slici; nema konkretnog
registra udruženja/računa. Odluka nije nova opšta licenca, crkveno odobrenje ili
automatsko odobravanje budućih promena. Novi provereni sadržaj dobija novo
zajedničko odobrenje, a ne dva platformska.

Ranije odluke ostaju istorijski trag. Posebni
[iOS zapis](ios-annual-2026-r1-2026-09-15/approval.json) i potpisana Android
evidencija se ne prepravljaju niti ponavljaju kao dve aktivne uredničke kapije.
Ovaj registar je evidencija izdavača, **nije runtime šema ili zaobilaženje
provere potpisa/platforme**.

## Predaja za zajedničkog izdavača i oba MVP toka

1. Koristiti isto odobrenje i pripremiti **jedan novi zajednički potpisani
   release-set** sa `approved_platforms: ["android", "ios"]`, usklađenim
   unutrašnjim opsegom/evidencijom i istim sadržajnim modulima za oba klijenta.
   Postojeća M0 v2 šema već podržava oba OS-a; ne praviti novu samo radi ovog pravila.
2. Sačuvati postojeće potpisane artefakte. Android-only exporter trenutno
   hardkodira platformu i menja izlazni direktorijum: potreban je izmenjen i
   proveren zajednički izvozni tok, ne pokretanje nad postojećim r1. Promena
   sadržaja datoteka modula, uključujući scope/evidence, dobija novu verziju
   modula i usklađene zavisnosti; svih 13 izvornih payload datoteka ostaje isto.
3. Jedan stabilni potpisani discovery indeks oglašava isti release-set za oba
   OS-a. Potpis, hash, sekvenca/rok, platforma, minimum aplikacije, mogućnosti i
   zavisnosti proveravaju se kao do sada. `min_clients` odražava stvarne
   verzije aplikacija i testove; ne kopirati iOS `0.15.0` iz Android primera
   samo zato što se specifikacija zvala v0.15.
4. Za kompatibilne instalacije jedan N → N+1 sadržajni update ne zahteva novi
   APK/IPA. Offline ili prestar klijent ostaje na poslednjem validnom sadržaju;
   tehničko ažuriranje aplikacije ne traži ponovno vlasnikovo odobrenje teksta.
   Zajedničko odobrenje nije obećanje istovremene aktivacije na svim telefonima.
5. Čista promena tehničke distribucije/potpisa uz iste sadržajne hashove,
   tvrdnje i prava može koristiti isti approval ID, uz novu tehničku reviziju
   kada je potrebna. Promenjen sadržaj ili opseg prava zahteva novi zajednički
   pregled. Odobrenje, potpisivanje, objava, kompatibilnost i platformski QA
   imaju odvojene stvarne dokaze po UC-T15–UC-T18.

Ova dokumentaciona predaja ne menja exporter, validatore, klijentski kod,
runtime JSON šeme, stare potpisane pakete, URL-ove ili lockove; ne pokreće
MVP teme, build, objavu ili instalaciju.
