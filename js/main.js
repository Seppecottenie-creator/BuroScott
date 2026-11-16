/* ============================================================
   BURO SCOTT — interactie
   Geen build-tools nodig; puur vanilla JS.
============================================================ */

/* ---- Introfoto's: animatie pauzeren zolang de muis erover zweeft ---- */
const introPhotos = document.querySelector('.intro-photos');
const introPhotosTrack = document.querySelector('.intro-photos-track');
if (introPhotos && introPhotosTrack) {
  introPhotos.addEventListener('mouseenter', () => introPhotosTrack.classList.add('is-paused'));
  introPhotos.addEventListener('mouseleave', () => introPhotosTrack.classList.remove('is-paused'));
  // Ook op touchscreens: kort pauzeren bij aanraken zodat een foto goed te bekijken is.
  introPhotos.addEventListener('touchstart', () => introPhotosTrack.classList.add('is-paused'), { passive: true });
  introPhotos.addEventListener('touchend', () => introPhotosTrack.classList.remove('is-paused'));
}

/* ---- Formulieren (contact & offerte): eigen validatie met duidelijke foutmeldingen.
   VERZENDEN — twee manieren:
   1. Formspree (aanbevolen): maak een gratis formulier aan op formspree.io en zet
      het adres in het data-endpoint-attribuut van het <form>, bv.
      data-endpoint="https://formspree.io/f/abcdwxyz". De berichten komen dan in je mailbox.
   2. Zolang data-endpoint leeg is, opent het e-mailprogramma van de bezoeker
      met een kant-en-klaar bericht naar MAIL_TO. Zo gaat er nooit een aanvraag verloren. ---- */
const MAIL_TO = 'info@buroscott.be';
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fieldMessage(el){
  if (el.validity.valueMissing) return el.dataset.error || 'Dit veld is verplicht.';
  if (el.validity.typeMismatch && el.type === 'email') return 'Dit e-mailadres lijkt niet te kloppen. Controleer het @-teken.';
  if (!el.validity.valid) return el.dataset.error || 'Controleer dit veld.';
  return '';
}
function getErrorEl(container, baseId){
  let err = container.querySelector(':scope > .field-error');
  if (!err){
    err = document.createElement('p');
    err.className = 'field-error';
    err.id = baseId + '-error';
    err.hidden = true;
    container.appendChild(err);
  }
  return err;
}
function linkDescribedBy(el, id){
  const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  if (!ids.includes(id)) el.setAttribute('aria-describedby', ids.concat(id).join(' '));
}
function validateControl(el){
  const field = el.closest('.field');
  if (!field) return true;
  const msg = fieldMessage(el);
  const err = getErrorEl(field, el.id);
  linkDescribedBy(el, err.id);
  field.classList.toggle('is-invalid', !!msg);
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  err.textContent = msg;
  err.hidden = !msg;
  return !msg;
}
function validateGroup(group){
  const boxes = group.querySelectorAll('input[type="checkbox"]');
  const ok = Array.from(boxes).some(b => b.checked);
  const err = getErrorEl(group, group.dataset.requiredGroup);
  group.classList.toggle('is-invalid', !ok);
  err.textContent = ok ? '' : group.dataset.error;
  err.hidden = ok;
  if (!ok) group.setAttribute('aria-describedby', err.id); else group.removeAttribute('aria-describedby');
  return ok;
}

document.querySelectorAll('form[data-form]').forEach(form => {
  const controls = Array.from(form.querySelectorAll('input[required], select[required], textarea[required]'));
  const groups = Array.from(form.querySelectorAll('[data-required-group]'));
  let tried = false;

  // Na een eerste poging: meteen feedback terwijl de bezoeker verbetert
  controls.forEach(el => {
    el.addEventListener('blur', () => { if (tried) validateControl(el); });
    el.addEventListener('input', () => { if (tried && el.closest('.field.is-invalid')) validateControl(el); });
    el.addEventListener('change', () => { if (tried) validateControl(el); });
  });
  groups.forEach(g => g.addEventListener('change', () => { if (tried) validateGroup(g); }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    tried = true;
    let firstInvalid = null;
    controls.forEach(el => { if (!validateControl(el) && !firstInvalid) firstInvalid = el; });
    groups.forEach(g => { if (!validateGroup(g) && !firstInvalid) firstInvalid = g.querySelector('input'); });
    // Volgorde in de pagina respecteren voor de focus
    const invalid = Array.from(form.querySelectorAll('[aria-invalid="true"], .form-fieldset.is-invalid input'));
    if (invalid.length) firstInvalid = invalid[0];
    if (firstInvalid){
      firstInvalid.focus({ preventScroll:true });
      firstInvalid.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    sendForm(form);
  });
});

function readableFields(form){
  const data = new FormData(form);
  const lines = [];
  const seen = new Set();
  for (const [name] of data){
    if (name === '_gotcha' || seen.has(name)) continue;
    seen.add(name);
    const el = form.querySelector(`[name="${name}"]`);
    // Toon wat de bezoeker zag (bv. "Nog te bepalen"), niet de interne waarde
    let values;
    if (el && el.tagName === 'SELECT') values = Array.from(el.selectedOptions).map(o => o.textContent.trim());
    else if (el && (el.type === 'checkbox' || el.type === 'radio'))
      values = Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map(i => (i.closest('label') || i).textContent.trim() || i.value);
    else values = data.getAll(name).map(v => String(v).trim());
    values = values.filter(Boolean);
    if (!values.length) continue;
    let label = name;
    const own = el && el.id && form.querySelector(`label[for="${el.id}"]`);
    if (own) label = own.childNodes[0].textContent;
    else {
      const group = el && el.closest('.form-fieldset');
      const title = group && group.querySelector('.fieldset-title');
      if (title) label = title.childNodes[0].textContent;
    }
    label = label.replace('*', '').trim();
    lines.push(`${label}: ${values.join(', ')}`);
  }
  return lines;
}

function showSuccess(form, viaMail){
  const successEl = document.getElementById(form.dataset.success);
  form.classList.add('is-submitted');
  if (!successEl) return;
  if (viaMail){
    const h = successEl.querySelector('h3'), p = successEl.querySelector('p');
    if (h) h.textContent = 'Nog één klik: verstuur de e-mail.';
    if (p) p.innerHTML = `Je e-mailprogramma opent met je bericht al ingevuld. Druk daar op verzenden. Opent er niets? Mail ons dan rechtstreeks op <a href="mailto:${MAIL_TO}" style="text-decoration:underline">${MAIL_TO}</a> of bel <a href="tel:+32471861171" style="text-decoration:underline">+32 471 86 11 71</a>.`;
  }
  successEl.classList.add('is-visible');
  successEl.focus({ preventScroll:true });
  successEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
}

async function sendForm(form){
  const alertEl = form.querySelector('.form-alert');
  const btn = form.querySelector('.form-submit');
  if (alertEl) alertEl.hidden = true;

  // Spamval ingevuld? Doe alsof alles goed ging, maar verstuur niets.
  const trap = form.querySelector('[name="_gotcha"]');
  if (trap && trap.value) { showSuccess(form, false); return; }

  const endpoint = (form.dataset.endpoint || '').trim();
  const isOfferte = form.id === 'offerte-form';

  if (!endpoint){
    const subject = isOfferte ? 'Offerteaanvraag via buroscott.be' : 'Bericht via buroscott.be';
    const body = readableFields(form).join('\n');
    window.location.href = `mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showSuccess(form, true);
    return;
  }

  const label = btn && btn.querySelector('span');
  const original = label ? label.textContent : '';
  if (btn){ btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  if (label) label.textContent = 'Bezig met versturen…';
  try {
    const res = await fetch(endpoint, { method:'POST', body:new FormData(form), headers:{ Accept:'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    showSuccess(form, false);
  } catch (err) {
    if (alertEl){
      alertEl.innerHTML = `Het versturen is niet gelukt. Controleer je internetverbinding en probeer opnieuw, of mail ons op <a href="mailto:${MAIL_TO}">${MAIL_TO}</a> of bel <a href="tel:+32471861171">+32 471 86 11 71</a>.`;
      alertEl.hidden = false;
    }
  } finally {
    if (btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); }
    if (label) label.textContent = original;
  }
}

/* ---- Offerteformulier: dienst/pakket voorinvullen op basis van waar de bezoeker vandaan komt ---- */
(function prefillOfferteForm(){
  const form = document.getElementById('offerte-form');
  if (!form) return;
  const params = new URLSearchParams(window.location.search);

  const dienst = params.get('dienst');
  if (dienst) {
    const checkbox = form.querySelector(`input[name="diensten"][value="${dienst}"]`);
    if (checkbox) checkbox.checked = true;
  }

  const pakket = params.get('pakket');
  if (pakket) {
    const radio = form.querySelector(`input[name="pakket"][value="${pakket}"]`);
    if (radio) radio.checked = true;
  }
})();

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---- Scroll reveal ----
   Foto's met .reveal-img zijn bij de start weggeknipt (clip-path), en de browser
   ziet ze dan als onzichtbaar. Daarom volgen we voor die foto's het omliggende element. */
const revealEls = document.querySelectorAll('[data-reveal], .reveal-img');

if (prefersReduced || !('IntersectionObserver' in window)) {
  revealEls.forEach(el => el.classList.add('is-visible'));
} else {
  const targets = new Map(); // waargenomen element -> elementen die zichtbaar moeten worden
  revealEls.forEach(el => {
    const watch = el.classList.contains('reveal-img') ? el.parentElement : el;
    if (!targets.has(watch)) targets.set(watch, []);
    targets.get(watch).push(el);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        (targets.get(entry.target) || []).forEach(el => el.classList.add('is-visible'));
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((_, watch) => io.observe(watch));
}

/* ---- Zwevende navigatie: blijft nu altijd zichtbaar, ongeacht scrollrichting.
   De onderste pagina-blur (.bottom-page-blur) zorgt dat de nav er toch
   duidelijk bovenuit blijft springen over tekst of kaarten. ---- */
let mobileMenuIsOpen = false; // gedeeld met het hamburgermenu hieronder

/* ---- Mobiel hamburgermenu ---- */
const navToggle = document.getElementById('nav-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');

if (navToggle && mobileMenu && mobileMenuBackdrop) {
  const closeMenu = () => {
    mobileMenuIsOpen = false;
    navToggle.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('is-open');
    mobileMenuBackdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  };
  const openMenu = () => {
    mobileMenuIsOpen = true;
    navToggle.setAttribute('aria-expanded', 'true');
    mobileMenu.classList.add('is-open');
    mobileMenuBackdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden'; // achtergrond niet laten meescrollen
  };

  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMenu() : openMenu();
  });
  mobileMenuBackdrop.addEventListener('click', closeMenu);
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 680) closeMenu(); });
}

/* ---- Actieve link in de zwevende navigatie (optioneel, licht) ---- */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.floating-nav a');

if (sections.length && navLinks.length) {
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
      }
    });
  }, { threshold: 0.5 });

  sections.forEach(s => navIo.observe(s));
}

/* ---- Hero-achtergrond: BURO/SCOTT-kolommen exact op maat ---- */
function setupHeroMarquee() {
  const sides = document.querySelectorAll('.marq-side[data-word]');
  if (!sides.length) return;

  function buildSide(side) {
    const word = side.dataset.word;
    const inner = side.querySelector('.marq-inner');
    if (!inner || !word) return;

    const containerWidth = side.getBoundingClientRect().width;
    const containerHeight = side.getBoundingClientRect().height;
    if (!containerWidth || !containerHeight) return;

    // Meet hoe breed het woord is bij een neutrale referentiegrootte,
    // zodat we exact weten hoeveel we moeten opschalen om de kolom te vullen.
    const REF_SIZE = 100;
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.style.fontFamily = getComputedStyle(inner).fontFamily;
    probe.style.fontWeight = '900';
    probe.style.textTransform = 'uppercase';
    probe.style.letterSpacing = '-0.02em';
    probe.style.fontSize = REF_SIZE + 'px';
    probe.textContent = word;
    document.body.appendChild(probe);
    const measuredWidth = probe.getBoundingClientRect().width || REF_SIZE;
    document.body.removeChild(probe);

    const fontSizePx = (containerWidth / measuredWidth) * REF_SIZE;
    const lineHeightPx = fontSizePx * 0.88;

    // Genoeg herhalingen zodat de kolom, ook tijdens het lopen, altijd
    // volledig gevuld blijft (minstens 2x de zichtbare hoogte).
    const neededSpans = Math.max(6, Math.ceil((containerHeight * 2.3) / lineHeightPx) + 2);

    inner.style.setProperty('--marq-font-size', fontSizePx + 'px');
    inner.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < neededSpans; i++) {
      const span = document.createElement('span');
      span.textContent = word;
      frag.appendChild(span);
    }
    inner.appendChild(frag);
  }

  function buildAll() {
    sides.forEach(buildSide);
  }

  buildAll();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildAll, 150);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(buildAll);
  }
}
setupHeroMarquee();

/* ---- Hero: wit vlak krimpt bij het scrollen, achtergrond komt tevoorschijn ---- */
const heroSection = document.querySelector('.hero');
const heroPanel = document.querySelector('.hero-panel');
const heroTitle = document.querySelector('.hero-title');

function clampPx(vwFraction, minPx, maxPx) {
  return Math.min(Math.max(window.innerWidth * vwFraction, minPx), maxPx);
}

if (heroSection && heroPanel && !prefersReduced) {
  const MIN_SCALE = 0.5;   // limiet: het vlak krimpt nooit voorbij de helft van zijn grootte
  const RADIUS_PX = 28;    // vaste, niet-schalende hoekradius — zo blijft het vlak rechthoekig i.p.v. ovaal

  let ticking = false;

  function updateHero() {
    ticking = false;

    // Vastgezet (sticky) tijdens de volledige hoogte van .hero; de krimp
    // volgt de scroll-voortgang door die vastgezette periode.
    const rect = heroSection.getBoundingClientRect();
    const scrollDistance = heroSection.offsetHeight - window.innerHeight;
    if (scrollDistance <= 0) return;

    const scrolled = -rect.top;
    let progress = scrolled / scrollDistance;
    progress = Math.min(Math.max(progress, 0), 1);

    const eased = progress * progress * (3 - 2 * progress); // smoothstep

    const startW = window.innerWidth;
    const startH = window.innerHeight;
    const scale = 1 - eased * (1 - MIN_SCALE);

    heroPanel.style.width = (startW * scale) + 'px';
    heroPanel.style.height = (startH * scale) + 'px';
    heroPanel.style.borderRadius = (eased * RADIUS_PX) + 'px'; // vaste px-waarde, geen %
    // Geen inline transform hier: de CSS-regel translate(-50%, -50%) houdt
    // het vlak altijd exact gecentreerd, ook terwijl het van grootte verandert.

    if (heroTitle) {
      const startFont = clampPx(0.11, 41.6, 128);
      heroTitle.style.fontSize = (startFont * scale) + 'px';
    }
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateHero);
      ticking = true;
    }
  }

  updateHero();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateHero);
} else if (heroSection && heroPanel && prefersReduced) {
  heroPanel.style.width = Math.min(760, window.innerWidth * 0.9) + 'px';
  heroPanel.style.height = Math.min(460, window.innerHeight * 0.62) + 'px';
  heroPanel.style.borderRadius = '28px';
  heroSection.style.height = '100svh';
  if (heroTitle) {
    heroTitle.style.fontSize = clampPx(0.07, 32, 73.6) + 'px';
  }
}

/* ============================================================
   EXTRA'S (2026): leesvoortgang, navigatie die wegglijdt,
   introtekst die woord per woord inkleurt, gloed op dienstenkaarten
   en een magnetische slotknop. Alles respecteert "beweging beperken".
============================================================ */

/* ---- Leesvoortgang + navigatie verbergen bij naar beneden scrollen ---- */
(function scrollUi(){
  const bar = document.querySelector('.scroll-progress');
  const nav = document.getElementById('site-nav');
  let lastY = window.scrollY;
  let ticking = false;

  function update(){
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.setProperty('--progress', max > 0 ? Math.min(y / max, 1) : 0);

    if (nav){
      const navHasFocus = nav.contains(document.activeElement);
      const nearBottom = y > max - 80;
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      if (goingDown && y > 240 && !mobileMenuIsOpen && !navHasFocus && !nearBottom){
        nav.classList.add('is-hidden');
        document.body.classList.add('nav-is-hidden');
      } else if (goingUp || y < 240 || nearBottom){
        nav.classList.remove('is-hidden');
        document.body.classList.remove('nav-is-hidden');
      }
    }
    if (Math.abs(y - lastY) > 4) lastY = y;
  }
  window.addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }, { passive:true });
  // Toetsenbord: zodra iets in de navigatie focus krijgt, komt ze terug
  if (nav) nav.addEventListener('focusin', () => {
    nav.classList.remove('is-hidden');
    document.body.classList.remove('nav-is-hidden');
  });
  update();
})();

/* ---- Introtekst: woord per woord inkleuren tijdens het scrollen ---- */
(function introWords(){
  const el = document.querySelector('.intro-text');
  if (!el || prefersReduced) return;
  const accentWords = ['Buro', 'Scott'];
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', words.join(' '));
  el.innerHTML = words.map(w => {
    const clean = w.replace(/[.,]/g, '');
    const cls = accentWords.includes(clean) ? 'w is-accent' : 'w';
    return `<span class="${cls}" aria-hidden="true">${w}</span>`;
  }).join(' ');
  const spans = el.querySelectorAll('.w');
  let ticking = false;
  function update(){
    ticking = false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // Start als de tekst op 85% van het scherm staat, klaar als ze op 40% staat
    const start = vh * 0.85, end = vh * 0.40;
    const p = Math.min(Math.max((start - r.top) / (start - end + r.height * 0.5), 0), 1);
    const n = Math.round(p * spans.length);
    spans.forEach((s, i) => s.classList.toggle('is-on', i < n));
  }
  window.addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }, { passive:true });
  window.addEventListener('resize', update);
  update();
})();

/* ---- Dienstenkaarten: blauwe gloed volgt de muis ---- */
document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
});

/* ---- Slotknop "Vraag een offerte aan": trekt licht naar de muis toe ---- */
(function magnetic(){
  const btn = document.querySelector('.closing-cta');
  if (!btn || prefersReduced || !window.matchMedia('(hover: hover)').matches) return;
  btn.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * 0.25;
    const y = (e.clientY - (r.top + r.height / 2)) * 0.35;
    btn.style.setProperty('--tx', x + 'px');
    btn.style.setProperty('--ty', y + 'px');
  });
  btn.addEventListener('pointerleave', () => {
    btn.style.setProperty('--tx', '0px');
    btn.style.setProperty('--ty', '0px');
  });
})();
