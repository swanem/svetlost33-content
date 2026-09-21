# Pregled dopune — 21.09.2026.

**Spremno za vlasnikov pregled tačnog teksta; nije odobreno ili objavljeno.**

## Rezultat

- 18 originalnih kratkih tekstova za 03–20.10.2026, po 118–155 reči.
- 27 evidentiranih biografskih/identitetskih izvora; kalendarska potvrda
  odvojena od biografskog teksta. Metod pristupa zabeležen je po izvoru.
- Svih 30 datuma 21.09–20.10. ima tekst u pregledu: 12 dana objavljeno u S8,
  18 novih nacrta. Kandidat čuva i 19–20.09, ukupno 32 članka/datuma.
- Jedan zajednički neaktivni payload, oba pisma, **138.924 bajta**.
- Rukopis SHA-256: `c7d7e8ea931ae9f88fed2e7c3678a6f895028c08dff72110dc55b08ddbb06609`.
- Payload SHA-256: `c8df176dc5e5355f8eb355b94b1da59dd4ae215ba95ab7ef0bf24a29826fd21c`.

Ovi hash-evi identifikuju pregledani nacrt. Nisu digitalni potpis izdanja
niti dokaz korisnikovog odobrenja.

## Uredničke odluke

| Datum | Preciziranje |
|---|---|
| 03.10. | Jevstatije i porodična pripovest označeni kao žitijsko predanje. |
| 04.10. | Kodrat je zaseban svetitelj; odanije napomena sa vezom ka postojećem Krstovdanu. Autorstvo Apologije pripisano je žitiju, ne nezavisno dokazanoj istorijskoj identifikaciji. |
| 05.10. | Foka episkop Sinopski, ne Foka baštovan. |
| 06.10. | Praznik Začeća Preteče, ne još jedno dnevno Jevanđelje ili nova molitva. |
| 07.10. | Teklin naziv prvomučenica objašnjen u okviru predanja koje govori i o kasnijem životu. |
| 08.10. | Efrosinija Aleksandrijska, ne istoimena Suzdaljska. |
| 09.10. | Jovan Bogoslov; crkveni prikaz bez tuđih biblijskih citata. |
| 10.10. | Kalistrat i 49 sapatnika, zajednički spomen; bez grafičkih opisa. |
| 11.10. | Hariton Ispovednik nije prikazan kao pogubljeni mučenik. |
| 12.10. | Kirijak Otšelnik i Miholjdan dodatno povezani srpskim crkvenim izvorom. Katalog nije automatski proširen article vezom. |
| 13.10. | Kratki naziv Grigorije razjašnjen jermenskim prosvetiteljem; Kinonija ima i 30.09/13.10 i puni identitet. Nema tvrdnje da je umro mučeničkom smrću. |
| 14.10. | Pokrov je praznik; sporna istorijska hronologija nije u čitalačkom tekstu. |
| 15.10. | Kiprijan vezan za Justinu i Antiohiju, ne episkop Kiprijan Kartaginski. Nesaglasno mesto rođenja izostavljeno. |
| 16.10. | Dionisije Areopagit nije bez ograde izjednačen sa Pariskim; autorstvo kasnijeg korpusa nije predstavljeno kao nesporno. |
| 17.10. | Jerotej: kratak izvor nije popunjen izmišljenim događajima; nema nove hronologije atinskih episkopa. |
| 18.10. | Haritina iz Amisa, ne litvanska kneginja; nema grafičkog ili seksualnog nasilja. |
| 19.10. | Toma: sopstveno prepričavanje jevanđeljskog događaja, ne preuzeti drugi prevod. |
| 20.10. | Sergije i Vakho, zajednički spomen; Srđevdan iz postojećeg srpskog kalendara. |

Svi glavni biografski prikazi pročitani su tokom pripreme tri grupe.
Root pregled obuhvatio je svih 18 rukopisa, registar izvora i odvojeni
uzorak primarnih stranica: Kodrat, Foka, Začeće Preteče, Grigorije, Miholjdan
i ograde o Dionisijevom korpusu. Ponovo je pregledan indeksirani kalendar
Eparhije austrijske za svih 18 datuma. Ovo je urednička provera uz AI, ne
nezavisna crkvena recenzija ili novo vlasničko odobrenje.

## Tehničke provere

`node scripts/prepare-saints-completion-draft.mjs --check`: **PASS**.

`node --test tests/saints-completion-draft.test.mjs tests/saints-v1.test.mjs tests/saints-expansion-release-v2.test.mjs`:
**73/73 PASS**, nula preskočenih/neuspelih; 11 novih provera ove dopune.

Provereni su tačni stari bajtovi S8, očuvanje svih 14 starih tekstova/dana,
svi novi datumi, reference izvora, oba pisma, dužine i granica 256 KiB,
odanije, odbijanje neodobrenog teksta i ponovljivost generisanih datoteka.
Nezavisan read-only pregled pripreme uočio je da urednički osvrti ne treba
da dobiju izmišljeni izvor. Provera je ispravljena: prazne reference dozvoljene
su samo za eksplicitno označen urednički osvrt; činjenične tvrdnje i dalje
moraju imati izvor. Dodat je test za tu razliku.

Prvi integrisani prolaz otkrio je zastareli generisani pregled dok se poslednja
urednička dopuna još snimala. Posle završetka izmena pregled je ponovo izveden
i ceo navedeni skup je prošao. Nema prikrivenog preskakanja testa. Pun nepovezani
charity/native skup nije deo ove provere.

## Šta nije urađeno

Nema novih potpisa, production promena, GitHub objave, novih kataloških
Save veza, izmena 2027. godine, native implementacije ili instalacije.
Postojeće tuđe lokalne izmene ostaju netaknute.

Posle vlasnikovog pregleda slede odobrenje tačne revizije, priprema jednog
zajedničkog potpisanog izdanja, usklađenje postojećeg katalog→saints binding-a,
provera nadogradnje oba sistema i zasebno odobrena objava.
