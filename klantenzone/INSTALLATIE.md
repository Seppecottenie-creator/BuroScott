# Klantenzone installeren

De klantenzone bestaat uit twee delen:

| Deel | Waar | Wat |
|---|---|---|
| **Pagina's** | Op je website (`klantenzone.html`, `klantenzone-beheer.html`) | Wat jij en je klanten zien |
| **Worker + opslag** | Bij Cloudflare (gratis) | Bewaart de beelden afgeschermd en controleert wachtwoorden |

Gratis binnen: 10 GB opslag (R2) en 100.000 aanvragen per dag (Workers).
Ruim genoeg voor tientallen opdrachten tegelijk.

---

## 1. Cloudflare-account (jij, ±5 min)

1. Maak een gratis account op **dash.cloudflare.com/sign-up**.
2. Ga links naar **R2 Object Storage** en klik **Aan de slag**.
   Cloudflare vraagt hier mogelijk een betaalkaart. Binnen de gratis limieten
   betaal je niets.
3. Maak een bucket aan met de naam **`buroscott-klantenzone`** (locatie: automatisch / Europa).

## 2. Worker online zetten

### Optie A — Claude doet het (aanbevolen)

1. Ga in Cloudflare naar **Mijn profiel → API-tokens → Token maken**.
2. Kies het sjabloon **"Cloudflare Workers bewerken"** (Edit Cloudflare Workers)
   en voeg bij de rechten ook **Account → Workers R2 Storage → Bewerken** toe.
3. Geef de token aan Claude via het beveiligde formulier dat Claude je toont
   (nooit in de chat plakken).

### Optie B — zelf, op je eigen computer

Je hebt [Node.js](https://nodejs.org) nodig.

```bash
cd klantenzone/worker
npm install
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SIGNING_KEY
npm run deploy
```

- `ADMIN_PASSWORD`: het wachtwoord voor je beheerpagina. Kies een sterk wachtwoord.
- `SIGNING_KEY`: een lange willekeurige reeks van minstens 32 tekens.
  Bijvoorbeeld een wachtwoordgenerator met 48 tekens.

Na `npm run deploy` toont wrangler een adres zoals
`https://buroscott-klantenzone.<jouwnaam>.workers.dev`.

## 3. Website koppelen

1. Zet dat adres in **`js/klantenzone-config.js`**:
   ```js
   window.KLANTENZONE_API = 'https://buroscott-klantenzone.<jouwnaam>.workers.dev';
   ```
2. Krijg je later een eigen domein (bv. `www.buroscott.be`), voeg het dan toe
   aan `ALLOWED_ORIGINS` in `klantenzone/worker/wrangler.toml` en zet de worker
   opnieuw online.

## 4. Gebruiken

- **Beheer:** `…/klantenzone-beheer.html` → inloggen met `ADMIN_PASSWORD`.
  1. Maak een galerij (titel = adres van het pand). Code en wachtwoord worden voorgesteld.
  2. Kies de soort (Foto's, Drone, Plannen, Overig) en sleep je bestanden erin.
     Van foto's wordt automatisch een kleinere voorbeeldversie gemaakt; de klant
     downloadt altijd het origineel.
  3. Kopieer het bericht en stuur het naar je klant. **Het wachtwoord zie je
     alleen op dat moment**; vergeten? Maak een nieuw wachtwoord.
- **Klant:** `…/klantenzone.html` → code + wachtwoord → bekijken en downloaden
  (per beeld, of alles als zip, netjes in mappen per soort).
- **Opruimen:** galerijen verdwijnen automatisch na de gekozen termijn
  (elke nacht om ±4u). Verlengen kan in de instellingen van de galerij.

## Veiligheid in het kort

- Beelden staan in een **afgeschermde** opslag, niet op GitHub.
- Wachtwoorden worden **nooit leesbaar bewaard** (enkel een hash).
- Toegang verloopt automatisch na 12 uur (klant) of 8 uur (beheer).
- Een klant kan enkel zijn eigen galerij openen.
- De klantenzone-pagina's staan **niet** achter het "in opbouw"-scherm, zodat
  klanten ze nu al kunnen gebruiken. Ze worden niet opgenomen in Google.

## Lokaal testen (voor ontwikkelaars)

```bash
cd klantenzone/worker
cp .dev.vars.example .dev.vars   # vul in
npm install && npm run dev       # API op http://127.0.0.1:8787
```
Open daarna de site met `?api=http://127.0.0.1:8787` achter het adres van
`klantenzone.html` of `klantenzone-beheer.html` (`?api=reset` om te wissen).
