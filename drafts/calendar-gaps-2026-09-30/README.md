# Registar rupa u godišnjem sadržaju 2026.

Ovo je prvi P2c rezultat odobrenog plana: tačan, ponovljiv pregled **postojećih**
nepoznatih podataka u aktivnom S10. Nije novi kalendar, izvorna potvrda ili objava.

`inventory.json` ima jedan red po stvarnom datumu, sa odvojenim razlozima za
Jevanđelje, detalj posta i opšti status posta. Kategorije se preklapaju:
192 + 91 + 5 **nije** broj različitih dana. Naredni datumi od 30.09. imaju prioritet.
`inventory.mjs` proverava SHA-256 S10 kalendarskog manifesta i njegovog payloada;
ne oslanja se na naziv ili datum izmene fajla. Ovim korakom nije izmenjen nijedan
datum niti rešena ijedna kalendarska nepoznanica.

## Urednički postupak

1. Za `priority_dates` ponovo pregledati odgovarajuće zvanične datirane izvore.
2. Sačuvati URL, datum pregleda, referencu i razliku prema konkretnom redu izvora.
3. Radio-predlog nije potvrda bogoslužbenog rasporeda; post ne izvoditi iz čitanja.
4. Neslaganje/missing podatak ostaje eksplicitno nepoznat. Ne popunjavati šablonom.
5. Kandidat novih činjenica ide na jedinstven pregled za oba OS-a. Posle izmena
   kalendarskih bajtova ponovo vezati saints/catalog/archive module i testove.
6. Ne menjati potpisani S10 ili njegove r1 kalendarske bajtove na mestu.

Provera iz korena content repozitorijuma:

```sh
node --test drafts/calendar-gaps-2026-09-30/inventory.test.mjs
```

Lokalne oznake originalnog payloada poput `DRAFT` ostaju istorijsko poreklo;
status stvarne isporuke određuje potpisani release-set, ne prepisivanje tih polja.
