# HTTP-baserad A-kodsklient

Datum: 2026-08-07

## Mål

Ersätt Playwright/Chromium i A-kod-automationens hämtning mot direkta HTTP-anrop mot Älvsborg RoRo:s ASP.NET WebForms-flöde, utan att ändra den befintliga kö-, resultat-, Dropbox- eller Supabase-kontrakten.

## Verifierade fakta

- HTTP-login mot `Login.aspx` fungerar utan browser.
- Efter login kan samma HTTP-session öppna `ServiceBooking.aspx` och sidan visar inloggat läge.
- `ServiceBooking.aspx` använder klassisk ASP.NET WebForms med `__VIEWSTATE`, `__VIEWSTATEGENERATOR` och `__EVENTVALIDATION`.
- A-kod skapas via en vanlig form-POST med `ctl00$MainContent$btnAuthorise=Authorise Service`, tillsammans med tank, release-ref och färska WebForms-state-fält.
- Svaret innehåller A-koden i elementet `MainContent_lblAuthorisationID`.

## Rekommenderad arkitektur

Varje GitHub Actions-körning skapar en ny autentiserad HTTP-session från `AKOD_USERNAME` och `AKOD_PASSWORD` i GitHub Secrets. Session-cookien hålls endast i processens minne under jobbet och cacheas inte mellan workflow-körningar.

Flöde:

1. GET `Login.aspx`.
2. Extrahera färska WebForms hidden fields.
3. POST login med credentials från environment/GitHub Secrets.
4. Verifiera inloggning genom att öppna `ServiceBooking.aspx` och kontrollera att unit-fältet finns och login-formen saknas.
5. För varje giltig köpost:
   - hämta/behåll aktuell `ServiceBooking.aspx`-state,
   - POST tank + release-ref + `btnAuthorise`,
   - extrahera `MainContent_lblAuthorisationID` när A-kod finns,
   - klassificera kända fel/väntelägen utan att avbryta resten av kön,
   - återställ formulärstate inför nästa post vid behov.
6. Skriv samma `results.json`-format som nuvarande script.
7. Låt befintlig workflow-logik för dedupe, Dropbox, Supabase-sync och mail-notifieringar fortsätta oförändrad.

## Session och säkerhet

- GitHub Secrets fortsätter vara källan för `AKOD_USERNAME` och `AKOD_PASSWORD`.
- Ingen ASP.NET-session eller cookie skrivs till GitHub Cache, artifacts, Dropbox eller logs.
- En ny session skapas per workflow-körning. Login är billigt jämfört med Chromium och undviker problem med utgångna/roterade sessioner.
- Credentials och cookie-värden får aldrig loggas.

## Komponenter

### HTTP/WebForms-klient

Ansvarar för cookie jar, GET/POST, redirect-hantering och extraktion av WebForms-state. Den ska ha tydliga operationer för login, hämta authorisation-form och posta authorisation.

### Parser

Små rena funktioner för att extrahera hidden fields, upptäcka login-sida, läsa A-kod från `MainContent_lblAuthorisationID` och känna igen kända felsvar. Dessa ska kunna enhetstestas med statisk HTML utan nätverk.

### Kö-runner

Behåller nuvarande normalisering av tank/ref och nuvarande resultatschema. Ett fel på en enskild rad ska ge ett resultat för raden och inte stoppa resterande kö, så länge sessionen går att återställa.

## Felhantering

- Nätverksfel och 5xx: begränsad retry med kort backoff.
- Misslyckad login: fail fast för hela körningen.
- Om en request landar på login-sidan mitt i kön: gör högst ett nytt loginförsök och återuppta aktuell rad.
- Saknade WebForms-state-fält: behandlas som protokoll-/sessionsfel och loggas utan hemliga värden.
- Ingen A-kod men känt popup-/serverfel: skriv motsvarande failed-resultat och fortsätt.
- Ingen A-kod och inget känt fel: behåll ett tydligt vänteläge/okänt resultat kompatibelt med nuvarande flöde.

## Workflow-ändringar

Första implementationen ska endast byta exekveringsmekanismen. När HTTP-varianten är verifierad i GitHub Actions tas Playwright-specifika steg bort:

- Playwright browser cache
- `npx playwright install chromium`
- Playwright-dependency i `package.json`/lockfile om inget annat använder den

Övriga workflow-steg och secrets behålls.

## Teststrategi

1. Parser-tester för hidden fields, login-detektering, A-kod och kända felsvar.
2. Runner-tester med mockade HTTP-svar för success, vänteläge, login-expiry och ett radfel följt av fortsatt processing.
3. GitHub Actions-test på branch med den riktiga kön och befintliga GitHub Secrets.
4. Verifiera att `results.json`, `sync_results.json`, Supabase-sync och notifieringsstegen fortfarande fungerar.

## Avgränsning

Ingen ändring av webbappen, Supabase-schema, Dropbox-format eller Power Automate-flöde ingår. Ingen persistent sessionscache införs.

## Framgångskriterier

- GitHub Actions kan logga in utan Chromium.
- Samtliga köposter behandlas via HTTP.
- A-koder extraheras korrekt från serverns HTML.
- Befintligt resultatschema och downstream-sync fungerar utan kontraktsändringar.
- Workflowet behöver inte längre vänta på browsernavigation eller installera Chromium.
