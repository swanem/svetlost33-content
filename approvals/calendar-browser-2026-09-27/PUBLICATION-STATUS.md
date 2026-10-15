# S10-r2 — javno objavljen i potvrđen

## Konačan rezultat 27.09.2026.

Povezani GitHub nalog omogućio je objavu preko GitHub API-ja. Javni `main`
je fast-forward pomeren na `2ee5285ac011a1b7afebcfbc3a1a691921b3e8ae`.
Objavljeno je samo 12 potrebnih runtime datoteka: tačan S10-r2 discovery,
release-set, novi manifesti/payload-i i javni digitalni potpisi, uz arhivu S9
discovery para. Interni approval, signing i native QA zapisi nisu uključeni
u objavljenu granu. Privatni ključ nije pristupan niti prenet u ovom postupku.

Bezbednosna provera zaustavila je pokušaj slanja `LOCAL-SIGNING-GO.md` i
neprozirno kodiranih potpisa. Interni zapisi isključeni su iz public tree-a;
potpisi su zatim zasebno kriptografski potvrđeni kao javni RSA-PSS potpisi,
ne privatni ključevi, i prihvaćeni u proverljivom tekstualnom obliku.

Ordinary HTTPS readback **PASS** završen je u `2026-09-27T09:59:55.548Z`,
pre prospektivnog roka. Provereni su 41 fajl, svih 9 potpisa i 23 payload-a,
sa tačnim odobrenim index/release hash-evima. Dokaz je
`public-readback-receipt.json`. Paket sada može da koriste obe platforme.
Arhiva obuhvata raspored od 29.09. do 31.12.2026; prvi datum postaje raniji
dan tek od lokalnog 30.09.2026. Nema retroaktivno izmišljene arhive.

**Važno za sledeću objavu:** lokalni `main` sadrži dodatne interne dokaze;
ne koristiti slep `git push origin main` ili force push. Buduću javnu promenu
graditi na aktuelnom remote HEAD-u, sa eksplicitnim pregledom javnih putanja.
Odobreni sadržaj i njegov potpis nisu menjani u odnosu na lokalni GO.

## Raniji status — prevaziđen uspešnom objavom iznad

Provereno 27.09.2026. u 09:32:28 UTC. **Nije objavljeno.**

- Lokalna instalacija i tačna ponovna provera uspešne u 09:29:43 UTC.
- Sadržaj i alati sačuvani u commitu
  `57a876a389b6d9208abead9b2b83f45f0c36cc72` na lokalnom `main`.
- Normalan `git push origin main` odbijen zbog nedostupnih HTTPS GitHub
  kredencijala. Provera van sandbox-a dala je isti rezultat. Nema `gh` CLI-ja
  ni već povezane GitHub integracije; ponuđeno je povezivanje, bez preuzimanja
  ili prikazivanja tokena i bez menjanja auth podešavanja.
- Javni obični HTTPS index je posle pokušaja i dalje **S9**, SHA-256
  `3205118f271828771b5fef50d645fc3636e2cd4d7e92201844c7c20da2c1f01a`.
  Ovo je samo potvrda nepromenjenog javnog index-a, ne S10 public readback.
- Nema APK/sajt/telefonskih promena; nevezane charity izmene nisu commitovane.

Finalni lokalni dokazi: 364 zajednička testa, 378 Android unit + 6 emulator
provera, 272 iOS testa + simulator build/install/launch; oba exact S10-r2
native GO sa key pin-om i starim capability profilom su zabeležena.

## Nastavak

1. Obezbediti korisnički odobren, povezan GitHub pristup sa dozvolom pisanja
   samo potrebnog repozitorijuma. Ne tražiti da korisnik šalje token u poruci.
2. Pre push-a ponovo proveriti realni rok, remote HEAD, lokalni commit/discovery
   i oba GO artefakta. Bez force push-a ili prepisivanja udaljenih izmena.
3. Ako je i dalje **pre 28.09.2026. 10:00 UTC**, objaviti zajednički commit pa
   pokrenuti `verify-calendar-browser-public-v2.mjs` uz eksplicitni
   `--signed-stage approvals/calendar-browser-2026-09-27/signed-s10-r2` i
   tačne `candidate-inputs` putanje. Sačuvati stvarni public receipt.
4. Ako rok istekne, ovaj S10 plan se **ne sme naknadno push-ovati** kao da je
   unapred objavljen: regenerisati kasniji početak i ponoviti pregled/potpis i
   native kapije. Ne backdate-ovati javni readback ili raniju arhivu.

Arhiva postaje dokaziva tek uspešnim javnim readback-om. Prvi planirani datum
je 29.09, a prikaz ranijeg dana za njega bio bi dostupan od lokalnog 30.09.
