(function () {
  const { SENTENCES } = window.SITE_CONFIG || {};
  if (!Array.isArray(SENTENCES) || SENTENCES.length === 0) return;

  const container = document.getElementById('sentences');
  if (!container) return;

  const total = SENTENCES.length;
  const nodes = SENTENCES.map((text, index) => {
    const sentence = document.createElement('p');
    sentence.className = 'sentence';
    sentence.textContent = text;
    sentence.setAttribute('role', 'listitem');
    sentence.setAttribute('aria-setsize', String(total));
    sentence.setAttribute('aria-posinset', String(index + 1));
    container.appendChild(sentence);
    return sentence;
  });

  const revealed = new Set();
  let activeIndex = -1;
  let ticking = false;

  function applyStates(currentIndex) {
    nodes.forEach((node, index) => {
      const isActive = index === currentIndex;
      const isPast = index < currentIndex;
      const hasBeenRevealed = revealed.has(index) || isPast || isActive;

      if (isPast) {
        revealed.add(index);
      }

      node.classList.toggle('is-active', isActive);
      node.classList.toggle('is-past', isPast);
      node.classList.toggle('is-visible', hasBeenRevealed);

      if (!hasBeenRevealed) {
        node.classList.remove('is-past', 'is-active');
      }
    });
  }

  function updateActiveSentence() {
    const viewportCenter = window.innerHeight / 2;
    let closestIndex = -1;
    let smallestDistance = Infinity;

    nodes.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const nodeCenter = rect.top + rect.height / 2;
      const distance = Math.abs(nodeCenter - viewportCenter);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex === -1) return;

    if (!revealed.has(closestIndex)) {
      revealed.add(closestIndex);
    }

    if (activeIndex !== closestIndex) {
      activeIndex = closestIndex;
      applyStates(activeIndex);
    }
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateActiveSentence();
    });
  }

  updateActiveSentence();
  requestAnimationFrame(updateActiveSentence);

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
})();

(function () {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.getElementById('site-menu');
  if (!toggle || !menu) return;

  const menuContainer = menu.querySelector('.site-menu__container');
  const closeTargets = menu.querySelectorAll('[data-menu-close]');
  const menuLinks = menu.querySelectorAll('[data-menu-link]');
  const initialFocus = menu.querySelector('[data-menu-focus]');

  const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];

  let lastFocusedElement = null;
  let hideTimeoutId = null;
  let pendingTransitionHandler = null;

  function getFocusableElements() {
    return Array.from(menu.querySelectorAll(FOCUSABLE_SELECTORS.join(','))).filter((element) => {
      if (element.hasAttribute('disabled')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      if (element.hasAttribute('hidden')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function setExpandedState(isExpanded) {
    toggle.setAttribute('aria-expanded', String(isExpanded));
    toggle.setAttribute('aria-label', isExpanded ? 'Close menu' : 'Open menu');
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (
      document.body.classList.contains('has-menu-open') &&
      toggle instanceof HTMLElement &&
      !toggle.hasAttribute('disabled')
    ) {
      const rect = toggle.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        focusable.push(toggle);
      }
    }
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first || !menu.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    trapFocus(event);
  }

  function focusInitialElement() {
    const candidates = [];
    if (initialFocus instanceof HTMLElement) {
      candidates.push(initialFocus);
    }
    if (menuContainer instanceof HTMLElement) {
      candidates.push(menuContainer);
    }
    candidates.push(...getFocusableElements());

    const target = candidates.find((element) => typeof element.focus === 'function');
    if (!target) return;

    requestAnimationFrame(() => {
      target.focus();
    });
  }

  function openMenu() {
    if (document.body.classList.contains('has-menu-open')) return;
    if (document.body.classList.contains('is-menu-closing')) return;

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (hideTimeoutId !== null) {
      window.clearTimeout(hideTimeoutId);
      hideTimeoutId = null;
    }

    if (pendingTransitionHandler) {
      menu.removeEventListener('transitionend', pendingTransitionHandler);
      pendingTransitionHandler = null;
    }

    document.body.classList.remove('is-menu-closing');

    menu.hidden = false;
    menu.removeAttribute('hidden');
    menu.setAttribute('aria-hidden', 'false');

    // Ensure the opening opacity transition runs after the element becomes visible.
    menu.classList.remove('is-open');
    void menu.offsetWidth;

    menu.classList.add('is-open');
    document.body.classList.add('has-menu-open');

    setExpandedState(true);
    focusInitialElement();

    document.addEventListener('keydown', handleKeydown);
  }

  function closeMenu({ focusToggle = true } = {}) {
    if (!document.body.classList.contains('has-menu-open')) return;
    if (document.body.classList.contains('is-menu-closing')) return;

    document.body.classList.add('is-menu-closing');
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    setExpandedState(false);
    document.removeEventListener('keydown', handleKeydown);

    const finalizeHide = () => {
      menu.setAttribute('hidden', '');
      menu.hidden = true;
      document.body.classList.remove('is-menu-closing');
      document.body.classList.remove('has-menu-open');
    };

    const prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      finalizeHide();
      hideTimeoutId = null;
      pendingTransitionHandler = null;
    } else {
      const handleTransitionEnd = (event) => {
        if (event.target !== menu || event.propertyName !== 'opacity') return;
        menu.removeEventListener('transitionend', handleTransitionEnd);
        pendingTransitionHandler = null;
        if (document.body.classList.contains('is-menu-closing')) {
          finalizeHide();
        }
        hideTimeoutId = null;
      };

      menu.addEventListener('transitionend', handleTransitionEnd);
      pendingTransitionHandler = handleTransitionEnd;
      hideTimeoutId = window.setTimeout(() => {
        if (pendingTransitionHandler) {
          menu.removeEventListener('transitionend', pendingTransitionHandler);
          pendingTransitionHandler = null;
        }
        if (document.body.classList.contains('is-menu-closing')) {
          finalizeHide();
        }
        hideTimeoutId = null;
      }, 500);
    }

    if (focusToggle) {
      const focusTarget =
        (lastFocusedElement && document.body.contains(lastFocusedElement)) ? lastFocusedElement : toggle;

      if (focusTarget && typeof focusTarget.focus === 'function') {
        requestAnimationFrame(() => {
          focusTarget.focus();
        });
      }
    }
  }

  toggle.addEventListener('click', () => {
    if (document.body.classList.contains('has-menu-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  closeTargets.forEach((element) => {
    element.addEventListener('click', () => {
      closeMenu();
    });
  });

  menuLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu({ focusToggle: false });
    });
  });
})();
