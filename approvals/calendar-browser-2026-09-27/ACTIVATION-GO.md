# Coordinator GO — zajednička S10-r2 aktivacija

27.09.2026, nakon korisničkog uslovnog odobrenja javne objave i finalnih
potvrda postojećih iOS/Android zadataka. Ovo nije native APK/iPhone release.

Tačan index: `cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23`.
Release-set: `ccc354a8c9e2af4e45b08ec8ffc1d73dfeb4d8154dcf923efb5324d50debe879`.
Android GO zapis: `9c5ef5d87af05a4ea77e413b3ac2e04d10883ef8a5a5ae4d6b4f94c7d40f7727`.
iOS GO zapis: `283abf1978e0184a9f17281a897cfc1ddbaca1644110281f915240dce14ed57f`.

Root je pročitao artefakte i proverio njihove hash-eve. Installer dry-run
vraća ready=true, blockers=[], 24 signed platform/profile provere, 52 tačne
staging datoteke i 13 novih nepromenljivih datoteka za kopiranje. Nezavisna
revizija nema preostali blokator. Prvi odbijeni fractional-time kandidat ne
sme biti aktiviran. Prava/tekstovi i nevezani charity nacrt ostaju neizmenjeni.

Dozvoljena je kontrolisana lokalna instalacija, zaseban normalan Git commit i
push samo ovog odobrenog paketa i pripadajućih dokaza/alata, bez force push-a.
Pre pisanja i pre discovery zamene moraju ponovo proći originalni S9 pair,
tačni potpisi/kolizije, oba GO artefakta i stvarni rok. Discovery pair se u
javnost isporučuje zajedno u jednom commitu. Ako lokalni pair postane mešovit,
ne objavljivati niti automatski popravljati bez pregleda.

Javno potvrđivanje je zasebno: obični HTTPS kanal, bez cache-bust query-ja,
ponovno preuzimanje svih aktivnih manifesta i payload-a, tačne dužine/hash-evi
i postojeći potpisi. Mora se završiti pre 28.09.2026. 10:00 UTC. Ovaj GO ne
tvrdi da je objava već uspela; rezultat se beleži posle readback-a.
