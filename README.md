# Campaignsheet — dashboard local Facebook Ads × GetCourse

Aplicația este gândită să lucreze local cu date reale importate în PostgreSQL. Repository-ul public conține doar codul interfeței, backendul local și schema bazei de date. Tokenurile Meta, `.env`, CSV-urile GetCourse și datele importate în baza locală nu se publică în Git.

## Cum pornești local

1. Completează `.env` după modelul din `.env.example`.
2. Rulează migrațiile dacă este nevoie: `npm run migrate`.
3. Pornește serverul: `npm start`.
4. Deschide `http://localhost:3000`.

Dashboardul citește datele din endpointul local `/api/report`. Dacă nu există date importate pentru perioada aleasă, tabelul rămâne gol și arată mesajul de import.

## Importuri

Pagina **Date** conține:

- import manual Facebook Ads pentru perioada selectată;
- upload CSV GetCourse pentru leaduri, comenzi și evenimentele L1/absolvire.

Importul Facebook salvează totalurile zilnice în PostgreSQL și folosește conversiile din fereastra `7-day click`. Reimportarea aceleiași perioade actualizează rândurile existente, fără dublare.

GetCourse este importat din CSV-uri separate. Leadurile GC sunt baza principală pentru calcule; `Leads FB` rămâne o coloană opțională pentru comparație.

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
