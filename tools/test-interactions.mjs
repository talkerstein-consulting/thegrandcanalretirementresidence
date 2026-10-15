// Functional checks of the interactions site.js restores, plus an internal link crawl.
//   node tools/serve.mjs &   then   node tools/test-interactions.mjs
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4321';
const BLOCK = /googletagmanager|google-analytics|doubleclick|iconnode|clickcease|facebook\.net|crazyegg|boomchatweb/;
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mob = await browser.newContext({ ...devices['iPhone 13'] });
for (const c of [desk, mob]) await c.route(BLOCK, (r) => r.abort());

// Slideshow autoplay + controls (desktop home)
{
  const p = await desk.newPage();
  await p.goto(BASE + '/legacy');
  const id = () => p.$eval('.wixui-slideshow [data-testid="slidesWrapper"]', (w) => w.lastElementChild.id);
  const a = await id();
  await p.waitForTimeout(4600);
  const b = await id();
  ok('home slideshow autoplays', a !== b, `${a} -> ${b}`);
  await p.click('.wixui-slideshow [data-testid="nextButton"]');
  await p.waitForTimeout(1300);
  const c = await id();
  ok('home slideshow next button', c !== b, `${b} -> ${c}`);
  await p.click('.wixui-slideshow nav li:first-child a');
  await p.waitForTimeout(1300);
  const first = await p.$eval('.wixui-slideshow nav li:first-child a', (a) => a.getAttribute('href').split('#')[1]);
  ok('home slideshow dot navigation', (await id()) === first);
  const n = await p.$eval('template[data-gc-slides]', (t) => t.content.children.length);
  ok('home slideshow has all slides', n === 9, n + ' slides');
  await p.close();
}

// Desktop header hides on scroll down, returns on scroll up (as on the live site)
{
  const p = await desk.newPage();
  await p.goto(BASE + '/blog/welland');
  const top = () => p.$eval('#SITE_HEADER', (h) => Math.round(h.getBoundingClientRect().top));
  for (const y of [150, 300, 500, 800, 1000]) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  const hiddenTop = await top();
  for (const y of [900, 700, 500]) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  const shownTop = await top();
  ok('desktop header hides on scroll down / shows on scroll up', hiddenTop < -100 && shownTop === 0, `${hiddenTop} -> ${shownTop}`);
  await p.close();
}

// Mobile menu
{
  const p = await mob.newPage();
  await p.goto(BASE + '/legacy');
  const html = await p.content();
  ok('phone UA gets mobile layout at same URL', /data-gc-layout="mobile"/.test(html));
  await p.click('#TINY_MENU [data-testid="tinymenu-menubutton"]');
  await p.waitForTimeout(600);
  const links = await p.$$eval('#TINY_MENU a', (as) => as.filter((a) => a.offsetParent !== null).map((a) => a.textContent.trim()));
  ok('mobile menu opens with links', links.length >= 8, links.slice(0, 8).join(', '));
  await p.click('#TINY_MENU [data-testid="tinymenu-menubutton"]');
  await p.waitForTimeout(400);
  const vis = await p.$$eval('#TINY_MENU a', (as) => as.filter((a) => a.offsetParent !== null).length);
  ok('mobile menu closes', vis < links.length, vis + ' visible links after close');
  const tel = await p.$eval('a[href^="tel:"]', (a) => a.getAttribute('href'));
  ok('mobile header has tap-to-call link', tel === 'tel:+12894800125', tel);
  await p.close();
}

// Gallery viewer + horizontal pro-gallery arrows
{
  const p = await desk.newPage();
  await p.goto(BASE + '/gallery');
  await p.waitForTimeout(500);
  const col = '[data-hook="gallery-column"]';
  const before = await p.$eval(col, (c) => c.scrollLeft);
  await p.click(`${col} ~ [data-hook="nav-arrow-next"], [data-hook="nav-arrow-next"]`);
  await p.waitForTimeout(900);
  const after = await p.$eval(col, (c) => c.scrollLeft);
  ok('gallery slider next arrow scrolls', after > before, `${before} -> ${after}`);
  await p.click('[data-gc-zoom]');
  await p.waitForTimeout(800);
  const v = await p.evaluate(() => {
    const v = document.querySelector('.gc-viewer');
    const img = v && v.querySelector('img');
    return v && { open: !v.hidden, title: v.querySelector('.gc-viewer__title').textContent, loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth };
  });
  ok('gallery viewer opens with photo + title', v && v.open && v.loaded && !!v.title, JSON.stringify(v));
  const t1 = v && v.title;
  await p.click('.gc-viewer__next');
  await p.waitForTimeout(300);
  const t2 = await p.$eval('.gc-viewer__title', (e) => e.textContent);
  ok('gallery viewer next', t1 !== t2, `${t1} -> ${t2}`);
  await p.keyboard.press('Escape');
  ok('gallery viewer closes on Esc', await p.$eval('.gc-viewer', (v) => v.hidden));
  await p.close();
}

// Services gallery rotation + zoom
{
  const p = await desk.newPage();
  await p.goto(BASE + '/our-services');
  const src = () => p.$eval('[data-gc-holder] img', (i) => i.currentSrc || i.src);
  const a = await src();
  await p.waitForTimeout(5500);
  const b = await src();
  ok('services gallery rotates', a !== b);
  await p.click('[data-gc-holder] [data-gc-zoom]');
  await p.waitForTimeout(500);
  ok('services gallery opens viewer', await p.$eval('.gc-viewer', (v) => !v.hidden));
  await p.close();
}

// Video
{
  const p = await desk.newPage();
  await p.goto(BASE + '/our-location');
  await p.$eval('.wixui-video-player', (e) => e.scrollIntoView());
  await p.waitForTimeout(3000);
  const t = await p.$eval('.wixui-video-player video', (v) => ({ t: v.currentTime, muted: v.muted, err: v.error && v.error.code }));
  ok('location video plays muted', t.t > 0 && t.muted && !t.err, JSON.stringify(t));
  await p.close();
}

// Form
{
  const p = await desk.newPage();
  await p.goto(BASE + '/about-us');
  const f = 'form.wixui-form';
  await p.click(`${f} button`);
  await p.waitForTimeout(300);
  ok('form blocks empty submit', !(await p.$(`${f} .gc-form-note`)));
  await p.fill(`${f} input[name="name"]`, 'Test');
  await p.fill(`${f} input[type="email"]`, 'test@example.com');
  await p.fill(`${f} input[type="tel"]`, '5555555555');
  await p.check(`${f} input[type="checkbox"][required]`, { force: true });
  await p.click(`${f} button`);
  await p.waitForTimeout(300);
  const note = await p.$eval(`${f} .gc-form-note`, (n) => n.textContent).catch(() => null);
  ok('form submit shows call-us note (no backend configured)', !!note, note || '');
  await p.close();
}

// Redirect
{
  const r = await fetch(BASE + '/review', { redirect: 'manual' });
  ok('/review redirects to Google review form', r.status === 301 && /g\.page/.test(r.headers.get('location')), r.status + ' ' + r.headers.get('location'));
}

// Internal link crawl over every built page
{
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.isDirectory() && f.name !== 'assets') walk(path.join(d, f.name)); else if (f.name === 'index.html') files.push(path.join(d, f.name)); } };
  walk('public');
  const hrefs = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:href|src)="(\/(?!\/)[^"#?]*)/g)) hrefs.add(m[1]);
  // /blogs/search was Wix's server-side blog search; a static copy cannot serve it (documented in AUDIT.md).
  hrefs.delete('/blogs/search');
  const bad = [];
  await Promise.all([...hrefs].map(async (h) => { const r = await fetch(BASE + h, { method: 'GET', redirect: 'manual' }); if (r.status >= 400) bad.push(r.status + ' ' + h); }));
  ok('all internal links/assets resolve', bad.length === 0, `${hrefs.size} checked${bad.length ? '; broken: ' + bad.slice(0, 10).join(', ') : ''}`);
}

await browser.close();
fs.writeFileSync('.cache/interactions.json', JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
