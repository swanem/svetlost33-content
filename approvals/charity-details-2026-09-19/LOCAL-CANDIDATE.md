# Dobročinstvo — lokalni kandidat s5, 19.09.2026.

Korisnik je potvrdio nastavak v0.24.8. Tačan obim odluke je u
`continuation-approval.json`; to nije dozvola vlasnika logotipa ni objava.

## Pripremljeno

- Jedan zajednički kandidat za Android i iOS:
  `build/charity-details-v0248-unsigned` (52 datoteke).
- Tri zvanična website linka i šest društvenih linkova za NURDOR,
  Fondaciju NORBS+ i Srbe za Srbe. Svih šest starih donation/story linkova,
  opisi, identiteti i rok provere ostaju nepromenjeni.
- Logo je i dalje `null`, bankarske instrukcije nisu dodate.
- Svih 45 istorijskih s4 fajlova ostaju identični (discovery je arhiviran),
  uključujući biblioteku, kalendar, cikluse i pet odobrenih izvoda za vidžete
  u oba pisma.
- Minimalne verzije ostaju Android 35 / iOS 0.1.0. Ovaj paket ne zahteva
  buduću `organization-logos-v1` mogućnost.

## Provere

Kompletan content test skup: 191 test, bez grešaka; root nezavisno ponovio.
Provereni su fiksirani izvori/odobrenje, deterministički paket, odbijanje
promenjenih bajtova, arhiviranje s4 discovery-ja, kompatibilnost oba OS-a
i odbijanje replay-a. Kriptografski contract test koristi privremeni test
ključ u izolovanoj kopiji; **to nije produkcioni potpis niti dokaz native
aktivacije**.

Novi alat za potpisivanje prvo ponovo izvodi odobreni plan i proverava
celi kandidat, pa tek onda čita izričito zadati postojeći ključ. Prihvata
samo ključ koji odgovara već ugrađenom javnom ključu. Ne menja trust anchor,
ne objavljuje i ne prepisuje postojeći izlazni direktorijum.

Potrebna su tri produkciona potpisa:

| Dokument | Bajtova | SHA-256 |
| --- | ---: | --- |
| organizations manifest | 993 | `c6faffa890fa874f5ede030a605bcaca9e144cf8d2d1628ae38f9ab227a007ec` |
| release set | 2377 | `2cb71e00bf1740628e19a8c53637aa8c1f21b403271088b192d17c31fd08dec3` |
| index | 588 | `4bb1bef4c5eeea03997e53f282e88f0d522de3078938dddb96ed040667988c3d` |

Signing request SHA-256:
`31c3ac003e9bb0e03da654b70faac4b50f9deb1769aa39d70ce29e13670cbf2d`.

## Otvorene kapije

1. Produkcioni ključ nije konfigurisan preko `SVETLOST33_CONTENT_PRIVATE_KEY`
   u ovoj sesiji. Korisnik je zamoljen samo za postojeću putanju; ne za
   sadržaj ključa. Nije kreiran zamenski ključ niti tražene tajne van obima.
2. Posle potpisa sledi izolovano prihvatanje istog paketa u oba native klijenta.
3. Logotipi čekaju konkretne datoteke i dokumentovan osnov upotrebe; videti
   `logo-permission-followup.md`. Dostupnost slike nije evidentirana kao licenca.
4. Objavljivanje/aktivacija i fizičke instalacije zahtevaju zasebnu odluku.

Produkcioni discovery ostaje **s4**. Ovaj kandidat ne omogućava nove runtime
linkove u objavljenim aplikacijama dok se ne potpiše i odobreno aktivira.
