// Grand Canal clean templates: hero slideshow, mobile menu, tour popup, lead forms.
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ hero slideshow
  var slides = document.querySelector('[data-slides]');
  if (slides) {
    var imgs = Array.prototype.slice.call(slides.querySelectorAll('img'));
    var dots = document.querySelector('[data-dots]');
    var current = 0, timer;
    var go = function (i) {
      imgs[current].classList.remove('is-active');
      if (dots) dots.children[current].removeAttribute('aria-current');
      current = (i + imgs.length) % imgs.length;
      imgs[current].loading = 'eager';
      imgs[current].classList.add('is-active');
      if (dots) dots.children[current].setAttribute('aria-current', 'true');
    };
    if (dots) imgs.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Show photo ' + (i + 1));
      if (!i) b.setAttribute('aria-current', 'true');
      b.onclick = function () { go(i); play(); };
      dots.appendChild(b);
    });
    var play = function () {
      clearInterval(timer);
      if (!reduceMotion && imgs.length > 1) timer = setInterval(function () { go(current + 1); }, 6000);
    };
    play();
  }

  // ------------------------------------------------------------ mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  if (nav) Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
    if (a.getAttribute('href') === location.pathname.replace(/\/$/, '')) a.setAttribute('aria-current', 'page');
  });

  // ------------------------------------------------------------ tour popup
  var modal = document.getElementById('intake');
  var lastFocus;
  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    try { sessionStorage.setItem('gcIntakeSeen', '1'); } catch (e) {}
    modal.querySelector('input').focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  if (modal) {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-intake]');
      if (!t) return;
      e.preventDefault();
      openModal();
    });
    modal.querySelector('.modal__close').onclick = closeModal;
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    var seen;
    try { seen = sessionStorage.getItem('gcIntakeSeen'); } catch (e) {}
    if (!seen) setTimeout(function () { if (modal.hidden) openModal(); }, 25000);
  }

  // ------------------------------------------------------------ forms
  // Posts JSON to window.GC_FORM_ENDPOINT when one is configured; until then it asks the
  // visitor to call, so a lead is never silently lost.
  var phoneLink = document.querySelector('a[href^="tel:"]');
  Array.prototype.forEach.call(document.querySelectorAll('form'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = { page: location.pathname };
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      var endpoint = window.GC_FORM_ENDPOINT;
      if (!endpoint) return note(form, 'Online form submission is not connected yet.');
      fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); location.href = '/thankyou'; })
        .catch(function () { note(form, 'Sorry, your request could not be sent.'); });
    });
  });
  function note(form, msg) {
    var n = form.querySelector('.form-note');
    if (!n) {
      n = document.createElement('p');
      n.className = 'form-note';
      n.setAttribute('role', 'status');
      form.appendChild(n);
    }
    n.innerHTML = msg + (phoneLink ? ' Please call us at <a href="' + phoneLink.getAttribute('href') + '">' + phoneLink.getAttribute('href').replace(/^tel:\+1(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') + '</a>.' : '');
  }
})();
