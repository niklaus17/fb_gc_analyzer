# Google Sheets + Apps Script backend

1. Creează un Google Sheet nou.
2. Deschide Extensions → Apps Script.
3. Copiază conținutul din `Code.gs`.
4. Schimbă `APP_TOKEN` cu o valoare privată.
5. Rulează funcția `setup()` o dată pentru a crea taburile.
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
