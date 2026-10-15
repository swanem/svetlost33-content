# P7 state/diff v2 — lokalni privatni draft

Status 30.09.2026: pripremljen i lokalno testiran **opt-in runner**, bez live
preuzimanja, rasporeda, hosted odredišta, naloga, notifikacija ili objave.
Ovim inkrementom nisu menjani core, transport, stari artefakti ili TEKSTOVI.
Ovo nije završena operativna automatizacija iz P7.

Artefakti:

- `scripts/radio-monitor-state-v2.mjs`
- `tests/radio-monitor-state-v2.test.mjs`

```sh
node --test tests/radio-monitor-state-v2.test.mjs
node --test tests/radio-monitor-core-v2.test.mjs tests/radio-monitor-transport-v2.test.mjs tests/radio-monitor-state-v2.test.mjs
```

## Eksplicitna granica poziva

Modul nema CLI, import-side-effect, global fetch fallback, izabrano odredište
ili podrazumevani public-tree fajl. Pozivalac bira apsolutan `directory` i
zasebno poziva `initializeRadioState({directory, corpus})` samo za novi prazan
privatni direktorijum. Postojeći roditeljski direktorijum mora već postojati;
runner ne pravi proizvoljno stablo roditelja.

`runRadioReview({directory, currentYear, years, corpus, fetchImpl, signal?,
clock?, sleep?})` izvršava jedan pregled. Obavezan je eksplicitan `fetchImpl`;
testovi koriste samo fake. `years` sadrži jednu ili dve različite godine,
isključivo eksplicitni `currentYear` i/ili `currentYear + 1`. Ne izvodi tekuću
godinu iz liturgijskog dana, ne kopira datume između godina i ne pravi
nedostajuće godišnje podatke. Ranije sačuvane godine ostaju u stanju i posle
promene `currentYear`. Podržani opseg godina ostaje onaj postojećeg core-a.

`readRadioState({directory})` je zaseban eksplicitan privatni read. Run rezultat
vraća sažetak bez činjenica/diff redova; puni izveštaj i kandidat ostaju u
privatnom snapshot-u. Modul ništa ne ispisuje niti šalje. Stvaran poziv sa
mrežnim fetch adapterom zahteva zasebno ovlašćenje; nije izvršen ovim radom.

## Stanje i značenje uspeha

Po godini se odvojeno čuvaju:

- `core.rows` i `last_success_at`: poslednja potpuna radio-opservacija bez
  grešaka referenci, **ne odobren bogoslužbeni raspored**;
- `last_observation`: poslednji uspešno parsirani redovi, uključujući
  neispravne reference, uz `last_observed_at`;
- `last_attempt`: poslednji pokušaj, stabilan status/kod greške i vreme;
- `review_candidate`: poslednji nastali predlog razlike i dedup fingerprint-i.

HTTP, timeout, iscrpljen retry, deadline i parse greška ne pomeraju prethodne
last-good redove/vreme, poslednju opservaciju ili postojeći review candidate.
Neispravne reference čuvaju se kao zasebna opservacija/predlog; last-good ostaje
isti. Prvi neispravan odgovor ne izmišlja uspešnu osnovu. Nepromenjen validan
izvor osvežava vreme uspeha bez ponovnog novog diff-a. Postojeći kandidat se
ne briše samo zato što naredna provera nema novu razliku.

Dodavanje, izmena i nestanak izvornog reda su isključivo privatne činjenice za
pregled, ne nalog za menjanje produkcionog kalendara. `release_allowed`,
`production_ready` i `publication_authorized` ostaju false. Broj radio-redova
nije broj odobrenih/runtime dodela; nema liturgijskog zaključivanja.

Stabilan fingerprint deduplikuje **trajno zabeleženu potrebu za pregledom**.
To nije dokaz poslate ili pročitane poruke, potvrda vlasnika niti obrada
notification outbox-a. Budući kanal mora posebno rešiti delivery/ack/retry;
ne sme smatrati postojeći `seen_fingerprints` dokazom isporučenog obaveštenja.

`run_report` je deo iste generacije kao stanje, sa `observations_recorded`,
`partial_failure` ili `all_failed`. Jedna neuspešna godina ne može dobiti
lažni all-success zato što je druga uspešna. Sažetak neuspeha može sadržati
broj prethodno sačuvanih redova; nije tvrdnja da su ponovo preuzeti. Caller
abort pre commita ne beleži novi pokušaj i ostavlja ranije stanje netaknuto.

SHA-256 identitet korpusa zasniva se na celom prosleđenom JSON objektu, ne samo
broju glava/stihova. Njegova promena zaustavlja run pre mreže sa
`corpus_change_requires_review`. To je lokalna zaštita od tihog reinterpretiranja
osnove, **ne potpisni dokaz ili zamena za tačno pinovan produkcioni manifest**.
Migracija korpusa/šeme nije automatski implementirana.

## Privatnost i atomska generacija

Implementacija zahteva POSIX owner-only direktorijum i fajlove. Odbija ovaj
content repo i bilo koje odredište unutar Git checkout-a/worktree-a, symlink
leaf direktorijum/pointer/generaciju, tuđeg vlasnika, group/other permissions,
ne-regularan fajl i višestruki hardlink. Proverava veličine, strogi UTF-8/JSON,
šemu, stvarne datume, vezu godine, hash i vezu pointera sa generacijom.

Ove provere nisu enkripcija, ACL audit, zaštita od administratora/zlonamernog
procesa istog vlasnika, javnog serviranja nekog ne-Git direktorijuma ili
nebezbednog backup/sync sistema. Pozivalac i dalje mora izabrati stvarno
privatno lokalno odredište i zaštititi roditelje. Nema automatske tvrdnje da
svaka putanja izvan Git-a jeste privatna. Sirovi HTML se ne čuva; normalizovani
izvorni redovi i uredničke beleške ostaju privatni i nisu za javne logove/artifacts.

Jedan `generation-UUID.json` sadrži kompletno stanje **i** review report.
`CURRENT.json` sadrži ime generacije, store ID, reviziju, dužinu i SHA-256.
Pisac radi exclusive create i fsync generacije, ponovnu proveru prethodnog
pointera, exclusive create/fsync privremenog pointera, atomic rename i fsync
direktorijuma. Čitalac bez lock-a vidi staru ili novu kompletnu generaciju;
ne spaja stanje iz jedne sa izveštajem iz druge. Checksum detektuje slučajno
oštećenje/neslaganje, nije autentifikacija protiv nekoga ko može menjati oba.

`.writer.lock` je **kooperativni**, fail-fast exclusive lock. Dva poziva ovog
runner-a ne mogu istovremeno objaviti izgubljeno ažuriranje. Nije zaštita od
spoljašnjeg pisca koji ignoriše protokol; nema distributed lock-a ili dokaza
semantike network filesystem-a. Stale lock se ne briše automatski, PID nije
dokaz da je bezbedno nastaviti, a stari snapshot-i se ne garbage-collect-uju.

| Ishod | Značenje i oporavak |
|---|---|
| Greška pre pointer rename | Raniji pointer ostaje aktivan; nema delimično objavljenog state/report para. Mogući neaktivni ostaci zahtevaju pregled. |
| Greška posle pointer rename | `commit_outcome_uncertain`; ne tvrditi rollback. Ponovo eksplicitno pročitati pointer/generaciju pre odluke o retry-u. |
| Nestao/oštećen CURRENT ili aktivna generacija | Fail closed; nema povratka na staru generaciju, resetovanja, mreže ili izmišljene prazne osnove. |
| Stale lock, limit ili nepoznata šema | Zaustaviti i pregledati; nema automatskog unlock-a, migracije ili brisanja. |

I/O greška ili prekid procesa izvan kontrolisanog povratka takođe mogu ostaviti
neizvestan ishod: prethodno čitanje nije potvrda da kasniji commit nije nastao.
Posle prekida, oporavak se zasniva na proverljivom aktuelnom pointeru, ne na
ponavljanju inicijalizacije. Lock se ručno razrešava tek posle dokaza da više
nema aktivnog pisca i pregleda stanja. Ne postoji automatska repair naredba.

## Granice resursa i dokaza

Jedan snapshot je najviše 16 MiB, pointer 4 KiB, najviše 512 sačuvanih
generacija i 4.096 dedup fingerprint-a po godini. Dostizanje limita zaustavlja
pisanje i zahteva odluku o retention/migraciji; nema tihog gubitka istorije.
Svaki eksplicitan run, i nepromenjen ili neuspešan, pravi novu generaciju.
Ovo zato nije neograničeno arhiviranje i limit nije unapred odobrena retention
politika. Private store može imati neaktivnu generaciju posle stvarnog prekida.

Transportni rok/retry/byte limiti iz [TRANSPORT.md](TRANSPORT.md) važe po
godini; dve godine se proveravaju sekvencijalno. To nije ukupan deadline
filesystem operacija ili celog dvogodišnjeg runner-a. Nekooperativni native I/O
ne može se prekinuti samim JavaScript AbortSignal-om.

Dokaz: **28/28 novih state testova** i **79/79 zajedno sa 9 core + 42 transport
testa**, bez skip-a. Svi fetch odgovori, korpus i izvorne reference u testovima
su sintetički; jedini disk upisi su u testom napravljenim privremenim
direktorijumima koji se zatim uklanjaju. Nema stvarnog HTML-a, ličnih podataka,
privatnog runtime stanja ili kredencijala u repo-u iz ovog inkrementa.

Testovi pokrivaju restart/dedup, changed/removed redove, invalid references,
HTTP/parse/timeout/deadline/retry, current/next-year partial failure i retention
ranije godine, nepostojeće/oštećeno stanje, traversal/symlink/permissions,
simultane kooperativne pisce, čitanje tokom commita, stale lock i caller abort.
Injected throw-checkpoint-i pre/posle rename-a proveravaju programske putanje
i nedeljivost para; **nisu** fizički power-loss/crash test ili dokaz trajnosti
diska, hosta ili filesystem-a. Nije izvršen kill/power-loss, realni HTTP,
DNS/TLS, remote storage, stvarni raspored ili isporuka poruke.

### Naknadni concurrency QA i korekcija test harness-a

Prvobitni ciljani rezultat 77/77 nije otkrio grešku u samom testu konkurentnih
pisaca. Koordinatorov full-suite pokušaj ostao je da čeka state test više od
četiri minuta, pa je njegov tačno identifikovani test proces terminiran. Taj
prekinuti pokušaj nije full-suite PASS.

Uzrok: prvi testni pisac čekao je ručni fetch gate bez aktivnog fake-clock
driver-a. Drugi `f.run()` koristio je **isti** clock i, dok je njegov filesystem
put čekao I/O, mogao je pomeriti prvi attempt na 6.000 ms/timeout. Drugi poziv
zatim dobije `store_busy` i prestane da pokreće fake timere. Prvi pisac pređe
u retry/backoff koji više niko ne pokreće, a test ga čeka neograničeno. Sporiji
I/O je otkrivao race u testu; nije dokaz da je produkcioni lock zaglavljen.

Korekcija menja samo `tests/radio-monitor-state-v2.test.mjs`: konkurentni
lock probe se sada čeka bez pomeranja sata suspendovanog pisca; njegov jedini
driver nastavlja tek posle oslobađanja gate-a. Svaki state test ima 20 s realni
timeout, run/readiness čekanja 8 s, a abort/join cleanup 5 s. Ti rokovi su
harness watchdog-i, ne nova transportna politika. Cleanup abortira i sačeka
aktivne pozive pre uklanjanja tačno testom napravljenog privatnog direktorijuma.
Dve dodatne regresije proveravaju watchdog/cancellation i namerno rekonstruišu
stari cross-clock redosled uz ograničen ishod i oslobađanje lock-a.

Dokaz posle korekcije (Node v24.13.0, 30.09.2026):

- Core + transport + state: **79/79 PASS**, 0 skip/cancelled, 1.248 s.
- Ista full-suite komanda `node --test --test-reporter=tap tests/*.test.mjs`:
  **740 ukupno, 724 PASS, 13 FAIL, 3 SKIP, 0 cancelled**, završila za 8.645 s.
  Svih 13 padova su ranije prijavljene S9/TEKSTOVI provere van ovog inkrementa;
  state suite završava bez greške. Ovo **nije** čist full-suite PASS.
- Osam istovremenih zasebnih state test procesa, svaki sa
  `UV_THREADPOOL_SIZE=1`: **8 × 28 = 224/224 PASS**, bez timeout/termination,
  cela grupa 5.008 s. Svaki proces ima sopstveno sintetičko privatno test stablo.

Runtime `radio-monitor-state-v2.mjs` ostaje nepromenjen, SHA-256
`00ae97cca53951a96997619244b298906f2d07ee670855e3c4dd774e23875673`.
Core i transport takođe nisu menjani; stari TEKSTOVI i produkcioni/potpisani
artefakti nisu popravljani ili prepisivani da bi suite postala zelena.

## Preostale operativne kapije

1. Korisnik bira privatni host/odredište i kanal pregleda pre hostovanja ili
   povezivanja naloga. Nije izabran novi agent, repo, servis ili kredencijal.
2. Dogovoriti backup/retention, recovery/stale-lock proceduru, odgovornog
   vlasnika i tačan pin korpusa; proveriti actual host/filesystem atomicity i
   crash recovery. Windows/remote CAS traže zaseban adapter, ne prečicu.
3. Zasebno rešiti notification delivery/ack i nezavisan freshness watchdog.
   Do tada su pregled stanja i izostalog rada ručni.
4. Pre odobrenog live rada ponovo proveriti pristup/robots uslove izvora i
   minimalne dozvole. Monitor ne dobija potpisni ključ ili pravo aktivacije.
5. Aktivacija ostaje zasebna: samo jedan raspored, proverena zona/DST,
   odobren ručni probni rad pa dokaz stvarnog zakazanog prolaza. Cron je off;
   nema YAML-a, heartbeat-a, produkcionog upisa, potpisa ili publikovanja.
