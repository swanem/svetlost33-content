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
posta. Odluka nije nova opšta licenca, crkveno odobrenje ili automatsko
odobravanje budućih promena. Novi provereni sadržaj dobija novo zajedničko
odobrenje, a ne dva platformska.

## Odobrene podloge v1

[shared-backgrounds-v1-2026-09-16](shared-backgrounds-v1-2026-09-16/approval.json)
zaključava tačne bajtove kataloga i svih 18 postojećih PNG podloga za Android i
iOS. [Izvorni manifest](shared-backgrounds-v1-2026-09-16/source-manifest.json)
navodi putanju, veličinu, SHA-256 i dimenzije svake slike, a
[registar prava](../licenses/backgrounds-v1.json) vezuje svaku stavku za isto
odobrenje vlasnika. Tehnički izvedene umanjene slike dozvoljene su samo kao
pregled iste podloge.

Ovo je urednička evidencija, još nije potpisani `backgrounds` modul niti dokaz
javne objave. Modul se objavljuje tek nakon kompatibilnih Android i iOS klijenata
i platformskog QA, tako da starije instalacije zadrže poslednji važeći katalog.

Ranije odluke ostaju istorijski trag. Posebni
[iOS zapis](ios-annual-2026-r1-2026-09-15/approval.json) i potpisana Android
evidencija se ne prepravljaju niti ponavljaju kao dve aktivne uredničke kapije.
Ovaj registar je evidencija izdavača, **nije runtime šema ili zaobilaženje
provere potpisa/platforme**.

## Dobročinstvo — kartice odobrene 18.09.2026.

[Zajednička odluka za tri kartice](charity-cards-2026-09-18/README.md) beleži
NURDOR, Fondaciju NORBS+ i Srbi za Srbe umesto 28. Juna. Odobreni su kartice i
navedene zvanične spoljašnje veze, ne naši IPS/SWIFT nalozi, logotipi ili
privatni servis. Odluka nije potpisani runtime registar ili dokaz objave;
tačan payload, proverena obavezna polja i nativno učitavanje ostaju posebni
koraci. Raniji fixture-i i potpisani paketi ostaju nepromenjeni.

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

Zajednički režim exportera sada proverava ovu evidenciju i u testu pravi novi
paket u privremenom direktorijumu. Ne menja stare potpisane pakete, runtime JSON
šeme, URL-ove ili klijentske lockove i ne predstavlja produkcijski potpis,
objavu, instalaciju ili platformsko prihvatanje.
