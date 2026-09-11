# Campaignsheet — prototip local

Deschide `index.html` în browser. Nu sunt necesare instalări, conexiune la internet sau importuri.

- `index.html`: structura paginii și ferestrele de filtrare.
- `styles.css`: designul foii de calcul și adaptarea pentru ecrane mici.
- `app.js`: date fictive, selecții, ierarhie și calcule.

Campanii → adseturi → creative. Butoanele +/− restrâng detaliile fără să schimbe totalurile. Filtrul „Campanii și reclame” permite selectarea fiecărui nivel și reafișarea elementelor ascunse. Tagul „Inactiv” se aplică manual din „Campanii și reclame”, pe orice nivel. Filtrul după tag permite afișarea tuturor elementelor, ascunderea celor inactive sau afișarea doar a celor inactive. La filtrare, tagul unui părinte include descendenții săi. Nu presupunem existența unui statut Facebook în export. Totalurile se recalculează după selecție. Filtrul „Coloane” controlează inclusiv cele șase grupe de vârstă, exprimate în număr de leaduri.

Moneda este preluată din conturile selectate (implicit USD). Selectorul de conturi este grupat pe Business Portfolio și permite selecții multiple, inclusiv între portofolii, numai în aceeași monedă. Pentru EUR, deselectează mai întâi conturile USD. Nu se efectuează conversie valutară. Perioada se alege prin două date și butonul „Aplică”; datele zilnice fictive sunt disponibile pentru 1–30 iunie 2026. Intervalele fără date afișează o stare goală. Venitul fictiv reprezintă valoarea comenzilor plătite. Ratele și costurile agregate se calculează din totalurile datelor de bază; împărțirea la zero afișează „—”. Formulele sunt explicate și în interfață.

Tagurile manuale și conturile selectate sunt salvate în stocarea locală a browserului, dacă este disponibilă. Selecțiile și perioada se resetează la reîncărcarea paginii. „Resetează filtrele” păstrează tagurile manuale și conturile selectate. Prototipul nu conectează Facebook sau GetCourse și nu importă date reale.


Conturile și portofoliile sunt demonstrative, fără ID-uri reale Facebook. Datele fiecărei campanii, fiecărui adset și fiecărei reclame includ `accountId`, iar cheia internă combină contul cu ID-ul entității. Selecțiile individuale se păstrează între schimbările de cont. Acțiunile „Selectează tot” și „Deselectează tot” din filtrul campaniilor afectează doar conturile curente.

La integrarea reală, sursa trebuie să furnizeze ID-uri stabile de cont și entitate, moneda contului și datele zilnice. Venitul GetCourse trebuie asociat contului/campaniei și exprimat în aceeași monedă înainte de calcularea ROAS. Integrarea și conversia valutară nu sunt implementate în acest prototip.

Verificări: `node tests/accounts.test.cjs`.

## Backend local și PostgreSQL

PostgreSQL 17 rulează local ca serviciu Homebrew. Baza proiectului se numește
`fb_gc_analyzer`, iar schema se află în `db/schema.sql`.

Pentru configurarea importului Facebook:

1. Copiază valorile necesare în fișierul local `.env` (acesta nu ajunge în Git):
   - `META_ACCESS_TOKEN` — tokenul System User;
   - `META_AD_ACCOUNT_IDS` — unul sau mai multe ID-uri separate prin virgulă;
   - `META_API_VERSION` — versiunea activă pentru aplicația Meta.
2. Pornește aplicația cu `npm start`.
3. Deschide `http://localhost:3000`, alege perioada și apasă „Actualizează din Facebook”.

Importul salvează separat totalurile zilnice și breakdown-ul pe vârste. Repetarea
aceluiași import actualizează rândurile existente prin cheia cont + reclamă + dată,
fără să dubleze datele. Starea importurilor este păstrată în `sync_runs`.

Pagina GitHub Pages rămâne o demonstrație statică. Importul și baza locală sunt
disponibile numai prin `http://localhost:3000`, deoarece tokenul Meta nu trebuie
expus în browser sau în repository.
