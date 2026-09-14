# Campaignsheet — dashboard local Facebook Ads × GetCourse

Aplicația este gândită să lucreze local cu date reale importate în PostgreSQL. Repository-ul public conține doar codul interfeței, backendul local și schema bazei de date. Tokenurile Meta, `.env`, CSV-urile GetCourse și datele importate în baza locală nu se publică în Git.

## Cum pornești local

1. Completează `.env` după modelul din `.env.example`.
2. Rulează migrațiile dacă este nevoie: `npm run db:migrate`.
3. Pornește serverul: `npm start`.
4. Deschide `http://localhost:3000`.

Dashboardul citește datele din endpointul local `/api/report`. Dacă nu există date importate pentru perioada aleasă, tabelul rămâne gol și arată mesajul de import.

## Importuri

Pagina **Date** conține:

- import manual Facebook Ads pentru perioada selectată;
- import GetCourse pentru CSV-uri complete: leaduri/înscrieri gratuite sau comenzi create/plătite;
- import GetCourse pentru liste simple de emailuri: L1 intrat, L1 trimis, Absolvit și grupele de vârstă `sub_18`, `18_21`, `22_24`, `25_34`, `35_44`, `45_plus`.

Importul Facebook salvează totalurile zilnice în PostgreSQL și folosește conversiile din fereastra `7-day click`. Reimportarea aceleiași perioade actualizează rândurile existente, fără dublare.

Leadurile GC sunt baza principală pentru calcule; `Leads FB` rămâne o coloană opțională pentru comparație. Listele de emailuri din GetCourse se atașează la leadurile GC după email, iar grupele de vârstă din dashboard se calculează din aceste liste.

## Filtre și stare locală

Filtrele se salvează în `localStorage` în browser:

- perioada selectată;
- conturile publicitare;
- coloanele afișate;
- campaniile/adseturile/creativele bifate;
- rândurile deschise sau restrânse;
- tagurile manuale „Inactiv”.

Butonul **Resetează filtrele** curăță starea salvată și revine la setările implicite.

## Date reale și Git

Datele reale stau în PostgreSQL local, nu în fișiere din proiect. Fișierul `.env` trebuie să rămână local. Dacă exporți CSV-uri din GetCourse, păstrează-le în afara repository-ului sau adaugă-le în `.gitignore` înainte de commit.

Pagina GitHub Pages poate afișa interfața statică, dar importurile și datele reale funcționează numai prin serverul local, deoarece tokenul Meta și baza PostgreSQL nu trebuie expuse în browser.

## Verificări

```bash
node --check app.js
npm test
```
