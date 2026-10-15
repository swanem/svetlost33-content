# P2c — svež radio-izvor, lokalni kandidat za pregled

Status: **radio_only_not_liturgical_assignment**. Nepotpisano, nije odobreno
niti objavljeno. Nema izmene runtime-a, posta, kalendarskih odluka ili starih
bajtova. Pauziran ostaje liturgijski molitvenik LM-01–LM-06, ne kalendar ili
dnevno Jevanđelje iz odobrenog plana. Ovaj kandidat ne utvrđuje raspored
bogoslužbenih čitanja.

## Šta je novo

Jedan svež GET zvaničnog [kalendara Radija Slovo ljubve za 2026](https://www.slovoljubve.com/cir/TumacenjaJevandjeljaKalendar.asp?Godina=2026)
završen je **30.09.2026. u 11:41:11.133 UTC**: HTTP 200, 158.093 bajta,
SHA-256 `0f2cd640a2273771a7f0871070e4b51a4a84c3e67ba5c606864c81c0b870b71f`.
Zahtev je počeo u 11:41:05.662 UTC. Nema preusmerenja, audio-download-a,
kontakta sa izdavačem ili dodatnih automatskih pokušaja.

| Poređenje izvornih radio-redova | Broj |
| --- | ---: |
| S10 annual: prisutni redovi 01.01–30.09 | 273 |
| Sveže zatečeni redovi 01.01–31.10 | 304 |
| Nepromenjeni raniji redovi | 273 |
| Novi oktobarski redovi | 31 |
| Novi celi redovi sa validnim opsezima stihova | 30 |
| Novi red sa greškom, izdvojen bez popravke | 1 |
| Izmenjeni / uklonjeni raniji redovi | 0 / 0 |
| Sveži redovi sa greškom, uključujući staru aprilsku | 2 |
| Datumi bez radio-reda, 01.11–31.12 | 61 |

Ovo **nije 31 potvrđeno liturgijsko čitanje**. `candidate.json` izdvaja 30
celih novih redova sa validnim opsezima u `valid_added`; oba neispravna reda
ostaju u `errored_observations`, uključujući nepromenjenu aprilsku grešku.
Svaki novi/diff datum u `report.json/new_or_changed_date_reviews` sadrži
tačne reference, rezultat validacije i postojeći status/razlog iz pinovanog
annual-a. Svih 31 oktobarskih datuma u njemu ostaje `UNRESOLVED`, sa razlogom
`source_content_not_entered_or_missing`; `proposed_runtime_change` je false.

## Zašto 304 izvorna reda nisu 304 aplikacijska predloga

Objavljeni annual ima **173 `SOURCE_RECORDED` predloga i 192 `UNRESOLVED`
dana**. To se ovim radom ne menja. Ni `SOURCE_RECORDED` ne potvrđuje službu:
`service_assignment_status` je nerešen. Izvorni red i urednička odluka su
različite stvari.

| Primarni razlog u postojećem annual-u | Broj dana |
| --- | ---: |
| Saglasne datumske reference, služba nedodeljena | 14 |
| Radio-reference zabeležene, služba nedodeljena | 159 |
| Datumski izvori se ne slažu | 58 |
| Naslov i povezani audio-filename imaju različit identitet | 1 |
| Dopunsko čitanje po blagoslovu nije raspored službe | 40 |
| Nevažeći krajnji stih | 1 |
| Sadržaj nedostaje ili nije unet | 92 |

Dakle, 273 ranija prisutna radio-reda daju 173 zabeležena predloga i 100
nerešenih odluka. Još 92 dana tada nisu imala radio-red. Svež izvor dodaje
31 oktobarski red za pregled, ali sam po sebi ne rešava nijednu od 192 odluke.

U podacima postoje **42 supplemental_blessing oznake**: 40 dana imaju taj
primarni razlog, a dva su već u grupi nesaglasnih izvora. Postoji i **8 dana
sa identity-review signalima**; to su preklapajuće napomene, ne dodatnih osam
koje treba sabrati. Core proverava knjigu/opseg stihova, ne audio-identitet ili
ispravnost začala. Svi stari identity-review signali preneti su u izveštaj
kao nerešeni. Raniji čitalački README sa brojkom 40 nije autoritet za broj
supplemental oznaka: tačni JSON podaci daju 42.

## Greške ostaju doslovno sačuvane

- **09.04.2026:** „Јеванђеље по Луки, зачало 109. 19,39-71“ —
  `invalid_verse_endpoint`, postojeća nepromenjena greška.
- **16.10.2026:** „Јеванђеље по Луки, зачало 32. 7,31-25“ —
  `invalid_or_reversed_range`, novi red. Druga referenca istog reda,
  „Јеванђеље по Матеју, зачало 55. 13,44-52“, takođe je sačuvana, ali nije
  delimično promovisana u validni kandidat.

Ne nagađamo drugu glavu, stih, začalo ili ispravku. Postojeći monitor core
zbog grešaka **ne pomera last-good state**; ovde nije upisano nikakvo monitor
stanje. Odsustvo reda nije dokaz da toga dana nema liturgijskog čitanja.

## Datoteke i ponovljivost

- `source-observation.json`: svih 304 normalizovanih činjeničnih redova,
  ne puni HTML; stvarni timestamp/status/byte count/SHA dobijeni tokom GET-a.
- `pins.json`: tačni S10 release-set, annual i corpus bajtovi, njihove module
  manifests, postojeći gap inventory i korišćeni `radio-monitor-core-v2.mjs`.
- `candidate.json`: samo novi/izmenjeni validni redovi, odvojene greške i
  eventualni uklonjeni redovi kao signali za pregled, nikada nalog za brisanje.
  Prisutni red bez referenci izdvojio bi se kao `NO_REFERENCE_NOT_ASSIGNMENT`,
  nikada kao validno novo čitanje; u stvarnom snapshot-u takvih redova nema.
- `report.json`: brojke, postojeće odluke, svaki novi/diff datum, stare
  identitetske napomene, greške i nepopunjeni radio-datumi.
- `inspect.mjs`, `inspect.test.mjs`: čitanje pinovanih bajtova, čista projekcija,
  replay kroz pravi core parser i provera determinističkog diff-a.
- `capture.mjs`: izričito uključen novi GET, maksimalno 15 sekundi / 5 MB;
  jedan dozvoljen URL, bez redirect-a, fajl-upisa, scheduler-a ili izdavanja.
- `manifest.json`: hash inventar ovog lokalnog paketa, **ne digitalni potpis**.

Iz korena content repozitorijuma, bez mreže i bez upisa:

```sh
node drafts/radio-refresh-2026-09-30/inspect.mjs
node --test drafts/radio-refresh-2026-09-30/inspect.test.mjs
```

Samo kada se traži novi izvorni pregled, izričita mrežna komanda:

```sh
node drafts/radio-refresh-2026-09-30/capture.mjs --fetch
```

Ona daje novu opservaciju na standardnom izlazu; ne prepisuje ovaj snapshot,
ne ažurira kandidat, ne menja last-good state niti aktivira monitor. Sledeći
snapshot mora biti zasebna pregledana revizija, ne tiha zamena dokaza.

Puni HTML nije zadržan. Zato offline replay potvrđuje parsabilnost i validaciju
sačuvanih normalizovanih činjenica, **ne rekonstruiše izvorne HTML bajtove**.
Response SHA je evidencija iz tadašnjeg GET-a, ne tvrdnja o runtime
autentifikaciji ili naknadna kriptografska potvrda svih tvrdnji izdavača.
Ovo je factual extract referenci i izvornih napomena, ne kopija audio-sadržaja
ili dugih tuđih tekstova; nije izmišljena licenca izvora.

`owner_approval` i `clerical_review` ostaju null; `publication_authorized`,
`production_eligible` i `release_allowed` su false. Ostaju ljudski pregled
činjenica, zaseban liturgijski review ako bude tražen, konkretno odobrenje
sadržaja, budući tačno vezan release/native provere i posebno produkciono
odobrenje. Potvrđeno rešenih kalendarskih praznina u ovom koraku: **0**.
