# I2 — pregled izvora, identiteta i kalendarskih veza

Datum provere: **20.09.2026.** Status: **izvorni audit i predlog metapodataka**.
Ovo nije novo žitije, odobrenje nove revizije za distribuciju, crkvena recenzija,
zamrznuta wire šema niti izmena postojećeg kalendara. Stabilne tehničke ID-jeve,
capability i konačni format zajedničkog kataloga zaključava koordinacija I2.

## 1. Tačni ulazi i granica zaključka

- Kanonska pravila: `../svetlost33-github/docs/SPECIFIKACIJA.md`, TR-03 i
  TR-08; `../svetlost33-github/docs/PLAN-IMPLEMENTACIJE-SPEC-v0.27.md`, §6.
  Na kraju čitanja HEAD je `36ea3d8d8604f25023e667aa3590d3a39d65a3b4`;
  SHA-256 specifikacije je
  `5433a90ad0dd8c81d6dc817009fd09f4690f4aed83a8e1b20b2841fd2e89b695`,
  a plana `35627dc90461603cde32c46c1bd8fb75ac430f452870c0adcf6a373416f600f3`.
  Pročitani su i `../svetlost33-ios/AGENTS.md` i relevantni native izvori.
- Urednički master: ovaj repozitorijum `swanem/svetlost33-content`.
  Zatečeni HEAD pri početku audita:
  `88db2b8146947e8cf08962a73a82e7f2c0b729e6`.
- Tačan kalendarski ulaz **K2026**:
  `releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/calendar-2026-r1-2026.1.1-r2/data/calendar.2026.json`.
  SHA-256 **`a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`**,
  1.665.524 bajta. Susedni `manifest.json` navodi isti hash i veličinu,
  `module_id=calendar-2026-r1`, `version=2026.1.1`, `revision=2`.
  Provera manifesta/hash-a ovde nije nova kriptografska verifikacija potpisa.
- Kalendarski profil za predložene veze: SPC, julijanski crkveni datumi i
  gregorijanski građanski datumi, početni opseg RS/BA. Tačan `calendar_profile_id`
  ostaje odluka ugovora; ne izvodi se iz lokacije uređaja.

K2026 čuva istorijske vrednosti `review_state=DRAFT`,
`activation_status=NOT_ACTIVE`, `human_or_clergy_review=null` i srodne zastavice.
One opisuju poreklo payload-a; **nisu dokaz da kasniji paket nema owner odobrenje**.
Pročitani su `approvals/shared-annual-2026-r1-2026-09-15.json`, prethodno iOS
odobrenje i tačan
`releases/v2/production/releases/shared-annual-2026-r1-m0v2-s2/modules/library-annual-2026-r1-2026.1.1-r2/data/release-scope.json`.
Taj scope izričito odvaja očuvane istorijske zastavice od zajedničkog odobrenja
nepromenljive revizije za Android/iOS. Odobrenje postojeće revizije ne popunjava
nedostajuće svetitelje, ne znači potpun Tipik i ne odobrava nove I2 tvrdnje.

## 2. Ponovna provera lokalnog porekla

Podaci nisu preuzeti iz starog sažetka audita. Ponovo je parsiran tačan K2026,
a svih 12 njegovih `eparhija-month-*` izvora upoređeno je sa fajlovima
`../svetlost33-github/docs/content-review/2026-09-15-calendar/evidence/eparhija-month-XX.json`.

- **12/12 SHA-256** sačuvanih činjeničnih izvoda odgovara
  `sources[].evidence_sha256` u K2026.
- **365/365** parova `title_cyrl` / `subtitle_cyrl` odgovara tim izvodima.
- Izvodi su preuzeti **15.09.2026**, prema `sources[].fetched_at`.
  URL obrasca izvora je `https://www.eparhija.at/kalendar?m=2026-M`.
  Ispod oznaka **M01**, na primer, znači postojeći source ID
  `eparhija-month-01`, njegov januarski URL i hash-verifikovani izvod.
- Današnji pokušaji ponovnog otvaranja mesečnih izvora za oktobar/novembar i
  dnevnih stranica za 12.10, 19.09, 22.11. i 24.11. nisu dali čitljiv odgovor.
  Nije potvrđeno da se njihov živi sadržaj od 15.09. nije promenio.
  [Dnevna stranica za 21.09.2026](https://kalendar.eparhija.at/2026/9/21)
  jeste bila čitljiva i prikazuje Malu Gospojinu i stari datum 8. septembar.

Aktuelni brojevi iz tačnog K2026: 365 datumskih zapisa; 365 naziva sa
`SOURCE_RECORDED`; **0** potvrđenih potpunih spiskova svetitelja;
243 zapisa sa `title_review=publisher_page_titles_differ_not_resolved`;
173 dana sa evidentiranim jevanđeljskim referencama, 192 `UNRESOLVED`;
91 dan sa nepoznatim detaljnim pravilom posta. I2 ne rešava te neizvesnosti
pretragom naziva i ne pretvara prazno/nepoznato u potvrđeno odsustvo.

## 3. Deset stvarno ponuđenih legacy slava

Android: `../svetlost33-github/app/src/main/java/app/svetlost33/data/BackgroundCatalog.kt`
ima deset stavki sa `saintLatn`; `ui/SettingsScreen.kt` bira upravo njih
(`BackgroundCatalog.items.filter { it.saintLatn != null }`).
`SettingsRepository.kt` čuva `slava_id` i normalizuje ga prema tom katalogu.

iOS: `../svetlost33-ios/Sources/SvetlostCore/BackgroundCatalog.swift` učitava
`Sources/SvetlostCore/Resources/backgrounds/catalog-v1.json`;
`Svetlost33App/SettingsView.swift`, `slavaEditor`, bira stavke sa
`captionLatn != nil`. Ponovo pročitan JSON daje istih deset ID-jeva, naziva i
`feastMonthDay` vrednosti. `AppSettings.swift` postojeći izbor takođe proverava
prema katalogu. Ovo je inventar sadašnjeg ponašanja, ne nova politika migracije.

| Postojeći `slavaId` / `slavaID` | Sačuvani naziv motiva | Legacy `feastMonthDay` | Predloženi konkretni spomen |
|---|---|---|---|
| `sveta-petka` | Света Петка | 10-27 | Преподобна мати Параскева |
| `sveti-sava` | Свети Сава | 01-27 | Свети Сава, први архиепископ српски |
| `sveti-nikola` | Свети Никола | 12-19 | Децембарски спомен Николаја Мирликијског |
| `sveti-jovan` | Свети Јован Крститељ | 01-20 | Сабор Светог Јована Крститеља |
| `sveti-georgije` | Свети Георгије | 05-06 | Свети Георгије — Ђурђевдан |
| `sveti-dimitrije` | Свети Димитрије | 11-08 | Свети Димитрије — Митровдан |
| `arhangel-mihailo` | Свети архангел Михаило | 11-21 | Сабор Архангела Михаила и осталих Небеских Сила — Аранђеловдан |
| `sveti-stefan-decanski` | Свети Стефан Дечански | 11-24 | Свети краљ Стефан Дечански; годишња веза unresolved |
| `sveti-simeon` | Свети Симеон Мироточиви | 02-26 | Преподобни Симеон Мироточиви |
| `sveti-nektarije` | Свети Нектарије Егински | 11-22 | Свети Нектарије Егински; годишња веза unresolved |

Kolona `feastMonthDay` je **dokaz sadržaja legacy postavke, ne autoritet za
novu godišnju pojavu**. Dva ista mesec/dan podatka ne dokazuju isti identitet.
Nepoznati lični ID-jevi nisu pokriveni ovom tabelom i ne smeju se pogađati.

Hashes pregledanih native ulaza:

| Ulaz | SHA-256 |
|---|---|
| Android `BackgroundCatalog.kt` | `895cddce49220001c545dd8763fa69693b62dcdea4b25104bbf205592b0ba8c4` |
| Android `ui/SettingsScreen.kt` | `95cdce23366f7472a1c7d1afc4ff7f03524615e18c71091f1ef5c4c7da72b9c8` |
| Android `SettingsRepository.kt` | `37bc02c2aa43857882934210f3809f5cfe025fbe82bc6c8fca1ffa0b89c3f182` |
| iOS `backgrounds/catalog-v1.json` | `71cfa56ea28f6bb33d585bebe4ec7fb52f40995825e916c5135c7eaa1880e1da` |
| iOS `BackgroundCatalog.swift` | `f47e6aa659998d51a3dfcb1fe94ae64c367482c3884a8e2a91a7034158ac99d7` |
| iOS `AppSettings.swift` | `6c7c5179acd502b7265fd75e1c3528b46ffc081d77fd31d2fca7b26878ce400a` |
| iOS `SettingsView.swift` | `00d16cf63ddba98977d0e323ae5974d3cf8e7b8615200a6af2e3b215a23e1684` |

## 4. Tačni godišnji zapisi za mali I2 skup

Svaki locator ispod znači `K2026.days` sa tačnom vrednošću `date`;
`julian_date` je prepisan iz zapisa, nije izračunat dodavanjem/oduzimanjem 13.
Svi redovi imaju `commemoration.status=SOURCE_RECORDED` i
`complete_saint_list_verified=false`.

| Locator: građanski datum | `julian_date` | Tačan `commemoration.title_cyrl` | Izvor |
|---|---|---|---|
| 2026-01-20 | 2026-01-07 | Сабор Св. Јована Крститеља | M01 |
| 2026-01-27 | 2026-01-14 | Свети Сава Српски | M01 |
| 2026-02-26 | 2026-02-13 | Преподобни Симеон Мироточиви | M02 |
| 2026-05-06 | 2026-04-23 | Свети великомученик Георгије – Ђурђевдан | M05 |
| 2026-05-22 | 2026-05-09 | Пренос моштију Светог оца Николаја | M05 |
| 2026-07-12 | 2026-06-29 | Свети апостоли Петар и Павле – Петровдан | M07 |
| 2026-09-19 | 2026-09-06 | Чудо Светог Архангела Михаила | M09 |
| 2026-09-21 | 2026-09-08 | Рођење Пресвете Богородице – Мала Госпојина | M09 |
| 2026-10-12 | 2026-09-29 | Преподобни Киријак Отшелник – Михољдан | M10 |
| 2026-10-27 | 2026-10-14 | Преподобна мати Параскева (Света Петка) | M10 |
| 2026-11-08 | 2026-10-26 | Свети великомученик Димитрије – Митровдан | M11 |
| 2026-11-21 | 2026-11-08 | Сабор Светог Архангела Михаила и осталих Небеских Сила Бестелесних – Аранђеловдан | M11 |
| 2026-11-22 | 2026-11-09 | Свети мученици Онисифор и Порфирије | M11 |
| 2026-11-24 | 2026-11-11 | Свети великомученик Мина | M11 |
| 2026-12-19 | 2026-12-06 | Свети Николај, Архиепископ мирликијски Чудотворац – Никољдан | M12 |

Januarski zapisi imaju i podnaslove: 20.01. „Сабор Светог Јована Крститеља и
Претече“, 27.01. „Свети Сава, први архиепископ и просветитељ српски“.
Od navedenih redova, svi počev od maja imaju sačuvanu razliku prema stranici
čitanja (`reading_page_title_cyrl=—`, `title_review` unresolved); ta oznaka
nije uklonjena ovim pregledom.

Za **13 spomena** iz malog skupa postoji semantički odgovarajući naslov u
K2026. Za **Nektarija i Stefana Dečanskog ne postoji takva veza u navedenim
redovima**. Izostanak iz nepotpune liste nije potvrđeno odsustvo spomena.
Za prvi kandidat njihove identitete i legacy mapu treba sačuvati, a godišnju
pojavu ostaviti unresolved/bez potvrđenog datuma. Ne povezivati Nektarija sa
Onisiforom/Porfirijem niti Stefana sa Minom; ne menjati postojeće naslove.

## 5. Predloženi identiteti, alias-i i razdvajanje rezultata

Ovo su semantički ključevi za dogovor, **ne već usvojeni wire ID-jevi**.
Svaki alias nosi `sr-Cyrl` ili `sr-Latn`, izvor i tačno vezani subjekt/spomen.
Ćirilični nazivi iz K2026 ostaju izvorni; latinični oblici ispod su
deterministička transliteracija. Lowercase i oblici bez dijakritike su
pretraživačka normalizacija, ne izmišljena istorijska imena.

| Subjekt | Odvojeni spomeni | Predlog pretraživih naziva i ponašanja | Dokaz |
|---|---|---|---|
| Saint: Киријак Отшелник | Spomen Kirijaka / Miholjdan | Киријак / Kirijak; Преподобни Киријак Отшелник / Prepodobni Kirijak Otšelnik; Михољдан / Miholjdan vode do istog spomena u ovom skupu | K2026 12.10, M10; W1 |
| Saint: Николај Мирликијски | Decembarski spomen; prenos moštiju u maju | Свети Никола / Sveti Nikola; Свети Николај / Sveti Nikolaj vraćaju oba spomena sa različitim opisom i potvrđenim datumom; Никољдан / Nikoljdan vezati za decembarski spomen; Пренос моштију / Prenos moštiju kvalifikovati imenom | K2026 22.05 i 19.12; W2, W3 |
| Saint: Архангел Михаило | Sabornost u novembru; Čudo u Honi u septembru | Архангел Михаило / Arhangel Mihailo vraća oba; Аранђеловдан / Aranđelovdan vezati za novembarski sabor; Чудо у Хони / Čudo u Honi za septembarski događaj | K2026 19.09 i 21.11; W4, W5 |
| Group: Свети апостоли Петар и Павле | Njihov zajednički spomen / Petrovdan | Петар и Павле / Petar i Pavle; Свети апостоли Петар и Павле / Sveti apostoli Petar i Pavle; Петровдан / Petrovdan | K2026 12.07; W6 |
| Observance: Рођење Пресвете Богородице | Rođenje Bogorodice / Mala Gospojina | Рођење Пресвете Богородице / Rođenje Presvete Bogorodice; Мала Госпојина / Mala Gospojina | K2026 21.09; W7 |

Arhangel Mihailo nije druga osoba zbog drugog spomena; tehnički tip `saint`
u ovom modelu obuhvata taj identitet, bez tvrdnje da je anđeo čovek. Novembarski
sabor obuhvata i ostale nebeske sile; ne svoditi sačuvani naziv na ime motiva.
Miholjdan se ne vezuje za Arhangela Mihaila zbog zvučne sličnosti.

Za preostalih osam legacy subjekata predložiti pune nazive iz tabele 3 i
odgovarajućeg K2026 zapisa, uz oba pisma: Параскева/Петка,
Сава Српски, Јован Крститељ/Претеча, Георгије/Ђурђевдан,
Димитрије/Митровдан, Стефан Дечански, Симеон Мироточиви и Нектарије Егински.
Tačni kratki native natpisi ostaju dokaz postojećih korisničkih izbora.
Ne proglašavati neodređena lična imena („Јован“, „Стефан“, „Никола“)
globalno jedinstvenim. Novi širi registar može vratiti dodatne identitete;
alias se ne koristi kao automatska migraciona odluka.

Jedan Group zapis za Petra i Pavla ne zahteva automatsko rastavljanje članka.
Mala Gospojina je praznik/događaj, ne dodatna osoba i ne novi tekst Bogorodičinog
žitija. Postojeći `SaintsArticle.id` zadržava značenje ID-ja teksta; ovaj audit
ne dodeljuje niti prepisuje veze ka člancima.

## 6. Primarni crkveni web izvori pregledani 20.09.2026.

Sadržaj izvora služi samo proveri imena, veze i datuma. Nisu preuzimani
čitavi tekstovi, himne, fotografije, zvuk niti nova žitija. Nisu utvrđene nove
licence ili nepoznati autori/prevodioci. Za faktografski ulaz beleži se ustanova
koja objavljuje izvor; to ne znači da je ona dala novo odobrenje aplikaciji.

| Oznaka | Izvor i šta podržava | Granica upotrebe |
|---|---|---|
| W1 | [SPC, Преподобни Киријак Отшелник](https://spc.rs/sr/news/11852.prepodobni-kirijak-otselnik.html) i [SPC, Митрополит Јоаникије богослужио у Брскуту](https://spc.rs/sr/news/4777.mitropolit-joanikije-bogosluzio-u-brskutu.html): identitet pustinjaka i veza sa miholjskim nazivom; tačna 2026 pojava i alias Miholjdan stoje u M10/K2026 | Pregledan indeksirani sadržaj; datum objave biografije nije uzet kao datum pojave |
| W2 | [SPC, Пренос моштију у Никољцу](https://spc.rs/sr/news/2598.praznik-prenosa-mostiju-svetog-nikolaja-u-nikoljcu.html): telo vesti izričito povezuje prenos moštiju Nikolaja Mirlikijskog sa 22.05.2021. | Vest objavljena 23.05.2021; godišnju vezu za 2026 daje M05/K2026 |
| W3 | [SPC, Празник Светог Николаја у Новом Саду](https://www.spc.rs/sr/news/iz-zivota-crkve/12225.praznik-svetog-nikolaja-u-novom-sadu.html): telo navodi spomen Nikolaja Mirlikijskog 19.12.2024. | Objavljeno 20.12.2024; ne koristiti datum objave; 2026 datum je M12/K2026 |
| W4 | [Eparhija šumadijska, Чудо Светог Архангела Михаила у Хони](https://www.eparhija-sumadijska.org.rs/index.php/vesti/11139-blagovestenje-19092026): telo navodi proslavu 19.09.2026, Hona/Kolosa | Indeksirani primarni sadržaj pročitan; direktno ponovno otvaranje nije uspelo; pojava već postoji u M09/K2026 |
| W5 | [SPC, Аранђеловдан у Епархији врањској](https://spc.rs/sr/news/5493.arandelovdan-u-eparhiji-vranjskoj.html): puno ime sabora, alias Aranđelovdan i događaj 21.11.2021. | Objavljeno 26.11.2021; 2026 datum je M11/K2026 |
| W6 | [SPC, Права вера није лични ударнички подвиг, него је вера Цркве](https://www.spc.rs/sr/news/patrijarh/17190.prava-vera-nije-licni-udarnicki-podvig%2C-nego-je-vera-crkve-.html): telo navodi zajednički praznik apostola Petra i Pavla 12.07.2026. | Potvrđuje grupu i događaj; ne razdvaja jedan članak u dva |
| W7 | [Eparhija austrijska, dnevni kalendar 21.09.2026](https://kalendar.eparhija.at/2026/9/21): naziv Rođenja Bogorodice/Mala Gospojina, građanski i stari datum | Stranica otvorena; ne zaključivati potpunost svih spomena dana |
| W8 | [Radio Glas Eparhije niške, Свети Нектарије Егински](https://radioglas.rs/Newsview.asp?ID=2367): telo izričito navodi 22. novembar / 9. novembar julijanski | Stranica otvorena; opšti spomen je podržan, ali K2026 nema izričitu vezu ka Nektariju |
| W9 | [SPC, Свети краљ Стефан Дечански — крсна слава епископа Јеротеја](https://www.spc.rs/sr/news/iz-zivota-crkve/-/12109.sveti-kralj-stefan-decanski-%E2%80%93-krsna-slava-episkopa-jeroteja.html): telo izričito navodi njegov spomen 24.11.2024. | Objavljeno 26.11.2024; podrška budućoj eksplicitnoj vezi, ne postojeća potvrđena K2026 pojava |

**Uočeni sukob, ne preuzet datum:**
[SPC vest o Davidovici](https://spc.rs/sr/news/iz-zivota-crkve/-/14958.ktitorska-slava-manastira-davidovice.html)
u indeksiranom telu vezuje Kirijaka/Miholjdan za „13. октобра 2025“ i nedelju,
dok K2026/M10 beleži 12.10.2026 / 29.09. Ta vest nije upotrebljena kao
autoritet za kalendarski datum; neslaganje se beleži umesto tihog prepisivanja.
Nije obavljen kontakt sa izdavačem niti je izmišljena ispravka.

## 7. Otvoren registar šire pokrivenosti i odobrenja

| Oblast | Dokazano sada | Otvoreno / sledeći urednički uslov |
|---|---|---|
| Mali I2 skup | 10 legacy izbora, Miholjdan, dva Nikola spomena, dva Mihailo spomena, jedna grupa i jedan praznik: 15 predloženih spomena, 13 odgovarajućih K2026 veza | Zaključavanje zajedničkih ID-jeva/ugovora i pregled tačne nove revizije; ne predstavljati ovaj MD kao owner potpis |
| Nektarije / Stefan Dečanski | Native izbori i dopunski primarni izvori W8/W9; nepotpuni K2026 redovi prikazuju druge svetitelje | Godišnja veza unresolved u prvom kandidatu; budući izričit godišnji izvor i pregledana dopuna bez preimenovanja postojećeg dana |
| Cela 2026 — svetitelji | 365 evidentiranih glavnih naziva; svi lokalni mesečni evidence hash-evi podudarni | Potpunost spiskova nije potvrđena; ne širiti 13 veza na ostatak godine po sličnosti naziva |
| Cela 2026 — čitanja/post | 173 evidentirana / 192 nerešena jevanđeljska dana; 91 nepoznato detaljno pravilo posta | Poseban godišnji i službeni pregled; pretraga svetitelja ne odobrava čitanja/post |
| 2027 — spomeni i članci | U pregledanim annual putanjama nema zasebnog godišnjeg registra svetiteljskih pojava za 2027 | Novi izvori i zasebne veze prema istim stabilnim subjektima; bez kopiranja 2026 datuma/čitanja i bez UI računanja Vaskrsa |
| Januar 2027 — postojeći fallback | `../svetlost33-github/app/src/main/assets/calendar/calendar-v1.json`, verzija `2026.2`, sadrži 31 januarski datum **posta** unutar opsega 01.09.2026–31.01.2027 | Ti redovi nemaju saint/observance veze; nisu pun godišnji katalog 2027 niti dokaz da je slava za januar povezana |
| Granica 31.12 / 01.01 | K2026 se završava 31.12.2026 | T−1 za slavsku pojavu 2027 ostaje unknown dok ne postoji potvrđena pojava u verifikovanoj generaciji |
| Odobrenja | Postojeći annual owner approval i signed-scope evidencija identifikovani po tačnim putanjama | Nema novog odobrenja I2 datuma, prava, objave, crkvene recenzije ili novih tekstova u ovom auditu |

Promena godišnjeg kalendara zahteva novu pregledanu reviziju i usklađivanje
svih exact binding veza. Ovaj dokument ne proširuje `saints-v1`, ne menja
native kod, lične izbore, motive, potpise ili publikacije. Izvori su urednički
ulaz; ne predlaže se runtime scraping.

## 8. Izvršena provera ovog dokumenta

Read-only provera obuhvatila je parsiranje tačnog K2026, poređenje 12 evidence
hash-eva i svih 365 naziva/podnaslova, inventar oba native pickera i proveru
primarnih web izvora opisanu iznad. Svih **15 redova tabele 4** mašinski je
upoređeno sa K2026: građanski datum, `julian_date` i tačan naslov, **0 razlika**.
Nisu pokretani buildovi, aplikacije,
potpisivanje, objava, push niti slanje poruka spoljnim ustanovama. Jedina
izmena ovog podzadatka je ovaj novi Markdown dokument.
