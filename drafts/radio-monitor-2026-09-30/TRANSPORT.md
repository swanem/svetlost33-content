# P7 transport v2 — lokalni, neaktivirani adapter

Status 30.09.2026: **kod i deterministički testovi**, bez live mrežne provere,
trajnog stanja, hosted workflow-a, rasporeda, naloga, tajni ili objave.
Root core/test i README nisu menjani ovim inkrementom.

Artefakti:

- `scripts/radio-monitor-transport-v2.mjs`
- `tests/radio-monitor-transport-v2.test.mjs`

```sh
node --test tests/radio-monitor-transport-v2.test.mjs
node --test tests/radio-monitor-core-v2.test.mjs tests/radio-monitor-transport-v2.test.mjs
```

Svi transport testovi daju sopstveni fake fetch, monotoni/wall clock i abortable
sleep. Test fajl ne poziva global fetch. Import adaptera ne radi I/O i nema CLI.
`fetchImpl` je obavezna eksplicitna zavisnost; izostavljen adapter ne uključuje
stvarnu mrežu sam od sebe. Nema novih npm zavisnosti ili promena package skripti.

## Granica odgovornosti

`fetchRadioHtml(year, {fetchImpl, signal?, clock?, sleep?})` gradi početni URL
isključivo preko postojećeg `sourceURL(year)`. Prima eksplicitnu podržanu godinu,
ne proizvoljan URL. Rezultat je `transport_status: received_unvalidated_html`,
`html`, broj preuzetih bajtova, početni/krajnji URL i broj pokušaja/preusmeravanja.
To **nije** validan kalendar, review candidate, last-good success, sadržajno
odobrenje ili dokaz dostupnosti datuma. Sledeći korak ostaje `parseRadioHtml`
pa `reviewObservation`; njihov validation failure ne sme pomeriti last-good.

Adapter nema state pointer, disk writer, publikovanje, potpisivanje ili
notification kanal. Greške bacaju `RadioTransportError` sa stabilnim kodom;
izvoz ne sadrži telo greške, sirovi exception, tokene ili servisne tajne.
Prethodno stanje ne dobija kao argument i zato ga sam ne može promeniti.

## Mrežne i resursne granice

| Pravilo | Granica |
|---|---|
| Početak | `https://www.slovoljubve.com/...?...Godina=YYYY` iz core-a |
| Svaki hop | HTTPS, tačno origin `https://www.slovoljubve.com`, bez credentials/fragment-a; bez subdomain/bare-host/IP/port fallback-a |
| Redirect | Ručno 301/302/303/307/308; validacija Location pre narednog zahteva, loop reject, najviše 3 po pokušaju |
| Zahtev | GET, `redirect: manual`, `credentials: omit`, `cache: no-store`, Accept HTML |
| Ukupno | 20.000 ms preko fetch-a, redirecta, body čitanja i backoff-a |
| Pokušaj | Najviše 6.000 ms i ne duže od preostalog ukupnog roka |
| Retry | Najviše 2 ponavljanja, odnosno 3 pokušaja; najviše 12 HTTP zahteva uz maksimalne redirect lance |
| Body | Najviše 5.000.000 dekodovanih streamed bajtova i 32.768 chunk-ova |
| HTTP uspešan transport | Samo 200 + HTML + strogo validan UTF-8 + neprazan završen tok |

Redirect može promeniti putanju na istom dozvoljenom origin-u. To ne dokazuje
godinu sadržaja: core mora proveriti godišnji naslov/datum. HTML odgovor za
login ili maintenance nije kalendar samo zato što transport vrati 200.
Fetch implementacija mora imati standardnu Fetch semantiku (uključujući
dekodiranje content-encoding-a); `redirected:true` ili neočekivani response URL
se odbija. Nema automatskog pristupa drugom hostu čak ni pri redirectu.

Declared Content-Length je samo rana gornja granica, ne zamena za brojač toka.
Kod identity/nekompresovanog odgovora proverava se i stvarna dužina. Kod
kompresovanog odgovora wire dužina nije jednaka dekodovanoj dužini; byte limit
se i dalje primenjuje na dekodovane bajtove. Dozvoljeni Content-Type je
`text/html`, opciono jedan UTF-8 charset. Nepoznat charset, loš UTF-8, prazan,
prekinut, prevelik ili nedovršen tok ne daju uspešan rezultat. 204/206/304 nisu
podržan cache/partial-content put i ne tretiraju se kao potpun HTML.

## Retry, rok i cancellation

Retry je dozvoljen samo za 429, 500, 502, 503, 504 i timeout sopstvenog pokušaja.
Nepoznati fetch/stream error, ostali HTTP statusi, parser/media metadata error,
allowlist/limit greška i korisnički abort se ne ponavljaju automatski.

Bez Retry-After čekanje je 250 ms pa 500 ms. Prisutan Retry-After prihvata ceo
nenegativni broj sekundi ili strogi IMF-fixdate i proverava ga prema injected
wall clock-u. Čeka se najmanje traženo vreme (i najmanje navedeni backoff).
Ako je traženo čekanje preko 10.000 ms ili ne staje u ukupan rok, adapter
**staje**; ne skraćuje serverovu zabranu i ne pokušava prerano. Neispravno
zaglavlje se ne nagađa. Ukupan budžet koristi monotoni clock, ne promenljiv
sistemski wall clock; nazad pomeren injected monotoni clock je greška.

AbortSignal se prosleđuje fetch-u i čitaču. Timeout/caller abort zatvara radni
attempt, otkazuje body/timer best-effort i sprečava retry pri caller abort-u.
Promise koji ignoriše abort ne može kasnije vratiti uspeh; kasno pristiglo
telo se otkazuje. JavaScript ne može fizički prekinuti blokirajući sinhroni ili
nekooperativni spoljašnji implementation; stvarni Fetch/stream/sleep adapteri
moraju poštovati signal. Ovaj kod ne tvrdi da test fake dokazuje OS sockets,
DNS/TLS ili mrežnu infrastrukturu.

## Dokaz i sledeće granice

Lokalni rezultat 30.09.2026: **42 transport testa + 9 postojećih core testova,
51/51 PASS, 0 skip**. Sve zavisnosti fetch/clock/sleep u transport testovima su
simulirane; nema live zahteva. Poslednja četiri dodatna slučaja zatvaraju
`blob:` origin lookalike, skraćeni identity body, kasni response prethodnog
attempt-a i previše praznih chunk-ova. Ovaj PASS ne menja status neaktiviranog
adaptera niti proširuje odobrenje mrežnog/hosted rada.

Deterministički testovi proveravaju explicit year, byte/chunk/UTF-8 granice,
host/HTTPS/redirect kontrolu, status politiku, obe Retry-After forme, celokupan
rok uključujući body/backoff, timeout retry cap, kasni response i caller abort.
Fizički/live HTTP uslovi, robots/access uslovi, privatno odredište, atomski
read/compare/commit last-good stanja, notifikacije i nezavisni freshness watchdog
ostaju zasebne kapije. Ovaj inkrement ne aktivira produkcioni monitor.
