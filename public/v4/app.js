/* The Grand Canal — single page behaviour. No dependencies. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Fixed header: offset the page and anchor jumps by its real height. */
  var hdr = document.getElementById('hdr');
  function syncHeader() {
    var h = hdr.offsetHeight;
    document.body.style.paddingTop = h + 'px';
    doc.style.setProperty('--header-h', (h + 12) + 'px');
    doc.style.setProperty('--hdr-h', h + 'px');
  }
  syncHeader();
  window.addEventListener('resize', syncHeader);
  if ('ResizeObserver' in window) new ResizeObserver(syncHeader).observe(hdr);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHeader);

  /* Section nav: mark the section in view. */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var current = null;
  function setCurrent(id) {
    if (id === current) return;
    current = id;
    links.forEach(function (a) { a.removeAttribute('aria-current'); });
    var a = byId[id];
    if (!a) { links[0].parentNode.scrollTo({ left: 0, behavior: reduced ? 'auto' : 'smooth' }); }
    if (a) {
      a.setAttribute('aria-current', 'true');
      var row = a.parentNode;
      if (row.scrollWidth > row.clientWidth) {
        row.scrollTo({ left: a.offsetLeft - 16, behavior: reduced ? 'auto' : 'smooth' });
      }
    }
  }

  /* Hero + canal stage: on wide screens the stage pins while the page scrolls.
     Hold, then the hero text slides up and out, the canal text slides in from
     below and the photo crossfades; then hold again. Phones and reduced motion
     get the two scenes stacked, with no pinning. */
  var track = document.querySelector('[data-stage]');
  var stage = track ? track.querySelector('.stage') : null;
  var scenes = track ? Array.prototype.slice.call(track.querySelectorAll('[data-scene]')) : [];
  var steps = track ? Array.prototype.slice.call(track.querySelectorAll('.stage__steps span')) : [];
  var stageState = { pinned: false, p: 0 };
  var wideMq = window.matchMedia('(min-width: 961px) and (min-height: 600px)');
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function setScene(el, to, io, dir) {
    el.style.setProperty('--to', to.toFixed(3));
    el.style.setProperty('--io', io.toFixed(3));
    el.style.setProperty('--dir', dir);
    el.querySelector('.scene__inner').style.visibility = to < 0.02 ? 'hidden' : '';
  }
  function stageUpdate() {
    if (!stageState.pinned) return;
    var r = track.getBoundingClientRect();
    var scrollable = r.height - stage.offsetHeight;
    var p = scrollable > 0 ? clamp01((hdr.offsetHeight - r.top) / scrollable) : 0;
    stageState.p = p;
    var A = 0.36, M = 0.5, B = 0.64;          // hold 0-36%, shuffle 36-64%, hold 64-100%
    var leave = smooth((p - A) / (M - A));     // hero text out (first half)
    var enter = smooth((p - M) / (B - M));     // canal text in (second half)
    var swap = smooth((p - A) / (B - A));      // photo crossfade (whole window)
    setScene(scenes[0], 1 - leave, 1, -1);
    setScene(scenes[1], enter, swap, 1);
    steps[0].classList.toggle('is-on', p < M);
    steps[1].classList.toggle('is-on', p >= M);
  }
  function stageSetup() {
    if (!track) return;
    var want = !reduced && wideMq.matches;
    track.classList.toggle('is-pinned', want);
    stageState.pinned = want;
    if (want) {
      // If either text block cannot fit the stage at this window size, do not pin.
      var tooTall = scenes.some(function (sc) {
        var t = sc.querySelector('.scene__text');
        return t.scrollHeight > t.clientHeight + 2;
      });
      if (tooTall) { track.classList.remove('is-pinned'); stageState.pinned = false; }
    }
    if (!stageState.pinned) {
      scenes.forEach(function (sc) {
        ['--to', '--io', '--dir'].forEach(function (k) { sc.style.removeProperty(k); });
        sc.querySelector('.scene__inner').style.visibility = '';
      });
    }
    stageUpdate();
  }
  stageSetup();
  window.addEventListener('resize', stageSetup);
  if (wideMq.addEventListener) wideMq.addEventListener('change', stageSetup);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(stageSetup);

  /* Pinned CTA: on when the hero buttons are gone, off at the visit section. */
  var pin = document.getElementById('pin');
  var heroCtas = document.querySelector('.scene--hero .btn-row');
  var visit = document.getElementById('visit');
  var sections = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight;
      stageUpdate();
      revealCheck();
      var heroGone = stageState.pinned ? stageState.p > 0.42 : heroCtas.getBoundingClientRect().bottom < hdr.offsetHeight;
      var v = visit.getBoundingClientRect();
      var visitInView = v.top < vh * 0.85 && v.bottom > 0;
      hdr.classList.toggle('show-cta', heroGone);   // one filled visit button per view: hero first, then header
      pin.classList.toggle('is-on', heroGone && !visitInView);

      var line = hdr.offsetHeight + vh * 0.3;
      var found = null;
      sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) found = s.id; });
      if (visitInView && v.top < line) found = null;
      setCurrent(found);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* Reveal on scroll (one motion style: fade and rise). */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  function revealCheck() {
    if (!reveals) return;
    var vh = window.innerHeight;
    reveals.forEach(function (n) {
      if (!n.classList.contains('is-in') && n.getBoundingClientRect().top < vh * 0.95) n.classList.add('is-in');
    });
  }
  setTimeout(revealCheck, 600);
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (n) { n.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (n) { io.observe(n); });
    // Anchor jumps can skip past sections; show anything already above the viewport.
    window.addEventListener('hashchange', function () {
      reveals.forEach(function (n) { if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add('is-in'); });
    });
  }

  /* Menu tabs (ARIA tabs pattern, arrow keys move between tabs). */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(n, true);
      }
    });
  });

  /* Suite dialogs: open from buttons, close with the X, Esc or a backdrop click. */
  document.querySelectorAll('[data-open]').forEach(function (btn) {
    var dlg = document.getElementById(btn.getAttribute('data-open'));
    if (!dlg || typeof dlg.showModal !== 'function') { btn.hidden = true; return; }
    btn.addEventListener('click', function () { dlg.showModal(); });
  });
  document.querySelectorAll('dialog.sheet').forEach(function (dlg) {
    dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  });

  /* Gallery focus screen: one large photo, a thumbnail rail below, filters on top.
     Chevrons, arrow keys and swipe move through; the expand button (or a click on
     the photo) opens the full-screen viewer at the same photo. */
  var gal = document.getElementById('gal');
  var galCount = document.getElementById('gal-count');
  var focusEl = document.querySelector('[data-focus]');
  var fLayers = Array.prototype.slice.call(focusEl.querySelectorAll('.focus__img'));
  var fCap = document.getElementById('focus-cap');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var galItems = Array.prototype.slice.call(gal.querySelectorAll('li'));
  var fList = [], fIndex = 0, fToken = 0, fBusyT = 0;
  var fScreen = focusEl.querySelector('.focus__screen');
  var fWarm = {};
  function preloadAround(i) {
    [i + 1, i - 1].forEach(function (k) {
      var n = fList[(k + fList.length) % fList.length];
      var src = n && n.getAttribute('data-full');
      if (src && !fWarm[src]) { fWarm[src] = true; (new Image()).src = src; }
    });
  }
  function visibleItems() {
    return galItems.filter(function (li) { return !li.hidden; }).map(function (li) { return li.querySelector('.gal__item'); });
  }
  function setFocus(i, instant) {
    if (!fList.length) return;
    fIndex = (i + fList.length) % fList.length;
    var b = fList[fIndex];
    var src = b.getAttribute('data-full'), cap = b.getAttribute('data-caption');
    fCap.textContent = cap;
    galCount.textContent = (fIndex + 1) + ' of ' + fList.length;
    fList.forEach(function (x) { if (x === b) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
    var li = b.parentNode;
    gal.scrollTo({ left: li.offsetLeft - gal.clientWidth / 2 + li.offsetWidth / 2, behavior: reduced || instant ? 'auto' : 'smooth' });
    var on = fLayers[0].classList.contains('is-on') ? fLayers[0] : fLayers[1];
    if (on.getAttribute('src') === src) return;
    var next = on === fLayers[0] ? fLayers[1] : fLayers[0];
    var token = ++fToken;
    clearTimeout(fBusyT);
    fBusyT = setTimeout(function () { fScreen.setAttribute('aria-busy', 'true'); }, 150);
    next.onload = function () {
      if (token !== fToken) return;            // a newer photo was chosen meanwhile
      clearTimeout(fBusyT);
      fScreen.removeAttribute('aria-busy');
      next.classList.add('is-on');
      on.classList.remove('is-on');
      preloadAround(fIndex);
    };
    next.alt = cap;
    next.src = src;
    if (next.complete && next.naturalWidth) next.onload();
  }
  fList = visibleItems();
  setFocus(0, true);

  gal.addEventListener('click', function (e) {
    var b = e.target.closest('.gal__item');
    if (b) setFocus(fList.indexOf(b));
  });
  focusEl.querySelectorAll('[data-fstep]').forEach(function (btn) {
    btn.addEventListener('click', function () { setFocus(fIndex + Number(btn.getAttribute('data-fstep'))); });
  });
  focusEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); setFocus(fIndex + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setFocus(fIndex - 1); }
  });
  var fTouchX = null;
  var screen = focusEl.querySelector('.focus__screen');
  screen.addEventListener('touchstart', function (e) { fTouchX = e.touches[0].clientX; }, { passive: true });
  screen.addEventListener('touchend', function (e) {
    if (fTouchX === null) return;
    var dx = e.changedTouches[0].clientX - fTouchX;
    if (Math.abs(dx) > 50) setFocus(fIndex + (dx < 0 ? 1 : -1));
    fTouchX = null;
  });
  filters.forEach(function (f) {
    f.addEventListener('click', function () {
      var cat = f.getAttribute('data-filter');
      filters.forEach(function (o) { o.setAttribute('aria-pressed', o === f ? 'true' : 'false'); });
      galItems.forEach(function (li) { li.hidden = !(cat === 'all' || li.getAttribute('data-cat') === cat); });
      fList = visibleItems();
      setFocus(0);
    });
  });

  var viewer = document.getElementById('viewer');
  var vImg = document.getElementById('viewer-img');
  var vCap = document.getElementById('viewer-cap');
  var vCount = document.getElementById('viewer-count');
  var vIndex = 0, vOpener = null;
  function show(i) {
    vIndex = (i + fList.length) % fList.length;
    var b = fList[vIndex];
    vImg.src = b.getAttribute('data-full');
    vImg.alt = b.getAttribute('data-caption');
    vCap.textContent = b.getAttribute('data-caption');
    vCount.textContent = (vIndex + 1) + ' of ' + fList.length;
  }
  function openViewer(opener) {
    if (!viewer || typeof viewer.showModal !== 'function') {
      window.open(fList[fIndex].getAttribute('data-full'), '_blank', 'noopener');
      return;
    }
    vOpener = opener;
    show(fIndex);
    viewer.showModal();
  }
  focusEl.querySelector('[data-fexpand]').addEventListener('click', function (e) { openViewer(e.currentTarget); });
  fLayers.forEach(function (img) { img.addEventListener('click', function () { openViewer(focusEl.querySelector('[data-fexpand]')); }); });
  if (viewer && typeof viewer.showModal === 'function') {
    viewer.querySelectorAll('[data-step]').forEach(function (btn) {
      btn.addEventListener('click', function () { show(vIndex + Number(btn.getAttribute('data-step'))); });
    });
    viewer.querySelector('[data-close]').addEventListener('click', function () { viewer.close(); });
    viewer.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(vIndex + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(vIndex - 1); }
    });
    var touchX = null;
    viewer.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(vIndex + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    viewer.addEventListener('close', function () {
      vImg.removeAttribute('src');
      setFocus(vIndex, true);                 // the focus screen follows the viewer
      if (vOpener) vOpener.focus();
    });
  }

  /* Sideways rails: chevrons step one card; each greys out at its end. */
  document.querySelectorAll('.rail').forEach(function (rail) {
    var prev = document.querySelector('[data-rail-prev="' + rail.id + '"]');
    var next = document.querySelector('[data-rail-next="' + rail.id + '"]');
    if (!prev || !next) return;
    function stepSize() {
      var first = rail.firstElementChild;
      var gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      return first ? first.getBoundingClientRect().width + gap : rail.clientWidth * 0.8;
    }
    function sync() {
      var max = rail.scrollWidth - rail.clientWidth - 2;
      prev.setAttribute('aria-disabled', rail.scrollLeft <= 2 ? 'true' : 'false');
      next.setAttribute('aria-disabled', rail.scrollLeft >= max ? 'true' : 'false');
    }
    function go(dir, btn) {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      rail.scrollBy({ left: dir * stepSize(), behavior: reduced ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1, prev); });
    next.addEventListener('click', function () { go(1, next); });
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });

  /* Request-a-call form. Sends JSON to data-endpoint when one is set; otherwise
     tells the visitor to call, because there is no backend yet. */
  var form = document.getElementById('call-form');
  var msg = document.getElementById('form-msg');
  var submit = form.querySelector('button[type="submit"]');
  var label = submit.querySelector('span');
  var icon = submit.querySelector('use');
  var busy = false;

  function setError(input, text) {
    var field = input.closest('.field');
    document.getElementById(input.getAttribute('aria-describedby')).textContent = text || '';
    if (text) { field.setAttribute('data-invalid', ''); input.setAttribute('aria-invalid', 'true'); }
    else { field.removeAttribute('data-invalid'); input.removeAttribute('aria-invalid'); }
  }
  function validate() {
    var name = form.elements.name, phone = form.elements.phone, ok = true;
    if (name.value.trim().length < 2) { setError(name, 'Please enter your name.'); ok = false; } else setError(name);
    var digits = phone.value.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) { setError(phone, 'Please enter a 10-digit phone number.'); ok = false; } else setError(phone);
    if (!ok) form.querySelector('[aria-invalid="true"]').focus();
    return ok;
  }
  function escapeHtml(t) {
    return t.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function setState(state, text, tone) {
    submit.setAttribute('data-state', state);
    if (state === 'loading') {
      submit.setAttribute('aria-disabled', 'true');
      icon.setAttribute('href', '#i-loader');
      icon.parentNode.classList.add('spin');
      label.textContent = 'Sending…';
    } else {
      submit.removeAttribute('aria-disabled');
      icon.parentNode.classList.remove('spin');
      icon.setAttribute('href', state === 'success' ? '#i-check' : '#i-phone');
      label.textContent = state === 'success' ? 'Request sent' : 'Request a call';
    }
    if (text) { msg.innerHTML = text; }
    if (tone) msg.setAttribute('data-tone', tone); else msg.removeAttribute('data-tone');
  }

  ['name', 'phone'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () {
      if (form.elements[n].hasAttribute('aria-invalid')) validate();
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) {
      msg.textContent = 'Your request is still sending. Please wait a moment.';
      return;
    }
    if (submit.getAttribute('data-state') === 'success') return;
    if (!validate()) return;
    if (form.elements.website.value) return; // honeypot: quietly ignore bots

    var endpoint = form.getAttribute('data-endpoint');
    if (!endpoint) {
      var first = form.elements.name.value.trim().split(/\s+/)[0];
      setState('idle', 'Thank you, ' + escapeHtml(first) + '. The quickest way to book a visit is a call. <a class="btn btn--line on-dark form__call" href="tel:+12894800125">Call 289·480·0125</a>');
      return;
    }
    busy = true;
    setState('loading', 'Sending your request…');
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        for: form.elements['for'].value
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setState('success', 'Thank you. We will call you to arrange a time.');
      form.querySelectorAll('input, select').forEach(function (el) { el.disabled = true; });
    }).catch(function () {
      setState('idle', 'Your request could not be sent. Please try again, or call <a href="tel:+12894800125">289·480·0125</a>.', 'error');
    }).then(function () { busy = false; });
  });
})();
