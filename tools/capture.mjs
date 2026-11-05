// Renders every route of the live Wix site in Chrome (desktop + phone UA, since Wix
// serves a separate mobile layout), lets Wix hydrate and lazy-load everything, then
// saves the frozen DOM (runtime scripts removed) and a full-page reference screenshot.
//
// Trackers (GA/GTM, WhatConverts call tracking, ClickCease, Facebook) are blocked so
// the crawl doesn't pollute the client's analytics and so the call-tracking script
// doesn't swap the real phone number for a tracking-pool number in the saved DOM.
//
// State Wix only renders on interaction is snapshotted into <template> elements:
//   <template data-gc-slides="compId">  every slide of a slideshow, in order
//   <template data-gc-open="TINY_MENU"> the mobile menu in its open state
//
//   node tools/capture.mjs [--mode=desktop|mobile] [route ...]   (no routes = all; "index" = home)
//
// Desktop is captured at 1920px so full-width photos are fetched at full resolution;
// the build derives smaller same-crop variants for narrower screens.
import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ORIGIN, ROUTES } from './routes.mjs';

const OUT = path.resolve('.cache/capture');
const REF = path.resolve('.cache/ref');
const args = process.argv.slice(2);
const modeArg = (args.find((a) => a.startsWith('--mode=')) || '').slice(7);
const only = args.filter((a) => !a.startsWith('--'));
const routes = only.length ? only.map((r) => (r === 'index' ? '' : r)) : ROUTES;
const CONCURRENCY = 4;
const BLOCK = /googletagmanager|google-analytics|analytics\.google|doubleclick|iconnode|whatconverts|clickcease|facebook\.net|connect\.facebook|hotjar|frog\.wix\.com|panorama|sentry/;

const MODES = {
  desktop: {
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  mobile: { ...devices['iPhone 13'] },
};

const slug = (r) => (r === '' ? 'index' : r.replace(/\//g, '__'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function autoscroll(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.6));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 160));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 800));
    window.scrollTo(0, 0);
  });
}

// Step through every slide of every slideshow via its dots and keep each slide at rest.
async function snapshotSlideshows(page) {
  const shows = await page.$$eval('.wixui-slideshow', (els) => els.map((e) => e.id));
  for (const id of shows) {
    const targets = await page.$$eval(`#${id} nav a[href*="#"]`, (as) => as.map((a) => a.getAttribute('href').split('#')[1]));
    if (!targets.length) continue;
    // Grab each slide the moment it is at rest with its images loaded (autoplay keeps
    // advancing, so a slide can be gone a second later); retry any that were missed.
    const got = new Map();
    for (let pass = 0; pass < 4 && got.size < targets.length; pass++) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (got.has(t)) continue;
        await page.$$eval(`#${id} nav a[href*="#"]`, (as, i) => as[i].click(), i).catch(() => {});
        const handle = await page
          .waitForFunction(
            (t) => {
              const el = document.getElementById(t);
              if (!el || /XWeqiF|HTrn1j|bWoigz|sAGPNe/.test(el.className) || el.parentElement.children.length !== 1) return false;
              if ([...el.querySelectorAll('img')].some((img) => !img.complete || /blur_/.test(img.src))) return false;
              return el.outerHTML;
            },
            t,
            { timeout: 8000, polling: 100 },
          )
          .catch(() => null);
        const html = handle && (await handle.jsonValue());
        if (html) got.set(t, html);
      }
    }
    const slides = targets.filter((t) => got.has(t)).map((t) => got.get(t));
    // Back to the first slide so the frozen DOM shows slide 1 at rest.
    await page.$$eval(`#${id} nav a[href*="#"]`, (as) => as[0].click()).catch(() => {});
    await page
      .waitForFunction((t) => {
        const el = document.getElementById(t);
        return el && el.parentElement.children.length === 1 && !/XWeqiF|bWoigz/.test(el.className);
      }, targets[0], { timeout: 6000 })
      .catch(() => {});
    await sleep(500);
    await page.evaluate(
      ({ id, slides }) => {
        const tpl = document.createElement('template');
        tpl.setAttribute('data-gc-slides', id);
        tpl.innerHTML = slides.join('');
        document.getElementById(id).appendChild(tpl);
      },
      { id, slides },
    );
    console.log('   slideshow', id, slides.length, '/', targets.length);
  }
}

async function snapshotTinyMenu(page) {
  const btn = await page.$('#TINY_MENU [data-testid="tinymenu-menubutton"]');
  if (!btn) return;
  await btn.click();
  await sleep(1200);
  const open = await page.$eval('#TINY_MENU', (el) => el.outerHTML);
  await btn.click();
  await sleep(1200);
  await page.evaluate((open) => {
    const tpl = document.createElement('template');
    tpl.setAttribute('data-gc-open', 'TINY_MENU');
    tpl.innerHTML = open;
    document.body.appendChild(tpl);
  }, open);
}

async function captureOne(ctx, mode, route) {
  const page = await ctx.newPage();
  const url = `${ORIGIN}/${route}`;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(1000);
    await autoscroll(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(800);
    await fs.mkdir(path.join(REF, mode), { recursive: true });
    await page
      .screenshot({ path: path.join(REF, mode, `${slug(route)}.jpg`), fullPage: true, quality: 70, type: 'jpeg', scale: 'css' })
      .catch((e) => console.warn('screenshot failed', mode, route, e.message));
    await snapshotSlideshows(page);
    if (mode === 'mobile') await snapshotTinyMenu(page);
    const html = await page.evaluate(() => {
      document.querySelectorAll('img').forEach((img) => {
        const r = img.getBoundingClientRect();
        img.setAttribute('data-gc-y', String(Math.round(r.top + window.scrollY)));
      });
      document.querySelectorAll('script').forEach((s) => {
        if (s.type !== 'application/ld+json') s.remove();
      });
      return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    });
    await fs.mkdir(path.join(OUT, mode), { recursive: true });
    await fs.writeFile(path.join(OUT, mode, `${slug(route)}.html`), html);
    console.log('ok', mode, '/' + route, (html.length / 1024).toFixed(0) + 'KB');
  } catch (e) {
    console.error('FAIL', mode, route, e.message);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [mode, opts] of Object.entries(MODES)) {
  if (modeArg && mode !== modeArg) continue;
  const ctx = await browser.newContext({ ...opts, locale: 'en-US' });
  await ctx.route(BLOCK, (r) => r.abort());
  const queue = [...routes];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await captureOne(ctx, mode, queue.shift());
    }),
  );
  await ctx.close();
}
await browser.close();
