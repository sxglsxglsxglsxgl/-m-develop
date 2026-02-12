// Desktop: transform-based full-screen slides.
// Mobile (coarse pointer): native page scroll so browser bars can collapse naturally.
(function () {
  const sub = document.getElementById('heroSub');
  const burger = document.querySelector('.burger-bar');
  const track = document.getElementById('track');
  const dotsNav = document.getElementById('dots');
  if (!track || !dotsNav) return;

  const sections = Array.from(track.querySelectorAll('.slide'));
  const MOBILE_QUERY = '(max-width: 1024px) and (pointer: coarse)';

  let index = 0;
  let mode = 'desktop';
  let isAnimating = false;
  let startTouchY = null;
  let wheelAccum = 0;
  let lastNavAt = 0;
  let resizeRAF = null;
  let introApplied = false;
  let mobileScrollRAF = null;
  let sectionObserver = null;

  const WHEEL_THRESHOLD = 60;
  const NAV_COOLDOWN = 320;
  const TWEEN_MS = 450;
  const INTRO_FALLBACK_MS = 1800;
  const MOBILE_BAR_RESIZE_EPS = 120;

  let lastViewportW = window.innerWidth;
  let lastViewportH = window.innerHeight;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function vpHeight() {
    return (
      (window.visualViewport && Math.round(window.visualViewport.height)) ||
      window.innerHeight ||
      document.documentElement.clientHeight
    );
  }

  function setViewportVar() {
    document.documentElement.style.setProperty('--app-vh', `${vpHeight()}px`);
  }

  function isMobileMode() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function clampIndex(next) {
    return Math.max(0, Math.min(sections.length - 1, next));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function sectionTop(section) {
    return window.scrollY + section.getBoundingClientRect().top;
  }

  function nearestMobileIndex() {
    const probe = window.scrollY + vpHeight() * 0.35;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    sections.forEach((section, idx) => {
      const dist = Math.abs(sectionTop(section) - probe);
      if (dist < bestDist) {
        best = idx;
        bestDist = dist;
      }
    });

    return best;
  }

  function revealSection(nextIndex) {
    const current = sections[nextIndex];
    if (current && current.classList.contains('reveal')) {
      current.classList.add('is-visible');
    }
  }

  function clearMobileFrameFx() {
    sections.forEach((section) => {
      const frame = section.querySelector('.frame');
      if (!frame) return;
      frame.style.opacity = '';
      frame.style.transform = '';
    });
  }

  function updateMobileFrameFx() {
    if (mode !== 'mobile') return;
    const height = vpHeight();
    const mid = height * 0.5;
    const falloff = height * 0.62;

    sections.forEach((section) => {
      const frame = section.querySelector('.frame');
      if (!frame) return;

      const rect = section.getBoundingClientRect();
      const center = rect.top + rect.height * 0.5;
      const dist = center - mid;
      const ratio = Math.min(1, Math.abs(dist) / falloff);
      const opacity = 1 - ratio;
      const translateY = dist < 0 ? -24 * ratio : 24 * ratio;

      frame.style.opacity = `${opacity.toFixed(3)}`;
      frame.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;
    });
  }

  function updateDots() {
    const buttons = dotsNav.querySelectorAll('button');
    buttons.forEach((button, idx) => {
      button.setAttribute('aria-current', idx === index ? 'true' : 'false');
    });
  }

  function setIndex(nextIndex) {
    const clamped = clampIndex(nextIndex);
    if (clamped === index) return;
    index = clamped;
    revealSection(index);
    updateDots();
  }

  function layoutDesktop() {
    const height = vpHeight();
    track.style.height = `${sections.length * height}px`;
    sections.forEach((section, idx) => {
      section.style.position = 'absolute';
      section.style.top = `${idx * height}px`;
      section.style.left = '0';
      section.style.right = '0';
    });
    track.style.transform = `translate3d(0, ${-index * height}px, 0)`;
  }

  function tweenTo(targetIndex, duration = TWEEN_MS) {
    if (mode !== 'desktop' || isAnimating) return Promise.resolve();
    isAnimating = true;

    const start = performance.now();
    const height = vpHeight();
    const fromY = -index * height;
    const toY = -targetIndex * height;

    return new Promise((resolve) => {
      function frame(now) {
        const progress = Math.min(1, (now - start) / duration);
        const y = fromY + (toY - fromY) * easeInOutCubic(progress);
        track.style.transform = `translate3d(0, ${y}px, 0)`;

        if (progress < 1) {
          requestAnimationFrame(frame);
          return;
        }

        index = targetIndex;
        isAnimating = false;
        revealSection(index);
        updateDots();
        resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  function go(delta) {
    if (mode !== 'desktop') return;
    const now = performance.now();
    if (isAnimating || now - lastNavAt < NAV_COOLDOWN) return;

    const next = clampIndex(index + delta);
    if (next === index) return;

    lastNavAt = now;
    tweenTo(next).then(() => {
      lastNavAt = performance.now();
    });
  }

  function cleanupMobileObservers() {
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    window.removeEventListener('scroll', onMobileScroll, { passive: true });
    if (mobileScrollRAF) {
      cancelAnimationFrame(mobileScrollRAF);
      mobileScrollRAF = null;
    }
  }

  function syncMobileIndex() {
    const next = nearestMobileIndex();
    if (next !== index) {
      setIndex(next);
    } else {
      revealSection(index);
    }
    updateMobileFrameFx();
  }

  function onMobileScroll() {
    if (mode !== 'mobile') return;
    if (mobileScrollRAF) return;

    mobileScrollRAF = requestAnimationFrame(() => {
      mobileScrollRAF = null;
      syncMobileIndex();
    });
  }

  function setupMobileObservers() {
    cleanupMobileObservers();

    if ('IntersectionObserver' in window) {
      sectionObserver = new IntersectionObserver(
        (entries) => {
          let candidate = null;
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
              candidate = entry.target;
            }
            if (entry.isIntersecting && entry.target.classList.contains('reveal')) {
              entry.target.classList.add('is-visible');
            }
          });
          if (candidate) {
            const next = sections.indexOf(candidate);
            if (next >= 0) setIndex(next);
          }
        },
        { threshold: [0.45, 0.75] }
      );

      sections.forEach((section) => sectionObserver.observe(section));
    }
    window.addEventListener('scroll', onMobileScroll, { passive: true });
  }

  function enableMobileMode() {
    mode = 'mobile';
    isAnimating = false;
    document.body.classList.add('is-native-mobile');

    track.style.height = '';
    track.style.transform = '';
    sections.forEach((section) => {
      section.style.position = '';
      section.style.top = '';
      section.style.left = '';
      section.style.right = '';
      if (section.classList.contains('reveal')) {
        section.classList.add('is-visible');
      }
    });

    setupMobileObservers();
    syncMobileIndex();
  }

  function enableDesktopMode() {
    mode = 'desktop';
    document.body.classList.remove('is-native-mobile');
    cleanupMobileObservers();
    clearMobileFrameFx();

    index = clampIndex(nearestMobileIndex());
    window.scrollTo({ top: 0, behavior: 'auto' });
    layoutDesktop();
    revealSection(index);
    updateDots();
  }

  function applyMode(force) {
    const nextMode = isMobileMode() ? 'mobile' : 'desktop';
    if (!force && nextMode === mode) return;

    if (nextMode === 'mobile') enableMobileMode();
    else enableDesktopMode();
  }

  function onResize() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      const widthDelta = Math.abs(nextW - lastViewportW);
      const heightDelta = Math.abs(nextH - lastViewportH);

      if (mode === 'mobile' && widthDelta < 2 && heightDelta < MOBILE_BAR_RESIZE_EPS) {
        lastViewportW = nextW;
        lastViewportH = nextH;
        return;
      }

      lastViewportW = nextW;
      lastViewportH = nextH;
      setViewportVar();
      applyMode(false);
      if (mode === 'desktop' && !isAnimating) {
        layoutDesktop();
      } else if (mode === 'mobile') {
        syncMobileIndex();
      }
    });
  }

  function onWheel(event) {
    if (mode !== 'desktop') return;
    const now = performance.now();
    if (isAnimating || now - lastNavAt < NAV_COOLDOWN) return;

    wheelAccum += event.deltaY;
    if (Math.abs(wheelAccum) < WHEEL_THRESHOLD) return;

    const dir = wheelAccum > 0 ? +1 : -1;
    wheelAccum = 0;
    go(dir);
  }

  function onTouchStart(event) {
    if (mode !== 'desktop') return;
    if (event.touches && event.touches.length) {
      startTouchY = event.touches[0].clientY;
    }
  }

  function onTouchMove(event) {
    if (mode !== 'desktop') return;
    if (startTouchY == null || isAnimating) return;

    const dy = startTouchY - event.touches[0].clientY;
    if (Math.abs(dy) <= 30) return;

    event.preventDefault();
    startTouchY = null;
    go(dy > 0 ? +1 : -1);
  }

  function onTouchEnd() {
    startTouchY = null;
  }

  function onKeyDown(event) {
    const code = event.code;
    if (mode === 'desktop') {
      if (code === 'ArrowDown' || code === 'PageDown' || code === 'Space') {
        event.preventDefault();
        go(+1);
      } else if (code === 'ArrowUp' || code === 'PageUp') {
        event.preventDefault();
        go(-1);
      } else if (code === 'Home') {
        event.preventDefault();
        tweenTo(0);
      } else if (code === 'End') {
        event.preventDefault();
        tweenTo(sections.length - 1);
      }
      return;
    }

    if (mode === 'mobile') {
      if (code === 'Home') {
        event.preventDefault();
        sections[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (code === 'End') {
        event.preventDefault();
        sections[sections.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function buildDots() {
    dotsNav.innerHTML = '';
    sections.forEach((section, idx) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Go to slide ${idx + 1}`);
      button.addEventListener('click', () => {
        if (mode === 'mobile') {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (!isAnimating) tweenTo(idx);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          button.click();
        }
      });
      dotsNav.appendChild(button);
    });
    updateDots();
  }

  function armBurger() {
    if (!burger) return;
    burger.setAttribute('data-active', '1');
    burger.removeAttribute('tabindex');
    document.body.classList.add('burger-animate');
  }

  function unlockScroll() {
    document.body.classList.remove('is-locked');
  }

  function finalizeIntro() {
    if (introApplied) return;
    introApplied = true;
    buildDots();
    armBurger();
    unlockScroll();
    applyMode(true);
  }

  async function run() {
    setViewportVar();
    applyMode(true);
    revealSection(0);

    await sleep(200);
    if (sub) {
      sub.textContent = 'BORN IN SAINT PETERSBURG';
      sub.classList.remove('is-blur-intro');
      void sub.offsetWidth;
      sub.addEventListener('animationend', finalizeIntro, { once: true });
      requestAnimationFrame(() => sub.classList.add('is-blur-intro'));
      window.setTimeout(finalizeIntro, INTRO_FALLBACK_MS);
    } else {
      finalizeIntro();
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
