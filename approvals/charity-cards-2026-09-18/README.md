# Dobročinstvo — odobrenje tri kartice i zvaničnih linkova

Datum odluke: **18.09.2026.** Jedno vlasničko odobrenje za **Android i iOS**.
Status: **odobren urednički obim; nije potpisani runtime registar ili objava**.

Posle pregleda izvora i zamene 28. Juna organizacijom Srbi za Srbe korisnik je
potvrdio: „ok odobravam sve tri kartice da li mozemo onda dobiti ux koji smo
iznad definisali?”

## Odobreni izbor i pregledane veze

| Stabilni ID | Kartica / kratak opis | Podrži — spoljašnji tok | Priče i rezultati — kod izvora |
|---|---|---|---|
| `nurdor-rs` | **NURDOR** — Podrška deci oboleloj od raka i njihovim porodicama. | https://www.nurdor.org/doniraj | https://www.nurdor.org/nase-price |
| `norbs-plus-rs` | **Fondacija NORBS+** — Podrška osobama sa retkim bolestima kroz medicinsko-tehnička pomagala. | https://1jeposeban.rs/ | https://norbs.rs/fondacija-norbs-plus/ |
| `srbi-za-srbe-rs` | **Srbi za Srbe** — Pomoć ugroženim višedetnim srpskim porodicama. | https://donacije.srbizasrbe.org/ | https://www.srbizasrbe.org/pomogli-smo/ |

Veze su pregledane 18.09.2026. „Podrži” za NORBS+ vodi na zvaničnu platformu
sa instrukcijama, nije tvrdnja o dostupnom kartičnom plaćanju. Opšti NORBS
taster i račun udruženja ne smeju zameniti Fondaciju kao izabranog primaoca.

Ćirilični nazivi: **НУРДОР**, **Фондација НОРБС+**, **Срби за Србе**. Isti opisi:
„Подршка деци оболелој од рака и њиховим породицама.”;
„Подршка особама са ретким болестима кроз медицинско-техничка помагала.”;
„Помоћ угроженим вишедетним српским породицама.”

`28-jun-rs` nije deo ovog prvog izbora. Njegov ID ne preimenovati niti
dodeljivati drugom primaocu; sačuvati istorijske zapise/fixture-e.

## Granice odobrenja

- Odobreni su kartice, opisi, neutralne ikonice i navedene zvanične veze.
  UX je u kanonskom specu DB-04/DB-06/DB-08/DB-09/DB-11, ne u posebnom OS specu.
- Nije odobren naš domaći/SWIFT nalog, IPS QR payload, račun, logo/fotografija,
  preuzimanje priče, partnerstvo ili nezavisna revizija potrošnje donacija.
  Nijedna uplata nije izvršena/testirana ovim pregledom.
- Ne dodavati oznaku `SVETLOST33`, donorske identifikatore, iznose ili istoriju
  u URL ili tuđe instrukcije. Dogovor o prepoznavanju izvora uplate ne postoji.
- Države/bankarske opcije spoljašnjeg portala ne aktiviraju lokalne BiH/SWIFT
  tokove. Ne prepisivati tarife poziva: za Srbi za Srbe uočena je razlika
  između portala i glavnog sajta. Društvene mreže zahtevaju proveru tačne veze.
- Evidencija ostaje ručna i lokalna dok privatni servis nije konfigurisan i
  proveren; povratak iz browsera nije potvrda banke niti automatska prijava.

## Izvori i granice provere

- NURDOR: [zvanični identifikacioni podaci](https://www.nurdor.org/identifikacioni-podaci)
  i [godišnji izveštaji](https://www.nurdor.org/godisnji-izvestaji). Nije
  nezavisno potvrđen tekući registarski/bankarski status u ovom pregledu.
- NORBS Plus: [zvanična stranica](https://norbs.rs/fondacija-norbs-plus/) i
  [NBS](https://webappcenter.nbs.rs/PnWebApp/CompanyAccount/Company/DetailsResident?NationalCode=28830637)
  potvrđuju usklađenost identiteta Fondacije i domaćeg računa; to nije
  kompletna instrukcija za naš IPS/SWIFT ili finansijski audit.
- Srbi za Srbe: [opis](https://www.srbizasrbe.org/o-nama/),
  [izveštaji](https://www.srbizasrbe.org/mesecni-i-godisnji-izvestaji/) i
  zvanično povezani donatorski portal. Nije nezavisno potvrđen tekući APR/NBS
  status ili svaki nacionalni ogranak/svaki mesečni izveštaj za 2026.

## Aktivacija je poseban tehnički korak

Odluka ne zaključava nepostojeće buduće bajtove. Pre aktivacije pripremiti
tačan dvojezični `reviewed` registar, potvrditi obavezna polja (uključujući
pravno ime), izvore i stvarne rokove provere, zaključati hash i povezati ga sa
ovom odlukom. Ne izmišljati nezavisnu proveru ili datum važenja.

Isto odobrenje važi za oba OS-a. Potrebni su novi nepromenljivi opcioni M0
`organizations` modul, zajednički release-set i test stvarnog učitavanja oba
klijenta. `payment_rails` ostaje prazno. Stari `registry.candidate.json` i
potpisani artefakti ostaju nepromenjeni. Ovim korakom nije pokrenuta nova
native implementacija, instalacija, serverski servis ili objava.
