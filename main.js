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

/* ---- Formulieren (contact & offerte): front-end afhandeling.
   Er is geen backend gekoppeld — bij versturen tonen we een bevestiging.
   Koppel hier later een echte verwerker (bv. Formspree, eigen API) aan toe. ---- */
document.querySelectorAll('form[data-form]').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const successEl = document.getElementById(form.dataset.success);
    form.classList.add('is-submitted');
    if (successEl) {
      successEl.classList.add('is-visible');
      successEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
    }
  });
});

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

document.getElementById('year').textContent = new Date().getFullYear();

/* ---- Scroll reveal ---- */
const revealEls = document.querySelectorAll('[data-reveal]');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReduced) {
  revealEls.forEach(el => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  revealEls.forEach(el => io.observe(el));
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
