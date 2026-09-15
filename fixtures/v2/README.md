# Zajednički M0 v2 primeri

`positive/release` je mali, potpisani skup sa četiri modula, oba pisma,
eksplicitno nepoznatim kalendarskim vrednostima i potpuno dekodiranim PNG/JPEG
bajtovima. Potpisani negativni generator pokriva oštećenje oba formata.
Javni ključ je isključivo fixture trust anchor; privatni testni ključ nije
sačuvan.

`negative/cases.json` je zamrznuta matrica scenarija. Generator pravi kompletan
potpisani paket za svaki scenario u privremenom direktorijumu, pa validator mora
da ga odbije navedenim kodom. Android i iOS treba da koriste iste semantičke
primere i očekivanja.
