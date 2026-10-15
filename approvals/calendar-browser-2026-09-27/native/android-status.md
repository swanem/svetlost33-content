# Status implementacije v0.28 — Android

Datum provere: 27.09.2026.

Autoritet zahteva je `SPECIFIKACIJA.md` KB-01–KB-08, SHA-256
`6e17326e0373c1f959d0b11461fd8e060922688d9828bfa017f275d01b7c4f2a`.
Plan ima SHA-256
`955147437a64343259e73415d6c38256fccc235a6dd94666f1c1e51e980035b5`.

## Implementirano u kodu

- `calendar-browser-v1` je podržan kao opcioni M0 `library` modul. Transport,
  manifest, capability, payload, UTF-8, veličina, verzija/revizija i zatvorena
  šema proveravaju se pre aktivacije. Odsutan, neispravan ili nepodržan opcioni
  modul ne menja postojeći M0 sadržaj.
- Parser i resolver sprovode tačne generation, catalog, library i cycles
  binding-e. Nema latest-weekday ili latest-library zamene. ISO datum mora
  odgovarati cycle-day zapisu.
- Arhiva razlikuje unavailable, uncovered, withdrawn, corrected,
  content-unavailable i phase-unavailable. Ispravka je vidljivo označena i kad
  telo nije dostupno. Trenutni autentifikovani withdrawal nadjačava ranije
  otvorenu kopiju.
- Arhivska ruta pin-uje generaciju, datum, slot i verziju. Nepotpuna ili
  izmenjena `archive=true` ruta se zatvara kao nedostupna i ne pada na aktuelni
  sadržaj. Reader se ponovo proverava po promeni generacije. Automatska ponuda
  podešavanja u arhivskom readeru je isključena. Direktna, duboka ili obnovljena
  arhivska ruta dodatno zahteva datum strogo pre stvarnog lokalnog dana, pa
  unapred objavljen raspored ne može da otkrije današnje ili buduće telo.
- Reader keš je odbrambeno vezan za celu rutu. Arhivsko čitanje ne prikazuje
  niti izvršava izmenu omiljenih, pa preference ostaju nepromenjene. Opcionom
  browser modulu se prihvata samo revision čiji `packageId` pripada istoj
  generaciji; zadržani stari optional modul ne može dobiti novi generation ID.
- Danas ima mali ulaz u Kalendar i mirnu najavu samo za najraniju potvrđenu
  grupu D+1…D+7. D0 nije ponovljen, D+1 je „Sutra”, D+8 nije najava. Red unutar
  istog datuma prati urednički redosled, a `Još N` vodi u grupni detalj svih
  potvrđenih stavki.
- Resolver praznika zahteva da profil stvarno postoji u katalogu. Prazan rezultat
  u potvrđenoj ograničenoj godini ostaje „nema poznatog događaja”, dok se buduća
  godina van objavljene pokrivenosti prikazuje kao nedostupna bez zaključivanja.
- Kalendar je izdvojen ekran, ne četvrti glavni tab. Ima Praznici i Izaberi
  dan, mesečne grupe, ograničenje pokrivenosti, 48dp datumske mete u
  horizontalno dostupnoj mreži i čitljiva selected/today/future stanja.
- Današnji građanski datum vraća pravi živi DC-01 kontekst, uključujući
  prethodno Veče pre jutarnje granice. Budući datum ne nudi arhivu. Novi prošli
  datum počinje Jutrom. Povratak iz readera čuva datum i period; „Na aktuelno
  čitanje” vraća živi selektor.
- Glavni tabovi, vidžeti, pozadina, post, slava, podešavanja, telemetrija i 7×3
  ciklus nisu menjani ovim zahvatom.

## Zamrznuti zajednički core

Android test-only kopija `cases.json` ima isti SHA-256 kao zamrznuti fixture:

- contract: `6bc966e1462c99a00908702d860e1fb8d629c4764d1a864f7c9f4de5f6071861`
- schema: `f9ac5beb4f96c7fc4ba85e84b6b8a85c78d09a6e10128c6eadac1ef7f5f1ce89`
- 102-case fixture: `10a0fa132a6062280cd253d4911c618419143218d949545d58dbc7600cf6b7ad`
- validator: `072b23f4e7b2a876580ae68ef0b0229552b2c1779d6ac1a8d62feca1e72b5e42`

Fixture ostaje samo u `src/test/resources`; nije deo main/release assets.
`CalendarBrowserSharedContractTest` primenjuje zajedničke setup/case mutacije i
poredi kompletne expected objekte za svih 102 slučaja. Posebni production
bridge testovi pokrivaju stvarne typed adaptere: feast/catalog reference,
before-start, phase gap, missing body, withdrawal bez faza, tačnu biblioteku,
OTA pin i povlačenje.

## Izvršene provere

1. `env PATH="/opt/homebrew/bin:$PATH" bash scripts/build.sh :app:testDebugUnitTest :app:assembleDebug --no-daemon`
   — PASS; 378 testova, 0 failures, 0 errors, 0 skipped; APK build PASS.
2. `env PATH="/opt/homebrew/bin:$PATH" bash scripts/build.sh :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=app.svetlost33.ui.CalendarBrowserScreenTest,app.svetlost33.ui.CalendarBrowserEvidenceTest --no-daemon`
   — PASS; 6/6 na `Svetlost33_API35`, Android 15. Pokriva odsutan modul,
   zabranjen budući datum i pozitivan test-only tok Kalendar → prošli datum →
   period → reader → nazad sa sačuvanim kontekstom → aktuelno, promenu postojeće
   reader rute na buduću, zabranu arhivske izmene omiljenih, lokalizovano stanje
   i vizuelnu matricu.
3. Stvarni debug APK: `app/build/outputs/apk/debug/app-debug.apk`, 67.899.061
   bajtova, SHA-256
   `5a3928849a58f4d3c0004c7498c0fe29da8f70a6510a6d952978715328557656`.
4. Emulator UI je ručno otvoren iz Danas. Odsutan produkcioni opcioni modul
   prikazuje pošteno stanje „Pregled praznika trenutno nije dostupan”, bez
   rušenja ili zamene starim katalogom. Snimak 1080×2400:
   `docs/evidence/v0.28-android/calendar-unavailable-emulator.png`, SHA-256
   `48399e134e29239a92b82a490c6e08110b7590a4e6d90901f51e56aa8e36fbe3`.
5. AndroidTest-only dostupna arhiva je vizuelno proverena na 1080×2400 u oba
   pisma, obe teme i sa font scale 1.45, uz povučeni datum. Konačni snimci su u
   `docs/evidence/v0.28-android/emulator-matrix/`:
   - `final-01-calendar-cyrl-dark-large.png`: `ad0f6bb4778f40e81cb4db6c354580ea847dbc2dcc55e55bfe8ff9284c811a21`
   - `final-02-archive-latn-light-noon.png`: `34204b724ff3d85cfd4d2cb9ad4ca57794b49c8ff26a1a645c009709efd1902c`
   - `final-03-archive-cyrl-dark-large-evening.png`: `964c3c239d6cfd4f4225541b5adfec017725621387a404112e3b9ef2d2863f75`
   - `final-04-withdrawn-cyrl-light.png`: `b1ae6648ba132c470730db9b0fd807bca041f9e1631a3e0828900a2ba424f7a4`
6. Pretragom `main`/`release` izvora i sadržaja APK-a nije pronađen frozen
   `cases.json`, AndroidTest fixture niti probni tekst.
7. `M0CalendarBrowserS10IntegrationTest` je prošao nad finalnim tačnim lokalnim
   production-key potpisanim S10-r2 bajtovima, bez lažnog auth stanja. Javni
   ključ je pre upotrebe pinovan na SHA-256 `9671cc74...c1f6`. Potvrđeni su
   index `cbb21ce4...ec23` od 595 bajtova, release-set `ccc354a8...879`, atomski S9→S10,
   odbijanje Android code 34 uz očuvan S9, 7 verifikovanih modula, katalog r5,
   browser r1, 21 memberships, 94 prospektivna datuma i 282 faze. Restart/offline
   ponovo učitava trajnu generaciju. Sa testnim lokalnim datumom 30.09. samo
   29.09. može u reader; isti ili budući datum ostaju zatvoreni. Poseban Android
   35 profil bez browser capability potpisano instalira ostalih 6 modula,
   zadržava Today 7×3 i ne projektuje Kalendar. Novija generacija sa zadržanim
   starim browser revision-om prikazuje current browser kao nedostupan, dok
   prethodni exact-pinned S10 kontekst ostaje dostupan.
8. Stvarni light-theme snimak aplikacije `calendar-unavailable-emulator.png`
   potvrđuje tamne status-bar ikone. Izolovani `ComponentActivity` evidence
   harness ne reprodukuje potpuno sistemsku traku `MainActivity`; to ne utiče
   na sadržajnu, navigacionu ili runtime proveru aplikacije.
9. Zaključani test izlazi:
   - `docs/evidence/v0.28-android/final-tests/s10-r2-native-integration.xml` —
     2/2, SHA-256 `b2fedd5458a61d24aae62a402c076e54913a9d06b94c96176369b86830679722`
   - `docs/evidence/v0.28-android/final-tests/calendar-browser-emulator.xml` —
     6/6, SHA-256 `7c964ede7448ac80bb76aea0b70e1ba695277549dc68f917a8d08c4635603f2f`

## Otvorene kapije

- Tačan S10-r2 paket je lokalno potpisan i Android native validacija je prošla, ali
  produkcioni kanal još nije javno aktiviran. Ovaj APK zato i dalje ne sadrži
  niti podrazumeva objavljenu listu praznika ili javnu arhivu.
- Nisu izvršeni javni mrežni OTA, povlačenje već javno aktivirane S10 revizije
  ni test javnog hostinga. Lokalni exact-byte OTA, restart/offline, pinovanje i
  withdrawal semantika jesu provereni pre javne aktivacije.
- Nisu izvršeni fizički Android/Xiaomi test, TalkBack audit ni kompletan pregled
  cele aplikacije sa velikim tekstom. Fokusirani Kalendar/arhiva pregled obe
  teme i oba pisma jeste izvršen, ali screenshotovi dostupnog produkcionog
  praznika/arhive čekaju odobren paket.
- Nisu povećani versionCode/versionName, napravljen release APK, objavljen
  sadržaj/APK, push-ovan repozitorijum ili instalirano na korisnikov telefon.
