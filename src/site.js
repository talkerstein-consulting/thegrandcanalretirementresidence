// Replaces the handful of interactions the Wix runtime (several MB of JS) provided.
// The markup and CSS class names come straight from the captured Wix DOM.
(function () {
  'use strict';

  // Wix's own transition classes (from the captured CSS):
  //   enter: XWeqiF (opacity 0) -> + bWoigz (opacity 1, transitioned)
  //   exit:  HTrn1j (opacity 1) -> + sAGPNe (opacity 0, transitioned)
  var ENTER = 'XWeqiF', ENTER_ACTIVE = 'bWoigz', EXIT = 'HTrn1j', EXIT_ACTIVE = 'sAGPNe';
  var FADE_MS = 1000;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function crossfade(container, incoming, outgoing, done) {
    incoming.classList.add(ENTER);
    if (outgoing) outgoing.classList.add(EXIT);
    container.appendChild(incoming);
    void incoming.offsetWidth;
    incoming.classList.add(ENTER_ACTIVE);
    if (outgoing) outgoing.classList.add(EXIT_ACTIVE);
    setTimeout(function () {
      incoming.classList.remove(ENTER, ENTER_ACTIVE);
      if (outgoing && outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
      if (done) done();
    }, reduceMotion ? 0 : FADE_MS);
  }

  function warm(node) {
    // Start downloading a slide's images before it is shown.
    var imgs = node.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var im = new Image();
      if (imgs[i].sizes) im.sizes = imgs[i].sizes;
      if (imgs[i].srcset) im.srcset = imgs[i].srcset;
      im.src = imgs[i].src;
    }
  }

  // ---------------------------------------------------------------- slideshows
  // <template data-gc-slides="compId"> holds every slide, captured from the live site.
  function initSlideshow(tpl) {
    var root = tpl.parentElement;
    var wrapper = root.querySelector('[data-testid="slidesWrapper"]');
    var slides = Array.prototype.slice.call(tpl.content.children);
    var dots = Array.prototype.slice.call(root.querySelectorAll('nav a'));
    // Order slides by their dots (each dot's href names its slide); drop dots whose
    // slide is missing so dot i always shows slide i.
    var byId = {};
    slides.forEach(function (s) { byId[s.id] = s; });
    if (dots.length) {
      var ordered = [], kept = [];
      dots.forEach(function (a) {
        var s = byId[(a.getAttribute('href') || '').split('#')[1]];
        if (s) { ordered.push(s); kept.push(a); }
        else a.parentNode.style.display = 'none';
      });
      if (ordered.length) { slides = ordered; dots = kept; }
    }
    if (!wrapper || slides.length < 2) return;
    var current = 0, busy = false, timer = null, INTERVAL = 3000;
    var ACTIVE_DOT = 'JPnvZO';

    function go(i) {
      if (busy) return;
      i = (i + slides.length) % slides.length;
      if (i === current) return;
      busy = true;
      var outgoing = wrapper.firstElementChild;
      var incoming = slides[i].cloneNode(true);
      for (var d = 0; d < dots.length; d++) {
        dots[d].classList.toggle(ACTIVE_DOT, d === i);
        if (d === i) dots[d].setAttribute('aria-current', 'true');
        else dots[d].removeAttribute('aria-current');
      }
      crossfade(wrapper, incoming, outgoing, function () {
        busy = false;
        current = i;
        warm(slides[(i + 1) % slides.length]);
      });
    }
    function play() {
      stop();
      if (!reduceMotion) timer = setInterval(function () { go(current + 1); }, INTERVAL);
    }
    function stop() { if (timer) clearInterval(timer); timer = null; }

    var prev = root.querySelector('[data-testid="prevButton"]');
    var next = root.querySelector('[data-testid="nextButton"]');
    if (prev) prev.addEventListener('click', function () { go(current - 1); play(); });
    if (next) next.addEventListener('click', function () { go(current + 1); play(); });
    Array.prototype.forEach.call(dots, function (a, i) {
      a.addEventListener('click', function (e) { e.preventDefault(); go(i); play(); });
    });
    warm(slides[1]);
    play();
  }

  // Wix classic "slideshow" gallery (e.g. /our-services): every item exists as a hidden
  // "ghost"; the visible item is swapped with the same crossfade.
  function initGallerySlideshow(gal) {
    var holder = gal.querySelector('[data-gc-holder]');
    var ghosts = gal.querySelectorAll('[data-testid="gallery-item-ghost"]');
    if (!holder || ghosts.length < 2) return;
    var current = 0, INTERVAL = 4000;
    setInterval(function () {
      if (reduceMotion || document.hidden) return;
      var i = (current + 1) % ghosts.length;
      var incoming = ghosts[i].cloneNode(true);
      incoming.setAttribute('data-testid', 'gallery-item-item');
      crossfade(holder, incoming, holder.firstElementChild, function () { current = i; });
    }, INTERVAL);
  }

  // ---------------------------------------------------------------- header
  // Desktop header "disappears on scroll" (Wix setting), measured on the live site:
  // hides (ZfNvr6: translateY(-100%), .2s) once scrolled down past ~2x its height,
  // reappears (ICcIQy) after scrolling back up about the same distance or near the top.
  function initHeader() {
    var h = document.getElementById('SITE_HEADER');
    if (!h || document.documentElement.getAttribute('data-gc-layout') !== 'desktop') return;
    h.classList.add('ICcIQy', 'Dbjboh');
    var last = window.scrollY, up = 0, hidden = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, limit = h.offsetHeight * 2, d = y - last;
      last = y;
      if (d > 0) {
        up = 0;
        if (!hidden && y > limit) { hidden = true; h.classList.remove('ICcIQy'); h.classList.add('ZfNvr6'); }
      } else if (d < 0) {
        up -= d;
        if (hidden && (up > limit || y <= limit)) { hidden = false; h.classList.remove('ZfNvr6'); h.classList.add('ICcIQy'); }
      }
    }, { passive: true });
  }

  // ---------------------------------------------------------------- mobile menu
  function initTinyMenu() {
    var tpl = document.querySelector('template[data-gc-open="TINY_MENU"]');
    var closed = document.getElementById('TINY_MENU');
    if (!tpl || !closed) return;
    var open = tpl.content.firstElementChild;
    if (!open) return;
    function bind(nav, other) {
      var btn = nav.querySelector('[data-testid="tinymenu-menubutton"]');
      if (btn) btn.addEventListener('click', function () { nav.parentNode.replaceChild(other, nav); });
    }
    bind(closed, open);
    bind(open, closed);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open.isConnected) open.parentNode.replaceChild(closed, open);
    });
  }

  // ---------------------------------------------------------------- gallery viewer
  var viewer, vImg, vTitle, group = [], index = 0;
  var ICON = {
    close: '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M1 1l20 20M21 1L1 21" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    prev: '<svg width="14" height="26" viewBox="0 0 14 26"><path d="M13 1L1 13l12 12" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    next: '<svg width="14" height="26" viewBox="0 0 14 26"><path d="M1 1l12 12L1 25" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    full: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M12 1h7v7M19 1l-7 7M8 19H1v-7M1 19l7-7" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>'
  };
  function buildViewer() {
    viewer = document.createElement('div');
    viewer.className = 'gc-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.hidden = true;
    viewer.innerHTML =
      '<div class="gc-viewer__stage"><img alt=""></div>' +
      '<div class="gc-viewer__side"><h1 class="gc-viewer__title"></h1></div>' +
      '<button class="gc-viewer__full" aria-label="Full screen">' + ICON.full + '</button>' +
      '<button class="gc-viewer__prev" aria-label="Previous Item">' + ICON.prev + '</button>' +
      '<button class="gc-viewer__next" aria-label="Next Item">' + ICON.next + '</button>' +
      '<button class="gc-viewer__close" aria-label="Close">' + ICON.close + '</button>';
    document.body.appendChild(viewer);
    vImg = viewer.querySelector('img');
    vTitle = viewer.querySelector('.gc-viewer__title');
    viewer.querySelector('.gc-viewer__close').onclick = close;
    viewer.querySelector('.gc-viewer__prev').onclick = function () { show(index - 1); };
    viewer.querySelector('.gc-viewer__next').onclick = function () { show(index + 1); };
    viewer.querySelector('.gc-viewer__full').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (viewer.requestFullscreen) viewer.requestFullscreen();
    };
    document.addEventListener('keydown', function (e) {
      if (viewer.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
  }
  function show(i) {
    index = (i + group.length) % group.length;
    var it = group[index];
    vImg.src = it.getAttribute('data-gc-zoom');
    vImg.alt = it.getAttribute('data-gc-alt') || '';
    vTitle.textContent = it.getAttribute('data-gc-title') || '';
    var single = group.length < 2;
    viewer.querySelector('.gc-viewer__prev').hidden = single;
    viewer.querySelector('.gc-viewer__next').hidden = single;
  }
  function close() {
    if (document.fullscreenElement) document.exitFullscreen();
    viewer.hidden = true;
    document.documentElement.style.overflow = '';
  }
  document.addEventListener('click', function (e) {
    var it = e.target.closest && e.target.closest('[data-gc-zoom]');
    if (!it || (viewer && viewer.contains(it))) return;
    e.preventDefault();
    if (!viewer) buildViewer();
    var g = it.getAttribute('data-gc-group');
    group = Array.prototype.slice.call(document.querySelectorAll('[data-gc-group="' + g + '"]'));
    // Ghost copies and the visible copy of the same item share a key; keep one each.
    var seen = {};
    group = group.filter(function (n) {
      var k = n.getAttribute('data-gc-key');
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    var key = it.getAttribute('data-gc-key');
    var at = 0;
    for (var i = 0; i < group.length; i++) if (group[i].getAttribute('data-gc-key') === key) at = i;
    viewer.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    show(at);
  });

  // ---------------------------------------------------------------- pro-gallery sliders
  function initProSlider(col) {
    var host = col.parentElement;
    var next = host.querySelector('[data-hook="nav-arrow-next"]');
    if (!next) return;
    var back = next.cloneNode(true);
    back.setAttribute('data-hook', 'nav-arrow-back');
    back.setAttribute('aria-label', 'Previous Item');
    back.style.right = '';
    back.style.left = next.style.right;
    var svg = back.querySelector('svg');
    if (svg) svg.style.transform = (svg.style.transform || '').replace('scaleX(1)', 'scaleX(-1)');
    host.appendChild(back);
    function update() {
      var max = col.scrollWidth - col.clientWidth - 2;
      back.style.display = col.scrollLeft > 2 ? '' : 'none';
      next.style.display = col.scrollLeft < max ? '' : 'none';
    }
    next.addEventListener('click', function () { col.scrollBy({ left: col.clientWidth * 0.8, behavior: 'smooth' }); });
    back.addEventListener('click', function () { col.scrollBy({ left: -col.clientWidth * 0.8, behavior: 'smooth' }); });
    col.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ---------------------------------------------------------------- video player
  function initVideo(player) {
    var video = player.querySelector('video');
    if (!video) return;
    var pauseBtn = player.querySelector('button[aria-label="Pause"], button[aria-label="Play"]');
    var muteBtn = player.querySelector('button[aria-label="Unmute"], button[aria-label="Mute"]');
    var fsBtn = player.querySelector('button[aria-label="Enter full screen"]');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !video.dataset.gcPaused) video.play().catch(function () {});
        else if (!en.isIntersecting) video.pause();
      });
    }, { rootMargin: '200px' }) : null;
    if (io) io.observe(player); else video.play().catch(function () {});
    if (pauseBtn) pauseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (video.paused) { delete video.dataset.gcPaused; video.play(); pauseBtn.setAttribute('aria-label', 'Pause'); }
      else { video.dataset.gcPaused = '1'; video.pause(); pauseBtn.setAttribute('aria-label', 'Play'); }
    });
    if (muteBtn) muteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      video.muted = !video.muted;
      muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    });
    if (fsBtn) fsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (video.requestFullscreen) video.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
  }

  // ---------------------------------------------------------------- forms
  // The Wix forms posted to Wix's backend. Until a form endpoint is configured
  // (window.GC_FORM_ENDPOINT, e.g. a serverless function that emails the lead),
  // submitting points visitors to the phone number instead of failing silently.
  function initForm(form) {
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name && !el.id) return;
        if (el.type === 'checkbox') data[el.name || el.id] = el.checked;
        else if (el.type !== 'submit' && el.type !== 'button') data[el.name || el.id] = el.value;
      });
      data.page = location.pathname;
      var endpoint = window.GC_FORM_ENDPOINT;
      if (endpoint) {
        fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); location.href = '/thankyou'; })
          .catch(function () { note(form, true); });
      } else {
        note(form, false);
      }
    });
  }
  function note(form, failed) {
    var n = form.querySelector('.gc-form-note');
    if (!n) {
      n = document.createElement('div');
      n.className = 'gc-form-note';
      n.setAttribute('role', 'status');
      var btn = form.querySelector('button[type="submit"], button:not([type])');
      (btn ? btn.parentNode : form).appendChild(n);
    }
    var tel = document.querySelector('a[href^="tel:"]');
    var num = tel ? tel.getAttribute('href').replace(/^tel:\+?1?/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : '';
    n.innerHTML = (failed ? 'Sorry, your request could not be sent.' : 'Online form submission is not connected on this copy of the site.') +
      (num ? ' Please call us at <a href="tel:+1' + num.replace(/\D/g, '') + '">' + num + '</a>.' : '');
  }

  // ---------------------------------------------------------------- conversion pass
  var PHONE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  function phone() {
    var tel = document.querySelector('a[href^="tel:"]');
    if (!tel) return null;
    var href = tel.getAttribute('href');
    var d = href.replace(/\D/g, '').slice(-10);
    return { href: href, label: d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') };
  }

  // Call Now is the primary CTA: header phone link becomes a button, plus a floating button.
  function initCallNow() {
    var p = phone();
    if (!p) return;
    var header = document.querySelector('header, #SITE_HEADER');
    var hTel = header && header.querySelector('a.gc-tel');
    if (hTel) {
      hTel.classList.add('gc-callbtn');
      hTel.innerHTML = PHONE_ICON + '<span>Call Now</span>';
      hTel.setAttribute('aria-label', 'Call now ' + p.label);
      // Drop the "OR" that sat between the tour button and the number.
      Array.prototype.forEach.call(hTel.closest('[id^="comp-"]').querySelectorAll('span'), function (s) { if (/^\s*or\s*$/i.test(s.textContent)) s.textContent = ''; });
    }
    var fab = document.createElement('a');
    fab.className = 'gc-callfab';
    fab.href = p.href;
    fab.setAttribute('aria-label', 'Call now ' + p.label);
    fab.innerHTML = PHONE_ICON + '<span>Call Now</span><small>' + p.label + '</small>';
    document.body.appendChild(fab);
  }

  // Intake popup: opened by every tour/register/contact button, and once per visit after 25s.
  var intake;
  function buildIntake() {
    var p = phone();
    intake = document.createElement('div');
    intake.className = 'gc-intake';
    intake.hidden = true;
    intake.setAttribute('role', 'dialog');
    intake.setAttribute('aria-modal', 'true');
    intake.setAttribute('aria-labelledby', 'gc-intake-title');
    intake.innerHTML =
      '<div class="gc-intake__box">' +
      '<button type="button" class="gc-intake__close" aria-label="Close">&times;</button>' +
      '<h2 id="gc-intake-title">Book Your Tour</h2>' +
      '<p>See the suites, meet the team and stay for lunch on the Welland Canal.</p>' +
      (p ? '<a class="gc-intake__call" href="' + p.href + '">' + PHONE_ICON + 'Call Now &middot; ' + p.label + '</a><div class="gc-intake__or">or send us your details</div>' : '') +
      '<form>' +
      '<label>Your name<input name="name" autocomplete="name" required></label>' +
      '<label>Phone<input name="phone" type="tel" autocomplete="tel" required></label>' +
      '<label class="gc-full">Email<input name="email" type="email" autocomplete="email"></label>' +
      '<label>Enquiring for<select name="for"><option>Myself</option><option>A parent</option><option>A spouse</option><option>Someone else</option></select></label>' +
      '<label>Move-in timeline<select name="timeline"><option>As soon as possible</option><option>1&ndash;3 months</option><option>3&ndash;6 months</option><option>Just exploring</option></select></label>' +
      '<label>Interested in<select name="interest"><option>Independent living</option><option>Supportive care</option><option>Respite / short stay</option><option>Not sure yet</option></select></label>' +
      '<label>Preferred tour date<input name="date" type="date"></label>' +
      '<label class="gc-full">Anything we should know?<textarea name="message"></textarea></label>' +
      '<button type="submit">Request My Tour</button>' +
      '</form></div>';
    document.body.appendChild(intake);
    initForm(intake.querySelector('form'));
    intake.querySelector('.gc-intake__close').onclick = closeIntake;
    intake.addEventListener('click', function (e) { if (e.target === intake) closeIntake(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !intake.hidden) closeIntake(); });
  }
  function openIntake() {
    if (!intake) buildIntake();
    intake.hidden = false;
    try { sessionStorage.setItem('gcIntakeSeen', '1'); } catch (e) {}
    intake.querySelector('input').focus();
  }
  function closeIntake() { intake.hidden = true; }
  function initIntake() {
    Array.prototype.forEach.call(document.querySelectorAll('.wixui-button'), function (b) {
      if (b.closest('form') || !/tour|register|book|schedule|contact|enquir|inquir/i.test(b.textContent)) return;
      b.classList.add('gc-cta-tour');
      b.addEventListener('click', function (e) { e.preventDefault(); openIntake(); });
    });
    var seen;
    try { seen = sessionStorage.getItem('gcIntakeSeen'); } catch (e) {}
    if (!seen && !/thankyou/.test(location.pathname)) setTimeout(function () { if (!intake || intake.hidden) openIntake(); }, 25000);
  }

  // One type scale (minor third, x1.2 from 16px): every Wix text size snaps down to the
  // step at or below it, so no text box grows past the slot Wix laid it out in.
  // Stray Open Sans / Montserrat text uses the site's Proxima Nova.
  var SCALE = [12, 14, 16, 19, 23, 28, 33, 40, 48];
  function snap(px) {
    var best = SCALE[0];
    SCALE.forEach(function (s) { if (s <= px + 0.5) best = s; });
    return best;
  }
  function initTypeScale() {
    Array.prototype.forEach.call(document.querySelectorAll('body *:not(svg):not(svg *):not(script):not(style):not(template)'), function (el) {
      var cs = getComputedStyle(el);
      var px = parseFloat(cs.fontSize);
      if (px && !el.closest('.wixui-button, .gc-callfab, .gc-callbtn, .gc-intake, .gc-viewer')) el.style.fontSize = snap(px) + 'px';
      if (/open sans|montserrat/i.test(cs.fontFamily)) el.style.fontFamily = 'proxima-n-w01-reg,"Helvetica Neue",Arial,sans-serif';
    });
  }

  // Buttons now size to their labels, so two buttons Wix placed side by side can touch.
  // Push each colliding pair apart evenly so there is a 16px gap between them.
  function spaceButtons() {
    var GAP = 16;
    var bs = Array.prototype.slice.call(document.querySelectorAll('.wixui-button'));
    if (document.documentElement.getAttribute('data-gc-layout') !== 'desktop') return;
    bs.forEach(function (b) { b.style.translate = ''; });
    bs.forEach(function (a) {
      bs.forEach(function (b) {
        if (a === b) return;
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (!ra.width || !rb.width || ra.left >= rb.left) return;
        if (ra.bottom <= rb.top + 4 || rb.bottom <= ra.top + 4) return;
        var overlap = ra.right + GAP - rb.left;
        if (overlap <= 0) return;
        a.style.translate = (-overlap / 2) + 'px 0';
        b.style.translate = (overlap / 2) + 'px 0';
      });
    });
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    initTypeScale();
    initCallNow();
    initIntake();
    spaceButtons();
    if (document.fonts) document.fonts.ready.then(spaceButtons);
    window.addEventListener("resize", spaceButtons);
    Array.prototype.forEach.call(document.querySelectorAll('template[data-gc-slides]'), initSlideshow);
    Array.prototype.forEach.call(document.querySelectorAll('.wixui-gallery'), initGallerySlideshow);
    Array.prototype.forEach.call(document.querySelectorAll('[data-hook="gallery-column"].gallery-horizontal-scroll'), initProSlider);
    Array.prototype.forEach.call(document.querySelectorAll('.wixui-video-player'), initVideo);
    Array.prototype.forEach.call(document.querySelectorAll('form'), initForm);
    initTinyMenu();
    initHeader();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
