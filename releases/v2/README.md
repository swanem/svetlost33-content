# Produkcioni M0 v2 izvozi

`annual-2026-r1` je prvi potpisani modularni izvoz odobrenog godišnjeg paketa.
Odobren je za Android i koristi isti sadržajni RSA ključ kao istorijski r1, ali
M0 v2 potpisi koriste RSA-PSS/SHA-256. Privatni ključ nije u repozitorijumu.

Izvoz čuva svih 13 istorijskih payload datoteka bajt-po-bajt. Naknadno
odobrenje je zapisano odvojeno u modulu biblioteke, tako da raniji statusi u
izvornim datotekama ostaju dokaz toka pregleda. `release-scope.json` određuje
tačno dozvoljeno tumačenje 173 radio-predloga i eksplicitno čuva 192 nerešena
datuma i 91 nepotvrđenu strogost posta.

Nisu uključene podloge: annual r1 ne sadrži njihov per-asset pregled prava.
Nije uključen modul organizacija ili donacija.
