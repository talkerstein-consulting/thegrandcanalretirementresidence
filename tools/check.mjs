// Visual + functional check of the local copy against the reference captures.
//
//   node tools/serve.mjs &            (local copy on :4321)
//   node tools/check.mjs [--mode=desktop|mobile] [route ...]
//
// For each page: full-page screenshot with the same settings as tools/capture.mjs,
// pixel comparison against .cache/ref (share of differing pixels + the vertical
// bands where they differ), console errors and failed/404 requests.
// Trackers are blocked so checks never reach the client's analytics.
import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROUTES } from './routes.mjs';

const BASE = process.env.BASE || 'http://localhost:4321';
const args = process.argv.slice(2);
const modeArg = (args.find((a) => a.startsWith('--mode=')) || '').slice(7);
const only = args.filter((a) => !a.startsWith('--')).map((r) => (r === 'index' ? '' : r));
const routes = only.length ? only : ROUTES;
const BLOCK = /googletagmanager|google-analytics|analytics\.google|doubleclick|iconnode|whatconverts|clickcease|facebook\.net|crazyegg|boomchatweb/;
const REF = path.resolve('.cache/ref');
const OUT = path.resolve('.cache/local');
const MODES = {
  desktop: { viewport: { width: 1920, height: 1080 } },
  mobile: { ...devices['iPhone 13'] },
};
const slug = (r) => (r === '' ? 'index' : r.replace(/\//g, '__'));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const differ = await (await browser.newContext()).newPage();

async function diff(a, b) {
  const [da, db] = await Promise.all([fs.readFile(a), fs.readFile(b)]).then((bs) => bs.map((x) => 'data:image/jpeg;base64,' + x.toString('base64')));
  return differ.evaluate(
    async ([da, db]) => {
      const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
      const [ia, ib] = await Promise.all([load(da), load(db)]);
      const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
      const ctx = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const pa = ctx(ia), pb = ctx(ib);
      let bad = 0; const rows = new Array(Math.ceil(h / 50)).fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 90) { bad++; rows[(y / 50) | 0]++; }
      }
      const bands = [];
      rows.forEach((n, i) => { if (n / (50 * w) > 0.05) { const last = bands[bands.length - 1]; if (last && last[1] === i * 50) last[1] = (i + 1) * 50; else bands.push([i * 50, (i + 1) * 50]); } });
      return { pct: +((100 * bad) / (w * h)).toFixed(2), refH: ia.height, localH: ib.height, bands: bands.map((b) => b.join('-')).slice(0, 8) };
    },
    [da, db],
  );
}

const results = [];
for (const [mode, opts] of Object.entries(MODES)) {
  if (modeArg && mode !== modeArg) continue;
  const ctx = await browser.newContext({ ...opts, locale: 'en-US' });
  await ctx.route(BLOCK, (r) => r.abort());
  for (const route of routes) {
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('response', (r) => { if (r.status() >= 400 && !BLOCK.test(r.url())) failed.push(r.status() + ' ' + r.url().slice(0, 140)); });
    page.on('requestfailed', (r) => { if (!BLOCK.test(r.url())) failed.push('failed ' + r.url().slice(0, 140)); });
    await page.goto(`${BASE}/${route}`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);
    await fs.mkdir(path.join(OUT, mode), { recursive: true });
    const shot = path.join(OUT, mode, slug(route) + '.jpg');
    await page.screenshot({ path: shot, fullPage: true, quality: 70, type: 'jpeg', scale: 'css' });
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    let d = null;
    try { d = await diff(path.join(REF, mode, slug(route) + '.jpg'), shot); } catch {}
    const r = { mode, route: '/' + route, ...d, hscroll, errors: [...new Set(errors)], failed: [...new Set(failed)] };
    results.push(r);
    console.log(`${mode.padEnd(7)} ${r.route.padEnd(50)} diff ${String(d?.pct ?? '?').padStart(5)}%  h ${d?.refH}->${d?.localH}${hscroll ? '  HSCROLL' : ''}${errors.length ? '  errors:' + errors.length : ''}${failed.length ? '  failed:' + failed.length : ''}  ${d?.bands?.join(' ') || ''}`);
    await page.close();
  }
  await ctx.close();
}
await fs.writeFile(path.resolve('.cache/check.json'), JSON.stringify(results, null, 2));
await browser.close();
