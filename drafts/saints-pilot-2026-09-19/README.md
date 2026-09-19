# Svetitelji i praznici dana — odobreni pilot za implementaciju

Status: **sedam tačnih tekstova odobreno za oba OS-a; implementacija pokrenuta,
objava i aktivacija nisu izvršene**.

**19.09.2026 — pregled završen:** „pregledao sam nastvi sa planom implementacije
i.pokreni implementaciju”. [Jedno odobrenje](../../approvals/saints-pilot-2026-09-19/owner-approval.json)
vezuje sedam tekstova za SHA-256
`5847568a2aab22446ef4ab875fbceceecc9e800fad9344e5f23df59c4931ee2a`.
Ono zamenjuje raniji status čekanja pregleda ispod, ali ne predstavlja
crkvenu recenziju ili nalog za produkciono potpisivanje/objavu. Spec v0.26 / SF-02.

**19.09.2026 — format usvojen:** korisnik potvrđuje „odgovara kratki format”.
Za obe aplikacije usvojen je cilj 100–200 reči za uvod, čitalački tekst i
„Šta izdvajamo”, bez izvora/metapodataka i bez dodatnog opširnog žitija.
To ranije odobrenje odnosilo se samo na format; naknadno odobrenje iznad
obuhvata tačne tekstove i implementaciju. Kanonski format: v0.25.2 / SF-01.

[Pročitaj svih sedam predloga](TEKSTOVI.md). [Veze ka kalendaru i izvorima](pilot.json).

## Kako bi se čitalo u aplikaciji

Na stranici **Danas** ostaje postojeći kompaktni red **Danas slavimo** sa tačnim nazivom iz kalendara i nenametljivom strelicom. Ne dodajemo veliku sliku, novi tab ili ceo opis na početni ekran.

Dodir otvara postojeći detalj, proširen za čitanje unutar aplikacije:

1. Naziv spomena i jasno označeni građanski i crkveni datum.
2. Kratak uvod, dve rečenice koje korisniku objašnjavaju o kome ili o čemu čita.
3. **O svetitelju**, **O svetiteljima** ili **O prazniku**, u nekoliko kratkih pasusa.
4. Kratak završetak **Šta izdvajamo**, kao označen urednički osvrt, nikada izmišljen citat ili poruka svetitelja korisniku.
5. **Izvori i podaci o tekstu**: originalni naslov, izdavač, autor ako je potvrđen, link, datum pregleda, urednička obrada. Otvaranje originala je opciono; glavni tekst se čita offline unutar aplikacije.

Zadržati postojeće podešavanje pisma, veličinu teksta čitača, pristupačnost i povratak na isto mesto na Danas. Bez velikog hero prikaza i bez nepotvrđenih ikona. Tema čitača prati postojeće pravilo teme aplikacije.

Kada isti dan ima više odvojenih obrađenih spomena, prikazati jednostavnu listu; grupe poput Joakima i Ane ili triju sestara imaju zajednički tekst i sva imena. Pretprazništvo i odanije su posebne kalendarske napomene sa vezom ka prazniku, ne novi svetitelji. U prvom pilotu ne reklamirati „Svi svetitelji”: potpunost liste nije potvrđena.

## Pravila datuma i dostupnosti

- Spomen prati građanski `calendarDate` u lokalnoj zoni, kao postojeći DP-01; ne prati efektivni dan večernjeg psalma.
- Promena Jutro / Dan / Veče, slika ili slave ne menja spomen. Posle ponoći kalendar može biti današnji, a automatsko čitanje prethodna večer; datume ne spajati.
- Stara veza iz vidžeta otvara datum i sadržajnu generaciju koju nosi. Ako nije današnji datum, naslov je „Spomen za …”, ne „Danas”. Nema zamene nepoznatog članka jučerašnjim.
- Kalendarski naziv bez članka ostaje dostupan sa datumom i izvorom: „Detaljniji tekst nije dostupan u aplikaciji.” Ne nuditi prazan čitač.
- Ako sam kalendarski podatak nedostaje: „Kalendarski podatak za ovaj datum nije dostupan.” Ne pisati „Danas nema svetitelja”.
- Veliki vidžet zadržava postojeći kalendarski naziv; ne ubacivati žitije ili switcher. Mali vidžet ostaje bez reda svetitelja prema WG-03/WG-07.
- Čitanje svetitelja, njegov ID i lični izbori ne šalju se u analitiku.

## Sadržaj i izvori

U pilotu je sedam tekstova: tri pojedinačna svetiteljska, dva grupna i dva o prazniku/spomenu događaja. Izvori kalendara i žitija vode se odvojeno. Datum objavljivanja teksta na sajtu nije datum praznika.

Osnovni kalendarski izvor: [Eparhija austrijska SPC, septembar 2026](https://www.eparhija.at/kalendar?m=2026-9). Detalji: zvanični sajt SPC i Mitropolije crnogorsko-primorske, sa tačnim vezama uz svaki tekst. Za Rođenje Bogorodice potvrđena je autorska oznaka katihete Branislava Ilića; ostalim tekstovima ne dopisujemo autora. Izdavač ili nalog koji postavlja članak nije automatski autor žitija.

Nacrti su sažeta urednička obrada uz pomoć AI, ne prepis izvora. Čudesni i biografski narativi označeni su kao crkveno predanje. Nema novih molitava, predviđanja, medicinskih obećanja, grafičkih opisa mučenja ili ličnih saveta o postu. Izvori i ljudski pregled služe proveri tačnosti, odvojeno od prava i tehničkog potpisa.

Tekstovi su namerno kraći, približno za minut mirnog čitanja. Ne produžavati ih do zadatog broja reči nepotvrđenim detaljima. Korisnikov pregled je zabeležen za tačne postojeće tekstove, uključujući pažljiv prikaz Sozonta, Teodore i porodica bez dece; naknadne izmene zahtevaju novu reviziju i pregled.

## Jedan izvor za obe platforme

Ovaj direktorijum je **zajednički urednički ulaz**, ne novi runtime format. Čitalački tekst postoji samo jednom u `TEKSTOVI.md`, na ćirilici; `pilot.json` sadrži stabilne ID-jeve, tačne veze ka sedam datuma i izvore. Latinica se u budućem izvozu izvodi postojećom determinističkom transliteracijom, bez drugog ručno održavanog teksta. Obe verzije treba vizuelno proveriti.

Posle odobrenja sadržaja pripremiti opcioni potpisani modul, predloženo `saints-v1`, za postojeći zajednički kanal. Posebna tabela vezuje kalendarski datum za stabilne članke: žitija se ne dupliraju za 2027. godinu. Godišnje veze se ipak proveravaju prema odobrenom kalendaru; ne računati ih slepo pomeranjem 13 dana i ne parsirati naslove u klijentima.

Prvo dodavanje novog modula/čitača zahteva kompatibilnu iOS i Android verziju. Kasnije dopune kroz isti ugovor mogu stići kao sadržajni paket bez nove verzije aplikacije. Jedno odobrenje važi za oba OS-a, ali ne znači da se svi telefoni osvežavaju istovremeno. Offline uređaj čita poslednji validan paket. Stariji klijenti zadržavaju postojeći naziv i izvore, bez lažne poruke o nedostupnosti celog dana.

Aktivni godišnji kalendar, potpisi i release indeksi **nisu menjani**. SF-02 / v0.26
pokreće tehničku pripremu i obe native implementacije; native lockovi beleže
stvarno preuzetu specifikaciju. Klijenti sami ne generišu žitija. Odobrenje
sadržaja je zajedničko; tehnička priprema isporuke i produkciona aktivacija su odvojene.

## Prava, pregled i sledeći koraci

Vlasnik projekta je za ovaj sadržaj rekao: „može prava racunaj da imamo”. To je zabeležena korisnička potvrda za rad na tekstovima, ne naša nezavisna pravna provera, opšta javna licenca ili crkvena recenzija. Ne prenosi se na ikone, fotografije, logotipe organizacija ili tuđe audio snimke. Ne tražimo ponovnu potvrdu iste pretpostavke; tačna izdanja i krediti dopunjuju se pri pripremi konačnog paketa.

1. Kratki format i tačna revizija sedam tekstova su odobreni; rukopis ne menjati tokom izvoza.
2. Sačuvati kontrolni potpis i isti izvoz ćirilice/latinice za oba OS-a.
3. Implementirati zajednički ugovor, šemu, izvoz i native čitač prema SF-02; koristiti razvojni/testni paket bez produkcionog potpisa.
4. Proveriti paket, oba pisma, rad bez interneta, više spomena, prelaz ponoći, nepotpunu pokrivenost i povratak iz čitača.
5. Objaviti zajednički paket tek nakon odgovarajuće implementacije i odobrenja. Nakon pilota širiti pokrivenost na ceo naredni mesec i zatim na ostatak godine.

Lokalna strukturna provera: `node drafts/saints-pilot-2026-09-19/validate.mjs`. Ona nije zamena za ljudski urednički ili crkveni pregled.
