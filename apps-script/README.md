# Google Sheets + Apps Script backend

1. Creează un Google Sheet nou.
2. Deschide Extensions → Apps Script.
3. Copiază conținutul din `Code.gs`.
4. Schimbă `APP_TOKEN` cu o valoare privată.
5. Rulează funcția `setup()` o dată pentru a crea taburile. Ruleaz-o din nou după update-uri de schemă, ca să apară filele noi pentru evenimente.
6. Deploy → New deployment → Web app:
   - Execute as: Me
   - Who has access: Anyone with the link
7. Copiază URL-ul `/exec` în `config.local.js` din dashboard.

Exemplu `config.local.js`:

```js
window.CAMPAIGNSHEET_CONFIG = {
  dataSource: "google",
  googleApiUrl: "https://script.google.com/macros/s/.../exec",
  googleApiToken: "tokenul-tau",
  defaultCurrency: "USD",
  allTimeFrom: "2026-01-01",
};
```

Endpoint report:

```text
GET ?action=report&from=2026-09-01&to=2026-09-15&token=...
```

Endpoint import GetCourse:

```text
POST ?action=gcImport&kind=leads&token=...
POST ?action=gcImport&kind=orders&token=...
POST ?action=gcImport&kind=l1sent&token=...
```


## Leaduri GetCourse

Fila `gc_leads` poate primi exportul de leaduri/comenzi gratuite direct cu antetul din GetCourse:

```text
Email, Number, Data creării, Comandă Detalii, utm_source, utm_medium, utm_campaign, utm_content, utm_term
```

La import, Apps Script mapează automat aceste coloane astfel:

- `Email` → `email`
- `Number` → `gc_order_number`
- `Data creării` → `created_at`
- `Comandă Detalii` → `product_name`
- `utm_campaign`, `utm_content`, `utm_term` rămân sursa de atribuire pentru campanie / adset / reclamă.

`Number` este tratat diferit pentru leaduri și pentru comenzi plătite: la leaduri intră în `gc_order_number`, iar la `gc_orders` / `gc_orders_paid` intră în `order_number`.


## File evenimente GetCourse

Pentru import manual mai simplu, evenimentele sunt în file separate cu o singură coloană `email`:

- `gc_l1in`
- `gc_l1sent`
- `gc_graduates`
- `gc_age_sub_18`
- `gc_age_18_21`
- `gc_age_22_24`
- `gc_age_25_34`
- `gc_age_35_44`
- `gc_age_45_plus`

Fila `gc_events` rămâne compatibilă ca format combinat (`email`, `event_type`, `imported_at`). Raportul citește atât filele separate, cât și `gc_events`, deci putem folosi oricare dintre variante. Pentru GetCourse recomand filele separate, deoarece poți încărca liste simple de emailuri fără `imported_at`.


## Comenzi GetCourse

Pentru claritate, comenzile pot fi ținute în două file:

- `gc_orders` — comenzi create / toate comenzile exportate.
- `gc_orders_paid` — comenzile plătite, dacă vrei să imporți separat doar lista plătită.

Raportul citește ambele file și dedublează după `order_number`, ca aceeași comandă să nu fie numărată de două ori. Pentru fluxul recomandat: pune comenzile create în `gc_orders` și comenzile finalizate/plătite în `gc_orders_paid`.

Import Apps Script:

```text
POST ?action=gcImport&kind=orders&token=...
POST ?action=gcImport&kind=orders_paid&token=...
```
