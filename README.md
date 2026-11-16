# Buro Scott — website

Pure HTML/CSS/JS, geen build-stap nodig. Klaar om in GitHub te zetten en
via **GitHub Pages** (of eender welke host) te draaien.

## Structuur

```
index.html          → alle content en secties
css/style.css        → kleuren, typografie, layout (variabelen bovenaan)
js/main.js            → scroll-animatie, actieve link in navigatie
assets/images/         → alle beelden (nu nog placeholders)
```

## Eigen foto's plaatsen

Vervang de bestanden in `assets/images/` door je eigen foto's met **exact
dezelfde bestandsnaam** (bv. `service-fotografie-a.jpg`), dan verandert er
niets aan de code. Elke dienst heeft nu plaats voor 2 voorbeeldbeelden
(`-a` en `-b`); wil je er een derde toevoegen, kopieer dan in `index.html`
gewoon een extra `<img>`-regel binnen de bijhorende `.service-gallery`.

**360°-tours** — wil je een echte embed (Matterport, Kuula, …) tonen in
plaats van foto's, dan kan een `<iframe>` in de rij "360° tours" komen.
Zeg gerust hoe je dat precies wil tonen, dan werken we dat verder uit.

## Teksten aanpassen

Alle teksten staan gewoon leesbaar in `index.html` tussen de HTML-tags —
geen aparte data-bestanden. Zoek de tekst op en pas aan.

## Kleuren & lettertype aanpassen

Bovenaan `css/style.css` staat een `:root { ... }`-blok met alle kleuren
(`--ink`, `--paper`, `--green`, `--grey`, …) en het lettertype
(`--font-display`, `--font-body`). Wijzig daar, en het past overal
automatisch aan.

## De hero-achtergrond ("SCOTT" die schuift)

De kolommen achter het paneel op de startpagina zijn zes `<div class="marq-col">`-
blokken in `index.html`, elk met het herhaalde woord "SCOTT". Kolommen met
klasse `dir-down` schuiven naar beneden, `dir-up` naar boven — dat regel je
in `css/style.css` bij `.marq-col`. Wil je een ander woord (bv. voluit
"BURO SCOTT"), vervang dan de tekst in de `<span>`-elementen.

## Hosten via GitHub Pages

1. Maak een nieuwe GitHub-repository aan en push deze bestanden.
2. Ga naar **Settings → Pages**.
3. Kies bij "Source" de branch `main` en map `/ (root)`.
4. Na een minuut is de site live op `https://<gebruikersnaam>.github.io/<repo-naam>/`.

Wil je een eigen domeinnaam (bv. `buroscott.be`) koppelen, dat kan ook via
diezelfde Pages-instellingen — laat het weten als je daarbij hulp wil.

## Toegankelijkheid & effecten (update 2026)

- **Accentkleur:** diep blauw (`--accent: #1D3FD6`), met `--accent-light` voor
  donkere vlakken. Aanpassen kan bovenaan `css/style.css`.
- **Toetsenbord:** zichtbare focusring, een link "Naar de inhoud" bovenaan elke
  pagina (verschijnt bij de eerste Tab-toets).
- **Formulieren:** foutmeldingen staan onder het veld zelf. Eigen tekst per veld
  zet je via `data-error="..."` op het `<input>`/`<select>`.
- **Animaties:** foto's met klasse `reveal-img` schuiven open bij het scrollen;
  alle beweging valt weg als de bezoeker "beweging beperken" aanzet.
- **Navigatie:** glijdt weg bij naar beneden scrollen, komt terug bij omhoog.
- **Foto's vervangen?** Pas dan ook de `alt="..."`-tekst aan zodat ze beschrijft
  wat er écht op de foto staat.

## Formulieren laten aankomen (Formspree)

Nu opent bij versturen het e-mailprogramma van de bezoeker met een ingevuld
bericht naar `info@buroscott.be`. Zo gaat er niets verloren, maar de bezoeker
moet nog zelf op verzenden drukken. Netter is Formspree (gratis tot 50
berichten per maand):

1. Maak een account op formspree.io met het e-mailadres waar je de aanvragen
   wil ontvangen.
2. Maak twee formulieren aan, "Offerte" en "Contact". Je krijgt per formulier
   een adres zoals `https://formspree.io/f/abcdwxyz`.
3. Plak dat adres in `offerte.html` en `contact.html` bij `data-endpoint=""`
   op het `<form>`-element.

Vanaf dan komen aanvragen rechtstreeks in je mailbox. Een onzichtbaar
spamveld (`_gotcha`) houdt de meeste bots tegen.
