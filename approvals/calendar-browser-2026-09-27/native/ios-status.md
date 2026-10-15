# Status implementacije v0.28 — iOS

Datum: 27.09.2026.

## Merodavan obim

Implementacija prati neobjavljenu radnu reviziju zajedničkih dokumenata:

- `svetlost33-github/docs/SPECIFIKACIJA.md` — SHA-256
  `6e17326e0373c1f959d0b11461fd8e060922688d9828bfa017f275d01b7c4f2a`;
- `svetlost33-github/docs/PLAN-IMPLEMENTACIJE-SPEC-v0.28.md` — SHA-256
  `955147437a64343259e73415d6c38256fccc235a6dd94666f1c1e51e980035b5`;
- `svetlost33-github/docs/KOORDINACIJA-v0.28.md` — SHA-256
  `5697fcc27e1921843fd9dd03add70e69ba727f213a031d0958915bd7f3415d11`;
- `svetlost33-github/docs/design/calendar-v0.28/README.md` — SHA-256
  `86e4e0958cb4a4546a0fda2981f8f4c7e27c940eb2657c3c54afb777c8ec6786`.

`specSourceState` je `working-tree`, sa source HEAD-om
`a4afe4f0053f0a89edf09cffd74ceaaca225d0e5`. Neizmenjeni korišćeni tekst je
zamrznut u `docs/reference/v0.28/SPECIFIKACIJA-working-tree-source.txt`; njegovih
394.894 bajta imaju isti SPEC SHA-256 naveden iznad. Generisani
`docs/reference/v0.28/input-provenance.json` vezuje sve v0.28 ulaze. Ovaj
dokument ne predstavlja objavu ili odobrenje produkcionog kalendarskog sadržaja.

Postojeći `shared-content.lock.json` i njegov `specSnapshot` ostaju istorijski
zapis v0.25.2/bundlovanog sadržaja (`f84b5e…`) i nisu prepisani ovim zahvatom.
Pre native release-a treba uraditi pregledan spec-only provenance sync ili
komitovati kanonski v0.28 i osvežiti glavni lock; to je isporučna kapija, ne
razlog da se sada kopiraju nepovezane dirty sadržajne izmene.

Zamrznuti zajednički tehnički ulazi su:

- `svetlost33-content/docs/CALENDAR-BROWSER-V1-CONTRACT.md` —
  `6bc966e1462c99a00908702d860e1fb8d629c4764d1a864f7c9f4de5f6071861`;
- `svetlost33-content/schemas/calendar-browser-v1.schema.json` —
  `f9ac5beb4f96c7fc4ba85e84b6b8a85c78d09a6e10128c6eadac1ef7f5f1ce89`;
- `svetlost33-content/fixtures/calendar-browser-v1/cases.json` —
  `10a0fa132a6062280cd253d4911c618419143218d949545d58dbc7600cf6b7ad`;
- `svetlost33-content/scripts/validate-calendar-browser-v1.mjs` —
  `072b23f4e7b2a876580ae68ef0b0229552b2c1779d6ac1a8d62feca1e72b5e42`.

iOS test bundle sadrži bajt-za-bajt istih 120.297 bajtova i svih 102 shared
slučaja. Fixture je isključivo sintetički test i nije deo runtime sadržaja.

Završna native provera koristi tačan lokalni, produkcionim ključem potpisan S10-r2
kandidat bez objave ili izmene produkcionog kanala:

- `signed-s10-r2/index.json`: 595 bajtova, SHA-256
  `cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23`;
- S10 `release-set.json`: 3.933 bajta, SHA-256
  `ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879`;
- browser payload: 97.947 bajtova, SHA-256
  `e3a1422ac3959a4259a2062d767ae6252bf56d6e6d2b915f73996a0753c31c2e`;
- catalog payload: 54.448 bajtova, SHA-256
  `9d8f9e09dd9bb1a845bac8b3c41198b19ebd87560824228de73cad269f385529`;
- trust PEM pin: SHA-256
  `9671cc745a71f3b35ac2281bfd4e8da9335db9c6a44beda0ae5cf380b292c1f6`,
  DER pin `3e7f161303cbd7f01d24b8d70dd89733c5702b68817ca39e328888456d4a34fb`.

Prvi potpisani S10 indeks sa fractional `issued_at` ostaje negativan dokaz:
iOS ga je zatvoreno odbio pre projekcije. Ispravljeni r2 koristi cele UTC sekunde;
manifesti, release i sadržajni payload-i ostali su isti.

## Stanje po slojevima

| Sloj | Stanje | Dokaz / ograničenje |
|---|---|---|
| Integracioni inventar | DONE | Mapirani Today toolbar, `ReadingRoute`, scene state, AppModel generacije i M0 projector/capabilities. |
| Nativna navigacija | PASS | Today ima Calendar toolbar ulaz; browser, dan, izabrani period i ceo reader dokaz ostaju u kodabilnoj scene putanji. Reader se pri restore/deep-link putanji ponovo validira. |
| Calendar UI | PASS ZA UNAVAILABLE / IMPLEMENTED ZA S10 | Stvarni iPhone 16 Pro Max simulator prikazuje segmente i kontrolisano unavailable stanje; standardni i najveći sistemski tekst prolaze bez pada. Dostupan S10 sadržaj je potvrđen kroz native runtime/projektor; javna aktivacija nije glumljena. |
| Shared core parser/resolver | PASS | Strogi UTF-8/BOM/1 MiB/closed-object parser i typed rezultati prolaze svih 102 zamrznuta shared slučaja. |
| M0 integracija | PASS | Produkcioni verifier/pin, S9→S10 projekcija i instalacija, 7 modula, optional skip starog capability profila, restart/offline i atomski fallback prolaze na tačnim S10-r2 bajtovima. Browser i catalog bajtovi su uključeni u hash stabla novih browser generacija, uz čitljivost istorijskih S9 descriptor-a. |
| D+1…D+7 najava | PASS | D0 i D+8 su isključeni; D+1…D+7 koristi najraniju celu grupu i urednički redosled iz membership niza. Stvarni S10 feast rezultat se razrešava iz potpisanog catalog binding-a. |
| Arhivsko čitanje | PASS | Svih 94 datuma / 282 perioda u S10 daju tačan slot/psalam/stih/molitvu. Reader dokaz preživljava offline restart; povlačenje ga zatvara. Centralna device-local provera odbija danas/budućnost i forged/restored putanju, dok raniji datum ostaje dostupan. Arhivski reader ne nudi favorite/setup upis. |
| Produkcioni sadržaj | SIGNED CANDIDATE, NOT PUBLISHED HERE | S10-r2 je lokalno potpisan i native GO je pozitivan. Ovaj zadatak nije menjao javni kanal niti bundlovao kandidat. |
| Shared Node provere | PASS | `calendar-browser-v1` + candidate: 115/115 PASS; upstream koordinacija beleži 335/335 ciljane zajedničke provere. |
| Portable Swift testovi | PASS | 272 testa / 45 grupa, 0 failures, sa `SVETLOST_M0_S10_STAGING=signed-s10-r2` i odvojenim negativnim prvim S10 kandidatom. |
| Xcode build / simulator UI | PASS | Xcode 27.0 build za `Svetlost33 iPhone 16 Pro Max`, iOS 26.5, prolazi bez upozorenja; instalacija i launch `app.svetlost33.ios` prolaze. Evidencija je u `docs/evidence/v0.28-ios/`. |
| Fizički iPhone | NOT RUN | Nije deo odobrenog v0.28 naloga. Raniji build 30 i uređajski artefakti nisu menjani. |
| VoiceOver / Dynamic Type | PARTIAL | Najveća sistemska veličina teksta proverena je u stvarnom simulator ekranu. VoiceOver gestovi/čitanje nisu provereni i ostaju release kapija. |

## Implementirane datoteke

- `Sources/SvetlostCore/ReadingNavigation.swift`
- `Sources/SvetlostCore/CalendarBrowser.swift`
- `Sources/SvetlostCore/ModularContentContract.swift`
- `Sources/SvetlostCore/ModularRuntimeProjector.swift`
- `Sources/SvetlostCore/ModularUpdateInstaller.swift`
- `Sources/SvetlostCore/ContentGenerationRepository.swift`
- `Svetlost33App/AppModel.swift`
- `Svetlost33App/Svetlost33App.swift`
- `Svetlost33App/HomeViews.swift`
- `Svetlost33App/LibraryViews.swift`
- `Svetlost33App/ProductionContentUpdates.swift`
- `Tests/SvetlostCoreTests/ReadingUXTests.swift`
- `Tests/SvetlostCoreTests/CalendarBrowserV028Tests.swift`
- `Tests/SvetlostCoreTests/ProductionCalendarBrowserStagingV028Tests.swift`
- `Tests/SvetlostCoreTests/Resources/calendar-browser-v1-cases.json`
- `docs/reference/v0.28/SPECIFIKACIJA-working-tree-source.txt`
- `docs/reference/v0.28/input-provenance.json`

Prethodno zatečene izmene u `docs/STATUS-IMPLEMENTACIJE-v0.24.6-IOS.md`,
`docs/STATUS.md` i `docs/evidence/v0.24.6/physical-install-build23-2026-09-19.md`
nisu menjane u v0.28 zahvatu.

## Preostale kapije

1. Pre javne aktivacije spojiti iOS i Android GO u zajedničkoj release evidenciji,
   zatim objaviti samo tačne S10-r2 bajtove kroz odobreni sadržajni tok.
2. Izvršiti VoiceOver proveru čitanja i fokusa na ciljnom simulatoru/uređaju.
3. Posle javne aktivacije proveriti dostupni Calendar UI iz stvarnog kanala,
   bez testnog auth-a ili promene korisničkog sata.
4. Pre native release-a uskladiti glavni `shared-content.lock.json` sa
   komitovanom v0.28 specifikacijom ili pregledanim spec-only sync postupkom.
