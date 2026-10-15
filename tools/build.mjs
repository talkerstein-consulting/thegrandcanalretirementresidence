// Turns the frozen Wix DOM captures (.cache/capture) into a static site in public/.
//
//   desktop layout  -> public/<route>/index.html
//   mobile layout   -> public/m/<route>/index.html   (served to phones at the same URL
//                      by the user-agent rewrite in vercel.json / tools/serve.mjs)
//
// Nothing visual is redesigned. The build only: removes the Wix runtime, self-hosts
// assets (images as WebP at the exact crops/sizes Wix used, open-licence fonts, CSS,
// PDFs), lazy-loads below-the-fold images, rewrites internal links, makes the phone
// number tappable everywhere, re-injects the site's tracking embeds, and adds a small
// script (src/site.js) for the interactions the Wix runtime used to provide.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { ORIGIN, ROUTES, REDIRECTS, PHONE_TEL, MOBILE_UA_RE } from './routes.mjs';

const ROOT = process.cwd();
const CAP = path.join(ROOT, '.cache/capture');
const DL = path.join(ROOT, '.cache/dl');
const OUT = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src');
const EMBEDS = JSON.parse(fss.readFileSync(path.join(ROOT, 'tools/embeds.json'), 'utf8'));

// Below this document offset (CSS px) an image is lazy-loaded.
const FOLD = { desktop: 1300, mobile: 900 };
// Desktop is captured at 1920px; full-width photos get these extra same-crop widths.
const WIDE_VARIANTS = [768, 1280, 1600];
// North-American numbers with separators: 289-480-0125, (289) 480-0125, 289·480·0125, ...
const PHONE_RE = /(?:\(\d{3}\)[\s ]?|\b\d{3}[\s. ·‐-–-])\d{3}[\s. ·‐-–-]\d{4}\b/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const warnings = new Set();
const warn = (m) => warnings.add(m);

// ---------------------------------------------------------------- downloads

let active = 0;
const waiting = [];
async function slot(fn) {
  while (active >= 8) await new Promise((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function fetchRetry(url, accept) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept } });
      if (res.status === 404 || res.status === 403) return { ok: false, status: res.status };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { ok: true, type: (res.headers.get('content-type') || '').split(';')[0], buf: Buffer.from(await res.arrayBuffer()) };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return { ok: false, status: String(last) };
}

const inflight = new Map();
function download(url, accept = '*/*') {
  const key = sha(url + '|' + accept);
  if (!inflight.has(key)) {
    inflight.set(
      key,
      (async () => {
        const bin = path.join(DL, key + '.bin');
        const meta = path.join(DL, key + '.json');
        if (fss.existsSync(meta)) {
          const m = JSON.parse(await fs.readFile(meta, 'utf8'));
          return m.ok ? { ...m, buf: await fs.readFile(bin) } : null;
        }
        const r = await slot(() => fetchRetry(url, accept));
        await fs.mkdir(DL, { recursive: true });
        if (r.ok) await fs.writeFile(bin, r.buf);
        await fs.writeFile(meta, JSON.stringify({ ok: r.ok, type: r.type, status: r.status, url }));
        if (!r.ok) warn(`download failed (${r.status}): ${url}`);
        return r.ok ? r : null;
      })(),
    );
  }
  return inflight.get(key);
}

const written = new Set();
async function emit(rel, data) {
  if (written.has(rel)) return;
  written.add(rel);
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

// ---------------------------------------------------------------- assets

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

function absUrl(u) {
  u = u.trim().replace(/&amp;/g, '&');
  if (u.startsWith('//')) return 'https:' + u;
  return u;
}

function niceName(u) {
  const p = new URL(u).pathname.split('/').filter(Boolean);
  const last = decodeURIComponent(p[p.length - 1] || 'file')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return last || 'img';
}

const isWixImage = (u) => /^https:\/\/static\.wixstatic\.com\/(media|shapes)\//.test(u) || /^https:\/\/static\.parastorage\.com\/.*\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(u);

// Returns the site-relative path of a self-hosted copy, or null if it can't be fetched.
const imgCache = new Map();
function localImage(raw, { accept } = {}) {
  const u = absUrl(raw);
  if (!isWixImage(u)) return Promise.resolve(null);
  const acc = accept || (/\.gif($|\?)/i.test(u) && !/\/v1\//.test(u) ? 'image/gif,*/*' : 'image/webp,image/*;q=0.8,*/*;q=0.5');
  const key = u + '|' + acc;
  // Wix picks the output format from the trailing file name's extension; ask for WebP.
  const req = /\/v1\//.test(u) && !/png/.test(accept || '') && !/\.gif$/i.test(u) ? u.replace(/\.(jpe?g|png)$/i, '.webp') : u;
  if (!imgCache.has(key)) {
    imgCache.set(
      key,
      (async () => {
        const r = (await download(req, acc)) || (req !== u ? await download(u, acc) : null);
        if (!r) return null;
        const ext = EXT[r.type] || (u.match(/\.(png|jpe?g|gif|svg|webp)(\?|$)/i)?.[1] || 'bin').toLowerCase();
        const rel = `assets/img/${niceName(u)}-${sha(key).slice(0, 8)}.${ext}`;
        await emit(rel, r.buf);
        return '/' + rel;
      })(),
    );
  }
  return imgCache.get(key);
}

// Fonts: open-licence faces (Google Fonts cache, Open Sans, Wix Madefor) are
// self-hosted. Commercial faces Wix licenses for its own hosting (Helvetica, DIN
// Next, Avenir, Proxima Nova, ...) are NOT copied; they stay on Wix's font CDN and
// are listed in the build report so they can be licensed before launch.
const fontCache = new Map();
const OPEN_FONT = /\/fonts-cache\/googlefont\/|open[ %20]*sans|madefor/i;
const commercialFonts = new Set();
function localFont(raw) {
  const u = absUrl(raw);
  if (!/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(u) || !/parastorage\.com/.test(u)) return Promise.resolve(u);
  if (!OPEN_FONT.test(u)) {
    commercialFonts.add(decodeURIComponent(u.split('/').pop()));
    return Promise.resolve(u);
  }
  if (!fontCache.has(u)) {
    fontCache.set(
      u,
      (async () => {
        const r = await download(u.replace(/ /g, '%20'));
        if (!r) return u;
        const ext = u.match(/\.(woff2?|ttf|otf|eot)/i)[1].toLowerCase();
        const rel = `assets/fonts/${niceName(u)}-${sha(u).slice(0, 8)}.${ext}`;
        await emit(rel, r.buf);
        return '/' + rel;
      })(),
    );
  }
  return fontCache.get(u);
}

async function replaceAsync(str, re, fn) {
  const jobs = [];
  str.replace(re, (...m) => {
    jobs.push(fn(...m));
    return m[0];
  });
  const res = await Promise.all(jobs);
  let i = 0;
  return str.replace(re, () => res[i++]);
}

async function processCss(css) {
  css = css.replace(/\/\*# sourceMappingURL=[^*]*\*\//g, '');
  css = await replaceAsync(css, /url\(\s*(['"]?)([^'")]+)\1\s*\)/g, async (m, q, u) => {
    if (u.startsWith('data:') || u.startsWith('#')) return m;
    const abs = absUrl(u);
    if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(abs)) return `url('${await localFont(abs)}')`;
    const img = await localImage(abs);
    return img ? `url('${img}')` : m.replace(/(['"]?)\/\//, '$1https://');
  });
  // Show fallback text immediately instead of invisible text while fonts load.
  css = css.replace(/@font-face\s*\{/g, '@font-face{font-display:swap;');
  return css;
}

const cssFiles = new Map();
async function cssFile(css) {
  const h = sha(css).slice(0, 10);
  if (!cssFiles.has(h)) cssFiles.set(h, emit(`assets/css/${h}.css`, css));
  await cssFiles.get(h);
  return `/assets/css/${h}.css`;
}

// ---------------------------------------------------------------- srcset

const splitSrcset = (s) =>
  s
    .split(/,\s+(?=(?:https?:)?\/\/|\/)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\S+)(?:\s+(.+))?$/);
      return { url: m[1], d: m[2] || '' };
    });

async function localSrcset(s) {
  const parts = await Promise.all(
    splitSrcset(s).map(async ({ url, d }) => {
      const l = await localImage(url);
      return (l || url) + (d ? ' ' + d : '');
    }),
  );
  return parts.join(', ');
}

// ---------------------------------------------------------------- links

function rewriteHref(h) {
  if (!h) return h;
  const m = h.match(/^(?:https?:)?\/\/(?:www\.)?grandcanal\.ca(\/[^?#]*)?([?#].*)?$/i);
  if (m) {
    let p = m[1] || '/';
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p + (m[2] || '');
  }
  if (h.startsWith('./#')) return h.slice(1);
  return h;
}

const files = new Map();
async function localFile(p) {
  // Documents uploaded to Wix (/_files/ugd/*.pdf) keep their original paths.
  if (!files.has(p)) {
    files.set(
      p,
      (async () => {
        const r = await download(ORIGIN + p);
        if (r) await emit(p.slice(1), r.buf);
      })(),
    );
  }
  return files.get(p);
}

function telHref(h) {
  const d = h.replace(/\D/g, '');
  if (d.length === 10) return 'tel:+1' + d;
  if (d.length === 11 && d[0] === '1') return 'tel:+' + d;
  return h;
}

// Wrap visible phone numbers that aren't links yet. Each number links to exactly the
// digits it shows (the site's main line is 289-480-0125; a blog post shows another).
const otherNumbers = new Set();
function telFor(text) {
  const d = text.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const href = 'tel:+1' + d;
  if (href !== PHONE_TEL) otherNumbers.add(text.trim());
  return href;
}
function linkPhones($, root) {
  const SKIP = new Set(['a', 'script', 'style', 'title', 'textarea', 'option', 'select', 'button', 'head', 'template', 'svg']);
  let count = 0;
  const walk = (node) => {
    for (const child of [...(node.children || [])]) {
      if (child.type === 'tag') {
        if (!SKIP.has(child.name)) walk(child);
      } else if (child.type === 'text' && PHONE_RE.test(child.data)) {
        const html = escapeHtml(child.data).replace(new RegExp(PHONE_RE.source, 'g'), (m) => `<a href="${telFor(m)}" class="gc-tel">${m}</a>`);
        $(child).replaceWith(html);
        count++;
      }
    }
  };
  walk(root);
  // Numbers split across several styled spans (e.g. the header's "289·480·0125"):
  // link the whole short line.
  $(root)
    .find('p, h1, h2, h3, h4, h5, h6, li')
    .each((_, el) => {
      const $el = $(el);
      const text = $el.text();
      const m = text.match(PHONE_RE);
      if (!m || $el.find('a').length || $el.closest('a').length) return;
      if (text.trim().length > 80) return warn(`unlinked phone number in long text: "${text.trim().slice(0, 60)}..."`);
      $el.html(`<a href="${telFor(m[0])}" class="gc-tel">${$el.html()}</a>`);
      count++;
    });
  return count;
}
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- page

async function processFragment($, root, mode, { inTemplate = false } = {}) {
  const jobs = [];
  const $root = $(root);

  $root.find('img').each((_, el) => {
    const $img = $(el);
    jobs.push(
      (async () => {
        const src = $img.attr('src');
        const srcset = $img.attr('srcset');
        const y = Number($img.attr('data-gc-y'));
        $img.removeAttr('data-gc-y');
        if (src && !inTemplate) $img.attr('data-gc-orig', src); // for enhance(); removed there
        const wide = mode === 'desktop' && src && !srcset && src.match(/\/fill\/w_(\d+),h_(\d+)/);
        if (src && !src.startsWith('data:')) {
          const l = await localImage(src);
          if (l) $img.attr('src', l);
        }
        if (srcset) $img.attr('srcset', await localSrcset(srcset));
        if (wide && Number(wide[1]) >= 1700) {
          const [W, H] = [Number(wide[1]), Number(wide[2])];
          const parts = [];
          for (const w of WIDE_VARIANTS) {
            const h = Math.round((H * w) / W);
            const l = await localImage(src.replace(/\/fill\/w_\d+,h_\d+/, `/fill/w_${w},h_${h}`));
            if (l) parts.push(`${l} ${w}w`);
          }
          parts.push(`${$img.attr('src')} ${W}w`);
          $img.attr('srcset', parts.join(', '));
          $img.attr('sizes', '100vw');
        }
        if (inTemplate) {
          $img.removeAttr('loading').removeAttr('fetchpriority');
        } else if (Number.isFinite(y) && y > FOLD[mode]) {
          $img.attr('loading', 'lazy').attr('decoding', 'async').removeAttr('fetchpriority');
        } else if (Number.isFinite(y)) {
          $img.removeAttr('loading');
        }
      })(),
    );
  });

  $root.find('source[srcset], source[srcSet]').each((_, el) => {
    jobs.push((async () => $(el).attr('srcset', await localSrcset($(el).attr('srcset'))))());
  });

  $root.find('image').each((_, el) => {
    const $el = $(el);
    for (const a of ['href', 'xlink:href']) {
      const v = $el.attr(a);
      if (v && !v.startsWith('data:'))
        jobs.push(
          (async () => {
            const l = await localImage(v);
            if (l) $el.attr(a, l);
          })(),
        );
    }
  });

  $root.find('[style*="url("]').each((_, el) => {
    jobs.push((async () => $(el).attr('style', await processCss($(el).attr('style'))))());
  });

  $root.find('a[href]').each((_, el) => {
    const $a = $(el);
    let h = rewriteHref($a.attr('href'));
    if (/^\/_files\//.test(h)) jobs.push(localFile(h.split(/[?#]/)[0]));
    if (/^tel:/i.test(h)) h = telHref(h);
    $a.attr('href', h);
  });

  $root.find('iframe').each((_, el) => {
    const $f = $(el);
    const src = $f.attr('src') || '';
    if (/recaptcha|tpaWorker|mymobileapp|googletagmanager|boomchatweb/.test(src + ($f.attr('name') || '') + ($f.attr('title') || '')) || /display:\s*none/.test($f.attr('style') || '')) {
      $f.remove();
    } else if (!$f.attr('loading')) {
      $f.attr('loading', 'lazy');
    }
  });

  await Promise.all(jobs);
  linkPhones($, root);
}

// Pro-gallery item titles/media live in Wix's server-rendered data, not in the DOM.
const galleryData = new Map();
function proGalleryItems(route) {
  if (!galleryData.has(route)) {
    galleryData.set(
      route,
      (async () => {
        const r = await download(`${ORIGIN}/${route}`, 'text/html');
        const map = new Map();
        if (!r) return map;
        const html = r.buf.toString('utf8');
        for (const m of html.matchAll(/"itemId":"([0-9a-f-]{36})"/g)) {
          const chunk = html.slice(m.index, m.index + 2500);
          const title = chunk.match(/"metaData":\{"title":"((?:[^"\\]|\\.)*)"/);
          const media = chunk.match(/"mediaUrl":"([^"]+)"/);
          if (!map.has(m[1]) && media) map.set(m[1], { title: title ? JSON.parse(`"${title[1]}"`) : '', media: media[1] });
        }
        return map;
      })(),
    );
  }
  return galleryData.get(route);
}

const zoomUrl = (mediaId) => `https://static.wixstatic.com/media/${mediaId}/v1/fit/w_1600,h_1200,q_90/${mediaId}`;
const mediaIdOf = (src) => (src || '').match(/static\.wixstatic\.com\/media\/([^/]+)/)?.[1];

// Restores what the Wix runtime did for galleries, forms and video.
async function enhance($, mode, route) {
  // Gallery items that opened Wix's full-screen viewer get the data our viewer needs.
  const pro = $('[data-hook="item-container"]').filter((_, el) => $(el).find('[data-hook="item-action"][aria-haspopup="dialog"]').length > 0);
  if (pro.length) {
    const items = await proGalleryItems(route);
    for (const el of pro.toArray()) {
      const $el = $(el);
      const id = $el.attr('data-id');
      const data = items.get(id);
      const media = data?.media || mediaIdOf($el.find('img').attr('data-gc-orig'));
      if (!media) continue;
      const big = await localImage(zoomUrl(media));
      if (!big) continue;
      $el.attr({
        'data-gc-zoom': big,
        'data-gc-title': data?.title || '',
        'data-gc-alt': $el.find('img').attr('alt') || '',
        'data-gc-key': id,
        'data-gc-group': $el.closest('[id^="comp-"]').attr('id') || 'gallery',
      });
    }
  }
  for (const el of $('[data-testid="gallery-item-click-action-image-zoom"]').toArray()) {
    const $el = $(el);
    const media = mediaIdOf($el.find('img').attr('data-gc-orig'));
    if (!media) continue;
    const big = await localImage(zoomUrl(media));
    if (!big) continue;
    $el.attr({
      'data-gc-zoom': big,
      'data-gc-title': $el.attr('aria-label') || '',
      'data-gc-alt': $el.find('img').attr('alt') || '',
      'data-gc-key': media,
      'data-gc-group': $el.closest('.wixui-gallery').attr('id') || 'gallery',
    });
  }

  // Classic slideshow gallery: the capture may have caught it mid-transition; reset
  // it to its first item at rest (site.js rotates through the ghost items).
  // The holder has no stable class name, so it is found as the parent of the visible item.
  $('.wixui-gallery').each((_, gal) => {
    const holder = $(gal).find('[data-testid="gallery-item-item"]').first().parent();
    const first = $(gal).find('[data-testid="gallery-item-ghost"]').first();
    if (!holder.length || !first.length) return;
    const clone = $($.html(first));
    clone.attr('data-testid', 'gallery-item-item');
    holder.attr('data-gc-holder', '').empty().append(clone);
  });

  // reCAPTCHA belonged to the Wix runtime; its hidden required checkbox would block submit.
  $('[class*="Captcha"] input[type="checkbox"]').removeAttr('required');
  $('textarea.g-recaptcha-response').remove();

  $('[data-gc-orig]').removeAttr('data-gc-orig');

  // Self-host the video (Wix video player).
  // Wix's adaptive player chose 1080p (83 MB) for the 1920px capture; 720p (desktop)
  // and 480p (phone layout) are visually equivalent at the player's on-page size.
  for (const el of $('video[src*="video.wixstatic.com"]').toArray()) {
    const src = $(el).attr('src').replace(/\/\d{3,4}p\//, mode === 'mobile' ? '/480p/' : '/720p/');
    const r = await download(src, 'video/mp4,video/*');
    if (!r) continue;
    const rel = `assets/video/${niceName(src)}-${sha(src).slice(0, 8)}.mp4`;
    await emit(rel, r.buf);
    $(el).attr({ src: '/' + rel, preload: 'none', muted: '', playsinline: '', loop: '' });
  }
}

function pageIdOf($) {
  const ids = [];
  $('style[id^="css_"]').each((_, el) => {
    const id = $(el).attr('id').slice(4);
    if (id !== 'masterPage') ids.push(id);
  });
  return ids[0] || null;
}

const MOBILE_FALLBACK = `<script>(function(){if(/${MOBILE_UA_RE}/.test(navigator.userAgent)){var p=location.pathname;location.replace('/m'+(p==='/'?'/':p)+location.search+location.hash)}})()</script>`;

async function buildPage(route, mode) {
  const slug = route === '' ? 'index' : route.replace(/\//g, '__');
  const file = path.join(CAP, mode, slug + '.html');
  if (!fss.existsSync(file)) {
    warn(`missing capture: ${mode} /${route}`);
    return null;
  }
  let html = await fs.readFile(file, 'utf8');

  // Lift <template> snapshots out (cheerio mangles template contents).
  const templates = [];
  html = html.replace(/<template\b([^>]*)>([\s\S]*?)<\/template>/g, (m, attrs, inner) => {
    templates.push({ attrs, inner });
    return `<gc-tpl data-i="${templates.length - 1}"></gc-tpl>`;
  });

  const $ = cheerio.load(html);
  const pageId = pageIdOf($);

  // --- strip the Wix runtime and things only it used
  $('script').each((_, el) => {
    if ($(el).attr('type') !== 'application/ld+json') $(el).remove();
  });
  $('link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="modulepreload"]').remove();
  $('meta[name="generator"], meta[http-equiv^="X-Wix"], meta[name="fb_admins_meta_tag"]').remove();
  $('noscript').each((_, el) => {
    if (/googletagmanager|clickcease/.test($(el).html() || '')) $(el).remove();
  });
  $('#chatbutton, #slideDiv, [id^="owc"], [class*="boomchat"]').remove();
  $('body > div').each((_, el) => {
    const $d = $(el);
    if ($d.find('iframe[title*="recaptcha" i], iframe[src*="recaptcha"]').length && !$d.attr('id')) $d.remove();
  });
  $('style').each((_, el) => {
    if ($(el).attr('id') === 'page-transitions') $(el).remove();
  });

  // --- stylesheets: localize, dedupe, move large shared blocks to cacheable files
  const seen = new Set();
  for (const el of $('style').toArray()) {
    const css = await processCss($(el).html() || '');
    const h = sha(css);
    if (seen.has(h) || !css.trim()) {
      $(el).remove();
      continue;
    }
    seen.add(h);
    if (css.length > 6000) $(el).replaceWith(`<link rel="stylesheet" href="${await cssFile(css)}">`);
    else $(el).text(css);
  }
  for (const el of $('link[rel="stylesheet"]').toArray()) {
    const href = $(el).attr('href');
    if (!/^(https?:)?\/\//.test(href)) continue;
    const r = await download(absUrl(href), 'text/css,*/*');
    if (!r) continue;
    $(el).attr('href', await cssFile(await processCss(r.buf.toString('utf8'))));
  }

  // --- head assets
  for (const el of $('link[rel*="icon"]').toArray()) {
    const l = await localImage($(el).attr('href'), { accept: 'image/png,image/*' });
    if (l) $(el).attr('href', l);
  }
  for (const el of $('meta[property="og:image"], meta[name="twitter:image"]').toArray()) {
    const l = await localImage($(el).attr('content'));
    if (l) $(el).attr('content', ORIGIN + l);
  }
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const txt = await replaceAsync($(el).html(), /https:\/\/static\.wixstatic\.com\/media\/[^"\s]+/g, async (u) => {
      const l = await localImage(u);
      return l ? ORIGIN + l : u;
    });
    $(el).text(txt);
  }
  $('link[rel="canonical"], meta[property="og:url"]').each((_, el) => {
    const a = el.name === 'link' ? 'href' : 'content';
    $(el).attr(a, ($(el).attr(a) || '').replace(/^http:\/\/(www\.)?grandcanal\.ca/, 'https://www.grandcanal.ca'));
  });

  await processFragment($, $('body')[0], mode);
  await enhance($, mode, route);

  // --- embeds (Wix custom code + marketing integrations), on the pages Wix put them
  const forPage = (pos) =>
    EMBEDS.filter((e) => e.position === pos && (!e.pages || (pageId && e.pages.includes(pageId))))
      .map((e) => `\n<!-- ${e.name} -->\n${e.html.replace(/https:\/\/static\.wixstatic\.com\/media\/[^"\s]+/g, (u) => u)}\n`)
      .join('');
  const headEmbeds = forPage('head');
  const bodyStart = forPage('bodyStart');
  const bodyEnd = forPage('bodyEnd');

  // --- our additions
  const siteCss = await fs.readFile(path.join(SRC, 'site.css'), 'utf8');
  const head = $('head');
  if (mode === 'desktop') head.prepend(MOBILE_FALLBACK);
  head.append(`<style id="gc-site">${siteCss}</style>`);
  head.append(headEmbeds);
  head.append(`<script src="/assets/site.js?v=${await siteJsVersion()}" defer></script>`);
  $('body').prepend(bodyStart);
  $('body').append(bodyEnd);
  $('html').attr('data-gc-layout', mode);

  // --- put the snapshots back, processed the same way
  let out = $.html();
  for (let i = 0; i < templates.length; i++) {
    const { attrs, inner } = templates[i];
    const $t = cheerio.load(`<div id="gc-root">${inner}</div>`, null, false);
    await processFragment($t, $t('#gc-root')[0], mode, { inTemplate: true });
    if (/data-gc-open/.test(attrs)) {
      // Open-menu snapshot: keep link targets clean.
      $t('a[href]').each((_, el) => $t(el).attr('href', rewriteHref($t(el).attr('href'))));
    }
    out = out.replace(`<gc-tpl data-i="${i}"></gc-tpl>`, `<template${attrs}>${$t('#gc-root').html()}</template>`);
  }

  const rel = (mode === 'mobile' ? 'm/' : '') + (route === '' ? 'index.html' : route + '/index.html');
  await emit(rel, out);
  return { route, mode, pageId, bytes: Buffer.byteLength(out) };
}

let _jsv;
async function siteJsVersion() {
  if (!_jsv) _jsv = sha(await fs.readFile(path.join(SRC, 'site.js'), 'utf8')).slice(0, 8);
  return _jsv;
}

// ---------------------------------------------------------------- site files

async function siteFiles() {
  await emit('assets/site.js', await fs.readFile(path.join(SRC, 'site.js')));
  const urls = ROUTES.filter((r) => r !== 'thankyou')
    .map((r) => `  <url><loc>${ORIGIN}/${r}</loc></url>`)
    .join('\n');
  await emit('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.replace(`${ORIGIN}/</loc>`, `${ORIGIN}</loc>`)}\n</urlset>\n`);
  await emit('robots.txt', `User-agent: *\nAllow: /\nDisallow: /m/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  const feed = await download(ORIGIN + '/blog-feed.xml', 'application/xml,*/*');
  if (feed) await emit('blog-feed.xml', feed.buf);
  await fs.writeFile(path.join(ROOT, 'vercel.json'), JSON.stringify(vercelConfig(), null, 2) + '\n');
}

// Static hosting config. `routes` (not `rewrites`) because phone user agents must be
// routed to the mobile layout before Vercel's filesystem match serves the desktop file.
// No build runs on Vercel: public/ is prebuilt and committed (no build minutes, no functions).
function vercelConfig() {
  const ua = [{ type: 'header', key: 'user-agent', value: `.*(${MOBILE_UA_RE}).*` }];
  const notAsset = '(?!assets/|m/|_files/|sitemap\\.xml|robots\\.txt|blog-feed\\.xml)';
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    installCommand: 'echo "static site, nothing to install"',
    buildCommand: 'echo "static site, prebuilt in public/"',
    outputDirectory: 'public',
    routes: [
      ...Object.entries(REDIRECTS).map(([src, to]) => ({ src: `${src}/?`, status: 301, headers: { Location: to } })),
      { src: '/(.+)/', status: 308, headers: { Location: '/$1' } },
      { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/_files/(.*)', headers: { 'Cache-Control': 'public, max-age=604800' }, continue: true },
      { src: '/m/(.*)', headers: { 'X-Robots-Tag': 'noindex' }, continue: true },
      { src: '/((?!assets/).*)', headers: { Vary: 'User-Agent', 'Cache-Control': 'public, max-age=0, must-revalidate' }, continue: true },
      { src: '/', has: ua, dest: '/m/index.html' },
      { src: `/(${notAsset}[^.]+)`, has: ua, dest: '/m/$1/index.html' },
      { handle: 'filesystem' },
      { src: '/([^.]+)', dest: '/$1/index.html' },
    ],
  };
}

// ---------------------------------------------------------------- main

const only = process.argv.slice(2);
const routes = only.length ? only.map((r) => (r === 'index' ? '' : r)) : ROUTES;
if (!only.length) await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const results = [];
const queue = routes.flatMap((r) => [
  [r, 'desktop'],
  [r, 'mobile'],
]);
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [r, m] = queue.shift();
      try {
        const res = await buildPage(r, m);
        if (res) {
          results.push(res);
          console.log(`built ${m.padEnd(7)} /${r} ${(res.bytes / 1024).toFixed(0)}KB`);
        }
      } catch (e) {
        console.error(`FAILED ${m} /${r}:`, e);
        process.exitCode = 1;
      }
    }
  }),
);
await siteFiles();

const report = {
  pages: results.length,
  pageIds: Object.fromEntries(results.filter((r) => r.mode === 'desktop').map((r) => ['/' + r.route, r.pageId])),
  otherPhoneNumbersShown: [...otherNumbers],
  commercialFontsLeftOnWixCdn: [...commercialFonts].sort(),
  warnings: [...warnings],
};
await fs.writeFile(path.join(ROOT, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(`\n${results.length} pages built. ${warnings.size} warnings, ${commercialFonts.size} commercial font files left on Wix CDN (see build-report.json).`);
