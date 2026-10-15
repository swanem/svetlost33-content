# Lokalni potpisni GO — S10 kandidat

27.09.2026. Koordinator, u okviru korisničkog naloga za nastavak.

Dozvoljeno: potpisati **lokalni staging** tačnog pregledanog kandidata postojećim
projektnim ključem, radi pune M0 provere na obe native platforme. Privatni ključ
ostaje izvan repozitorijuma; ne kopira se, ne prikazuje i ne menja se trust anchor.
Ovaj zapis ne aktivira javni kanal, ne tvrdi da je sadržaj već objavljen i ne
zamenjuje native QA. Odluka o javnoj aktivaciji ostaje odvojena kapija.

| Ulaz | SHA-256 |
|---|---|
| Pregledan izvorni predlog | `f0cfe5d6e75f9d5fcad95b5b38c1aa1de7efe1be3057f4828ded1f57279d64f8` |
| Lokalni candidate-review.json | `f210887c43ba66ee52a3086a92cda7930a12e740708c2522ecb5378ee7194d07` |
| Catalog payload | `9d8f9e09dd9bb1a845bac8b3c41198b19ebd87560824228de73cad269f385529` |
| Browser payload | `e3a1422ac3959a4259a2062d767ae6252bf56d6e6d2b915f73996a0753c31c2e` |
| Kandidat index | `008dab19b0f0561626c7de820f9ab039fc2938b34bcf57181851304097118a96` |
| Kandidat release-set | `ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879` |

Nezavisna revizija je potvrdila 21 kalendarsku vezu, očuvanje svih starih
identiteta/tekstova/članaka/rights polja, 94 buduća dana i 282 faze. Preflight
proverava 12 capability kombinacija za oba OS-a; unsigned rezultat nije
predstavljen kao autentifikovana nova generacija. Predlog je unapred određeni
raspored, bez izmišljene ranije arhive.

Izvršiti ponovno poređenje celog input inventara i potpisa izvornog S9 pre
pristupa ključu. Odbiti promenjen izvor, drugačiji ključ, postojeći output,
symlink ili istekao rok. Potpisani izlaz ide samo u nov `signed-s10` staging;
četiri nova potpisa, nijedan stari dokument se ne prepisuje.

Prospektivna javna objava mora biti potvrđena pre **28.09.2026 10:00 UTC**;
potpis sam po sebi ne ispunjava taj uslov. Ako objava izostane do tada,
pripremiti kasniji početak i ponoviti pregled, nikada backdate-ovati istoriju.

## Ispravljen lokalni transport r2 — 27.09.2026.

Prvi gore zabeleženi index nije prošao iOS datum parser: `issued_at` sadrži
milisekunde. Taj staging ostaje neobjavljen dokaz odbijenog kandidata.
Koordinator odobrava ponovni lokalni potpis u **nov** `signed-s10-r2`, iz
`unsigned-s10-r2`, posle normalizacije vremena na `2026-09-27T09:06:12Z`.
Postojeći trust anchor, četiri potpisna cilja, release-set, oba payload-a i
pregled ostaju isti. Novi index ima 595 bajtova i SHA-256
`cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23`.

Builder/signer imaju 16 regresionih testova PASS, uključujući iOS-kompatibilno
vreme i nezavisnu stvarnu vremensku granicu pre pristupa ključu/pre output-a.
CLI potpis ne dopušta `--now` override. Raniji native GO nije GO za nove
transportne bajtove: oba OS-a moraju ponovo proveriti r2. Uslovno vlasničko
odobrenje javne objave je odvojeno u `PUBLICATION-AUTHORIZATION.md`.
