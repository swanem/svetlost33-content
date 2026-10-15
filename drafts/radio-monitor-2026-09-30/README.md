# P7 — zajedničko jezgro monitora, priprema bez aktivacije

Izvorni runner u Android repozitorijumu nije menjan/pokrenut. Novi
`scripts/radio-monitor-core-v2.mjs` preuzima njegovu radio-only semantiku,
ali godinu zahteva eksplicitno, strogo proverava stvarni datum i svaki stih
u rasponu (uključujući unutrašnje glave/stihove), te razlikuje predlog i
potvrđeni bogoslužbeni raspored. Izvoz su isključivo kandidati.

`node --test tests/radio-monitor-core-v2.test.mjs` proverava 2026/2027,
prestupni dan, promenu HTML-a, dodat/izmenjen/nestao red, nepromenjeno uspešno
čitanje, deduplikaciju obaveštenja i očuvanje poslednjeg stanja pri parse grešci.
Nezavisni pregled je otkrio i zatim su pokrivena tri dodatna slučaja: više
referenci u jednom pogrešnom chunk-u, neispravan `Datum*` ID koji ne sme tiho
nestati i referenca sa validacionom greškom. Poslednji pokušaj/greška vode se
odvojeno; neuspešna referenca ostaje review candidate i ne pomera last-good
redove ili `last_success_at`, ni pri ponovljenom istom neuspehu.
Nema mrežnih poziva, disk upisa, novog cron-a, potpisa ili produkcionog postupka.

## Pripremljen transport, bez hosted aktivacije

`scripts/radio-monitor-transport-v2.mjs` je opt-in adapter: uvoz nema I/O,
a `fetchImpl` mora biti eksplicitno prosleđen. HTTPS origin je strogo ograničen,
preusmeravanja se proveravaju ručno; telo, trajanje, retry i Retry-After imaju
granice. Nepotpuno, neispravno, otkazano ili zakasnelo preuzimanje nije uspeh.
Transportni uspeh znači samo `received_unvalidated_html`, ne odobren sadržaj.

42/42 determinističkih transportnih testova prolazi bez stvarne mreže. Root je
pregledao adapter i ponovio testove. [Detalji](TRANSPORT.md) odvajaju ovaj rezultat
od parsera, trajnog stanja, obaveštenja i aktivnog rasporeda. Jednokratna urednička
provera javne stranice za P2c nije uključivanje ovog monitora.

## Preduslovi hosted koraka

- Jedan budući raspored, dnevno 07:17 `Europe/Belgrade`. Aktuelna zvanična
  [GitHub dokumentacija](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
  proverena 30.09.2026. podržava IANA `timezone` uz schedule i DST; raspored
  ipak nije garancija izvršenja u tačan minut. Pre aktiviranja ponovo proveriti.
- Potrebna je odluka o **privatnom odredištu** trajnog stanja i uredničkog
  izveštaja. Kanonski content repo je javni; privatne kandidate/izvorne
  arhive nije dozvoljeno stavljati u javni commit, log ili Actions artifact.
  Nije napravljen novi privatni repo, servis ili token bez odobrenja.
- Hosted adapter još mora da obezbedi trajni read/compare/atomic commit i
  proveru integriteta pointera, pa da poveže zasebno testiran transport i jezgro.
  Čuva poslednji uspeh pri svakoj grešci.
- Parser i transportni testovi **nisu** dokaz atomske trajnosti ili rada na
  serveru. Te provere i aktivni YAML ostaju sledeća etapa.
- Izabrati privatni kanal pregleda/obaveštenja pre povezivanja naloga. Jezgro
  daje stabilni fingerprint i notification_needed, ali ništa ne šalje.
- Izostali zakazani rad zahteva nezavisan nadzor. Dok nije uključen, poslednji
  uspeh se prati ručno; sam cron ne može javiti da se nikada nije pokrenuo.
- Ponovo proveriti uslove pristupa izvoru i aktuelni `robots.txt` pre live
  monitora. Ranije odobrenje razvoja nije automatska dozvola za svaki način pristupa.

Ovo je **delimično završen P7**, ne završena produkciona automatizacija.
