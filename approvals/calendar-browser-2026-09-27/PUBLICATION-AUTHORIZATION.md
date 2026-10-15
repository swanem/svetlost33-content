# Odobrenje zajedničke sadržajne objave

27.09.2026. — vlasnik projekta, odgovor u glavnom zadatku.

Pitanje koje je korisnik odobrio:

> Kada obe platforme prođu završnu proveru, da li da odmah objavim zajednički
> paket sa 21 praznikom za 2026. i rasporedom čitanja od 29. septembra do
> 31. decembra? Prošli dani bi postajali dostupni kako datumi prolaze; starije
> dane ne bismo prikazivali kao objavljenu arhivu. Ovo odobrenje je samo za
> sadržaj, ne za objavu APK-a ili instalaciju na iPhone.

Odgovor: **„Da, objavi sadržaj nakon uspešnih provera”**.

Odobrenje je uslovno: tačni potpisani bajtovi moraju proći obe native provere,
sa očuvanim postojećim ključem, kompatibilnošću i izvorima. Prvobitni S10
staging sa milisekundama u `issued_at` nije kandidat za aktivaciju jer ga je
postojeći iOS parser odbio. Ispravljen transport dobija nove proverljive
hash-eve i odvojene native GO zapise; verski tekstovi i pregledani datum/payload
opseg se ne menjaju.

Ovaj dokument nije potvrda da se objava već dogodila. Aktivacija mora proći
aktuelne provere izvornog S9, rok pre 28.09.2026. 10:00 UTC i javno ponovno
preuzimanje. Ako rok istekne, potreban je kasniji početak bez retroaktivnog
pripisivanja istorije. Objavu i njene tačne javne bajtove zabeležiti zasebno.

Nisu odobreni promena sajt/APK isporuke, automatska instalacija na telefon,
2027 podaci ili aktiviranje nevezanog charity kandidata.
