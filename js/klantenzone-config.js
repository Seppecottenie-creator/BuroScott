/* ============================================================
   KLANTENZONE — instelling
   Vul hieronder het adres van je Cloudflare Worker in, zoals
   wrangler het toont na `npm run deploy`, bv.
   'https://buroscott-klantenzone.jouwnaam.workers.dev'
   (zonder schuine streep op het einde).
============================================================ */
window.KLANTENZONE_API = '';

/* Enkel om te testen: met ?api=<adres> in de link kan je tijdelijk een
   ander adres gebruiken (wordt onthouden in deze browser). ?api=reset wist het. */
(function () {
  try {
    var p = new URLSearchParams(location.search).get('api');
    if (p === 'reset') localStorage.removeItem('kz-api');
    else if (p) localStorage.setItem('kz-api', p.replace(/\/+$/, ''));
    var o = localStorage.getItem('kz-api');
    if (o) window.KLANTENZONE_API = o;
  } catch (e) {}
})();
