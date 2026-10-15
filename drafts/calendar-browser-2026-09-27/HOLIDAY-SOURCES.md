# Praznici 2026 — pregled izvora i predlog za v0.28

Provereno **27.09.2026.** Status: **pending technical and source-review candidate**.
Mašinski predlog je [holiday-review.json](holiday-review.json). Ovo je predlog
metapodataka; nije potpisan paket niti dokaz objave, prava ili crkvene recenzije.

Predlog obuhvata **21 konkretan datum 2026**: Vaskrs, dvanaest velikih praznika
i osam već postojećih spomena koje izdavač mesečnog kalendara izričito označava
kao „Велики празник“. Taj izraz je evidencija izdavača, a ne rang izveden iz
`kind=feast`, popularnosti, naziva, slave, motiva ili računanja datuma.
Ovo nije potpun spisak svih praznika ili svetitelja SPC; **2027 ostaje unavailable**.

## Tačni ulazi i čuvanje identiteta

- Profil: `spc-rs-ba-julian-v1`; građanski datumi su gregorijanski.
- S9 katalog: `releases/v2/production/releases/shared-saints-completion-2026-09-21-m0v2-s9/modules/liturgical-catalog-v1-2026.9.20-r4/data/liturgical-catalog-v1.json`.
  SHA-256: `13113be5f9bd3aeebc349cb5a89fee88439f7da57e9db9f6d9f1877e3da89774`.
- K2026 godišnji payload: `releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json`.
  SHA-256: `a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`.
- Veza ostaje `calendar-spc-2026`, modul `calendar-2026-r1`, verzija
  `2026.1.1`, revizija 2, `data/calendar.2026.json`.
- Dodaje se 12 spomena i 12 godišnjih pojava; nema novih subjekata.
  Ponovo se koriste 9 postojećih spomena/pojava i njihovih 8 subjekata.
  Posle predloženog spajanja katalog ima 27 spomena i 25 pojava na 25 datuma.
  Browser izbor sadrži 21 članstvo, odvojeno od šireg kataloga.
- Oba postojeća `article_links` zapisa, za Čudo u Honi i Malu Gospojinu,
  i postojeći `article_bindings` ostaju nepromenjeni. Mala Gospojina koristi
  `obs-nativity-theotokos` i `occ-obs-nativity-theotokos-2026`.
- Postojeći redovi se ne prepisuju; nove reference koriste postojeće source ID-jeve.
  Samo `eparhija-month-04`, `eparhija-month-08` i
  `eparhija-zt-twelve-great-feasts` su novi kanonski source redovi.
  Sve nove wire stavke i sva browser članstva imaju `review_status: pending`.
  Stara izvorna `checked_on` polja ostaju netaknuta; ponovna provera 27.09.
  evidentirana je odvojeno u `source_checks`.

Korisnikova saglasnost u razgovoru autorizuje pripremu. Ona ne dokazuje sadržaj
izvora niti sama po sebi predstavlja odobrenje tačnih bajtova buduće revizije.

## Članstva predložena za pregled

M = tačan godišnji mesečni izvor SPC, sa izričitom oznakom velikog praznika.
ZT = nezavisna klasifikacija u publikaciji Eparhije zvorničko-tuzlanske.
Svako članstvo ostaje pending. Izbor u tabeli je hronološki; nije teološki rang.

| Građanski datum | Sačuvani naziv / transliteracija | Kanonski observance ID | Redovi | Dokaz uključenja |
|---|---|---|---|---|
| 2026-01-07 | Rođenje Hristovo — Božić | `obs-nativity-christ` | novi | M + ZT |
| 2026-01-19 | Bogojavljenje — Krštenje Gospodnje | `obs-theophany` | novi | M + ZT |
| 2026-01-20 | Sabor Sv. Jovana Krstitelja | `obs-john-baptist-synaxis` | postojeći | M |
| 2026-01-27 | Sveti Sava Srpski | `obs-sava-serbian` | postojeći | M |
| 2026-02-15 | Sretenje Gospodnje | `obs-presentation-lord` | novi | M + ZT |
| 2026-04-05 | Cveti (Ulazak Gospodnji u Jerusalim) | `obs-entry-jerusalem` | novi | M + ZT |
| 2026-04-07 | Blagovesti | `obs-annunciation` | novi | M + ZT |
| 2026-04-12 | Vaskrs — Vaskrsenje Hristovo | `obs-resurrection-christ` | novi | M + ZT |
| 2026-05-06 | Sveti velikomučenik Georgije – Đurđevdan | `obs-george` | postojeći | M |
| 2026-05-21 | Spasovdan (Vaznesenje Gospodnje) | `obs-ascension-lord` | novi | M + ZT |
| 2026-05-31 | Duhovi (Pedesetnica — Sv. Trojica) | `obs-pentecost` | novi | M + ZT |
| 2026-07-12 | Sveti apostoli Petar i Pavle – Petrovdan | `obs-apostles-peter-paul` | postojeći | M |
| 2026-08-19 | Preobraženje Gospodnje | `obs-transfiguration-lord` | novi | M + ZT |
| 2026-08-28 | Uspenije Presvete Bogorodice – Velika Gospojina | `obs-dormition-theotokos` | novi | M + ZT |
| 2026-09-21 | Rođenje Presvete Bogorodice – Mala Gospojina | `obs-nativity-theotokos` | postojeći | M + ZT |
| 2026-09-27 | Vozdviženje časnog Krsta – Krstovdan | `obs-exaltation-cross` | novi | M + ZT |
| 2026-10-27 | Prepodobna mati Paraskeva (Sveta Petka) | `obs-paraskeva` | postojeći | M |
| 2026-11-08 | Sveti velikomučenik Dimitrije – Mitrovdan | `obs-demetrius` | postojeći | M |
| 2026-11-21 | Sabor Svetog Arhangela Mihaila i ostalih Nebeskih Sila Bestelesnih – Aranđelovdan | `obs-michael-synaxis` | postojeći | M |
| 2026-12-04 | Vavedenje Presvete Bogorodice | `obs-entry-theotokos` | novi | M + ZT |
| 2026-12-19 | Sveti Nikolaj, Arhiepiskop mirlikijski Čudotvorac – Nikoljdan | `obs-nicholas-december` | postojeći | M |

Novi occurrence ID-jevi imaju oblik `occ-` + tačan observance ID +
`-2026`. Za sve postojeće redove u JSON-u je naveden njihov već usvojeni ID.
Svaka nova pojava čuva tačan `calendar_title`, `julian_date` i
`calendar_source_ids` iz odgovarajućeg K2026 reda. Nije primenjena
aritmetika julijanskog pomeranja ili algoritam za Vaskrs. Latinični novi
nazivi su deterministička srpska transliteracija.

## Primarni kalendarski izvori

Izdavač svih M redova je **Eparhija austrijska SPC**, isti primarni izdavač
koji je već vezan godišnjim K2026 modulom. Naslov izvora je „Епархија аустријска
СПЦ — календар“; u tabeli je tačno mesečno zaglavlje. Sve stranice su ponovo
uspešno preuzete direktnim HTTPS zahtevom i proverene **27.09.2026**.
Kolona podrške znači: tačan građanski datum 2026 / eksplicitno važno članstvo.

| Kanonski source ID | Izvor i zaglavlje | Provereni izabrani datumi | Datum / uključenje |
|---|---|---|---|
| `eparhija-month-01` | [ЈАНУАР 2026.](https://www.eparhija.at/kalendar?m=2026-1) | 2026-01-07, 2026-01-19, 2026-01-20, 2026-01-27 | da / da |
| `eparhija-month-02` | [ФЕБРУАР 2026.](https://www.eparhija.at/kalendar?m=2026-2) | 2026-02-15 | da / da |
| `eparhija-month-04` | [АПРИЛ 2026.](https://www.eparhija.at/kalendar?m=2026-4) | 2026-04-05, 2026-04-07, 2026-04-12 | da / da |
| `eparhija-month-05` | [МАЈ 2026.](https://www.eparhija.at/kalendar?m=2026-5) | 2026-05-06, 2026-05-21, 2026-05-31 | da / da |
| `eparhija-month-07` | [ЈУЛ 2026.](https://www.eparhija.at/kalendar?m=2026-7) | 2026-07-12 | da / da |
| `eparhija-month-08` | [АВГУСТ 2026.](https://www.eparhija.at/kalendar?m=2026-8) | 2026-08-19, 2026-08-28 | da / da |
| `eparhija-month-09` | [СЕПТЕМБАР 2026.](https://www.eparhija.at/kalendar?m=2026-9) | 2026-09-21, 2026-09-27 | da / da |
| `eparhija-month-10` | [ОКТОБАР 2026.](https://www.eparhija.at/kalendar?m=2026-10) | 2026-10-27 | da / da |
| `eparhija-month-11` | [НОВЕМБАР 2026.](https://www.eparhija.at/kalendar?m=2026-11) | 2026-11-08, 2026-11-21 | da / da |
| `eparhija-month-12` | [ДЕЦЕМБАР 2026.](https://www.eparhija.at/kalendar?m=2026-12) | 2026-12-04, 2026-12-19 | da / da |

Za svih **21/21** datuma naziv u sveže preuzetom mesečnom redu identičan je
nepromenljivom K2026 naslovu, a izdavač uz isti red ima eksplicitnu oznaku
velikog praznika. Zaglavlje određuje mesec i godinu, a red tačan građanski dan.
Za svih **10/10** korišćenih meseci ponovo je potvrđen SHA-256 prethodno
sačuvanog činjeničnog evidence JSON-a prema K2026. Novi response hash-evi,
veličine, stari evidence hash-evi i locator-i nalaze se u `source_checks`.

Ovo je eksplicitna provera izabranih redova, ne provera svih 365 dana, svih
svetitelja, čitanja ili posta. Naslovi na zasebnim stranicama čitanja koji su
u annual payload-u ranije označeni kao nerešeni ostaju nerešeni.

## Poseban dokaz za Vaskrs i dvanaest velikih praznika

[Pravoslavni osnovac, broj 12 — Dvanaest velikih praznika](https://www.eparhijazt.com/UcitaneSlike/pravoslavni-osnovac-broj-12_compressed.pdf),
**PDF strana 10**, izričito nabraja svih dvanaest spomena i izdvaja Vaskrs
kao najveći praznik. Autor je **Matej Goranović**. Masthead na PDF strani 3
navodi izdavača **Izdavačka kuća Eparhije zvorničko-tuzlanske Sinaj**.
Provera teksta i vizuelna provera relevantne strane obavljene su 27.09.2026.
PDF SHA-256: `53fc16fcb714c8521fa67cbeb098862baedad0ed7e5dead3310d474919a29daa`.

Ovaj izvor podržava **klasifikaciju/urednički izbor**, ali **ne daje datume
2026**. Godišnje datume daje odgovarajući M izvor. To je crkvena publikacija
sa uredništvom; njeno korišćenje ne znači da je izdavač odobrio aplikaciju ili
dao licencu za preuzimanje teksta/slika. Članak i ilustracija se ne prenose.

Za pokretne praznike je dodatno pročitan indeksirani primarni sadržaj:

| Izvor | Tačan datum koji telo izvora podržava | Granica |
|---|---|---|
| [SPC — Sve što činimo i jesmo proveravajmo Hristom](https://www.spc.rs/sr/news/patrijarh/-/16277.sve-sto-cinimo-i-jesmo-proveravajmo-hristom.html) | Cveti, 05.04.2026. | Uvod datira besedu; nije dodatni wire source u ovom predlogu. |
| [SPC — Vaskrs u Banja Luci](https://spc.rs/sr/news/16430.vaskrs-u-banja-luci.html) | Vaskrs, 12.04.2026. | Datum objave 20.04. nije uzet kao praznični datum. |
| [SPC — Vladika Petar: Beograd je sveti grad](https://www.spc.rs/sr/news/16718.vladika-petar-beograd-je-sveti-grad.html) | Spasovdan, 21.05.2026. | Telo datira proslavu; nije osnova računanja drugih datuma. |
| [SPC — Vladika Andrej: Pedesetnica je neprestana stvarnost Crkve](https://www.spc.rs/sr/news/iz-zivota-crkve/-/16832.vladika-andrej-pedesetnica-je-neprestana-stvarnost-crkve.html) | Pedesetnica, 31.05.2026. | Telo izričito daje datum i naziva ga velikim praznikom. |

## Pristup izvorima i otvorene granice

Alat za web čitanje nije mogao direktno da otvori više mesečnih i dnevnih
URL-ova; nije im pripisan uspešan direktan web rezultat. Direktno HTTPS
preuzimanje svih deset potrebnih mesečnih stranica je potom uspelo.
Septembarska mesečna stranica je bila čitljiva i kroz web alat.
PDF je bio veći od granice web alata; direktno preuzimanje je uspelo
(13.259.125 bajtova), posle čega je strana 10 renderovana i vizuelno proverena.
Dopunske SPC vesti gore označene su kao indeksirani sadržaj, ne kao nove
sačuvane godišnje evidencije.

Simeon Mirotočivi, Miholjdan, prenos moštiju Nikolaja i Čudo u Honi ostaju u
katalogu sa postojećim podacima, ali izvan ovog ograničenog izbora. Za
Nektarija i Stefana Dečanskog ne uvodi se godišnja pojava, jer ovaj posao ne
rešava ranije utvrđenu prazninu u godišnjem povezivanju. Odsustvo bilo kog
drugog praznika iz izbora nije tvrdnja da praznik ne postoji ili da nije važan.

Nisu menjani annual payload, katalog S9, članci, lične slave, legacy veze,
manifesti, potpisi, indeksi ili javna objava. Nisu preuzimani novi religijski
tekstovi u sadržaj aplikacije. Za kasniji kandidat potrebna je provera
konkretnog spajanja, source statusa i tačnih binding hash-eva; ovaj draft se
ne sme označiti odobrenim prostom zamenom svih pending vrednosti.

## Tehnička provera predloga

Provereni su jedinstveni novi ID-jevi, nepostojanje kolizija sa S9,
21 članstvo sa tačno jednom pojavom, tačno podudaranje novih occurrence
redova sa K2026, očuvanje oba article link-a i konzistentan predloženi
obuhvat 25 datuma/pojava. Nova source/observance/occurrence polja prate
postojeću zatvorenu liturgical-catalog-v1 šemu. Root spaja i proverava
celokupan kandidat i njegov kontekst; ovaj JSON je proposal envelope,
ne direktno prenosivi wire payload.
