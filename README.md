# Campaignsheet — prototip local

Deschide `index.html` în browser. Nu sunt necesare instalări, conexiune la internet sau importuri.

- `index.html`: structura paginii și ferestrele de filtrare.
- `styles.css`: designul foii de calcul și adaptarea pentru ecrane mici.
- `app.js`: date fictive, selecții, ierarhie și calcule.

Campanii → adseturi → creative. Butoanele +/− restrâng detaliile fără să schimbe totalurile. Filtrul „Campanii și reclame” permite selectarea fiecărui nivel și reafișarea elementelor ascunse. Tagul „Inactiv” se aplică manual din „Campanii și reclame”, pe orice nivel. Filtrul după tag permite afișarea tuturor elementelor, ascunderea celor inactive sau afișarea doar a celor inactive. La filtrare, tagul unui părinte include descendenții săi. Nu presupunem existența unui statut Facebook în export. Totalurile se recalculează după selecție. Filtrul „Coloane” controlează inclusiv cele șase grupe de vârstă, exprimate în număr de leaduri.

Moneda implicită este USD; selectorul permite USD, EUR, RON și MDL. Acesta stabilește moneda datelor demo, fără conversie valutară. Perioada se alege prin două date și butonul „Aplică”; datele zilnice fictive sunt disponibile pentru 1–30 iunie 2026. Intervalele fără date afișează o stare goală. Venitul fictiv reprezintă valoarea comenzilor plătite. Ratele și costurile agregate se calculează din totalurile datelor de bază; împărțirea la zero afișează „—”. Formulele sunt explicate și în interfață.

Tagurile manuale și moneda sunt salvate în stocarea locală a browserului, dacă este disponibilă. Selecțiile și perioada se resetează la reîncărcarea paginii. „Resetează filtrele” păstrează tagurile manuale și moneda. Prototipul nu conectează Facebook sau GetCourse și nu importă date reale.
