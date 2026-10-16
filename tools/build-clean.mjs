// Builds the clean templates (src/clean) over the 1:1 Wix copy: each clean page replaces the
// captured page at the same route, for desktop and for phones (/m/), since the templates are
// responsive. Pages are plain HTML with a small front-matter block (title, description, pageId);
// the shared header and footer come from src/clean/partials. The site's tracking embeds
// (tools/embeds.json) are added on the same pages as on Wix, keyed by the Wix pageId.
// Run after tools/build.mjs (which empties public/).
//
//   node tools/build-clean.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PHONE_DISPLAY, PHONE_TEL } from './routes.mjs';

const EMBEDS = JSON.parse(await fs.readFile(new URL('./embeds.json', import.meta.url), 'utf8'))
  // This one edits a label inside the Wix form markup, which the clean pages do not have.
  .filter((e) => e.name !== 'Whatconverts drop down');
const embeds = (pos, pageId) => EMBEDS
  .filter((e) => e.position === pos && (!e.pages || (pageId && e.pages.includes(pageId))))
  .map((e) => `
<!-- ${e.name} -->
${e.html}
`).join('');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'clean');
const OUT = path.join(ROOT, 'public');

const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const VARS = { tel: PHONE_TEL, phone: PHONE_DISPLAY, phoneIcon: PHONE_ICON };
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in VARS ? VARS[k] : m));
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function emit(rel, data) {
  const f = path.join(OUT, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, data);
}

// Static assets, content-hashed because /assets/* is served immutable.
async function asset(name, data) {
  const ext = path.extname(name);
  const rel = `assets/clean/${path.basename(name, ext)}-${hash(data)}${ext}`;
  await emit(rel, data);
  return '/' + rel;
}
const fontFile = path.join(ROOT, 'node_modules/@fontsource-variable/mulish/files/mulish-latin-wght-normal.woff2');
const fontUrl = await asset('mulish-latin.woff2', await fs.readFile(fontFile));
const fontCss = `@font-face{font-family:"Mulish";font-style:normal;font-weight:200 1000;font-display:swap;src:url(${fontUrl}) format("woff2")}\n`;
const cssUrl = await asset('styles.css', fontCss + await fs.readFile(path.join(SRC, 'styles.css'), 'utf8'));
const jsUrl = await asset('app.js', await fs.readFile(path.join(SRC, 'app.js')));

const header = fill(await fs.readFile(path.join(SRC, 'partials/header.html'), 'utf8'));
const footer = fill(await fs.readFile(path.join(SRC, 'partials/footer.html'), 'utf8'));

// Review bar pinned to the bottom of the homepage, switching between the redesign (/) and the
// captured Wix homepage kept at /legacy. Self-contained so it works on both builds.
const compareBar = (active) => `
<style id="gc-compare-style">
.gc-compare{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;height:48px;display:flex;align-items:center;justify-content:center;gap:16px;padding:0 16px;background:#000;color:#fff;font:600 15px/1 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
.gc-compare__label{opacity:.75}
.gc-compare__toggle{display:inline-flex;padding:3px;border-radius:999px;background:#2a2a2a}
.gc-compare__toggle a{display:inline-flex;align-items:center;height:32px;padding:0 16px;border-radius:999px;color:#fff;text-decoration:none}
.gc-compare__toggle a:hover{background:#3d3d3d;color:#fff}
.gc-compare__toggle a[aria-current="page"]{background:#fff;color:#000}
.gc-compare a:focus-visible{outline:3px solid #f2b705;outline-offset:2px}
body{padding-bottom:48px!important}
.stickycta{bottom:calc(48px + 1.5rem)!important}
.gc-callfab{bottom:72px!important}
@media (max-width:47.99em){.stickycta{bottom:48px!important}.gc-callfab{bottom:48px!important}body{padding-bottom:116px!important}.gc-compare__label{display:none}}
</style>
<nav class="gc-compare" aria-label="Homepage version">
  <span class="gc-compare__label">Homepage version</span>
  <span class="gc-compare__toggle">
    <a href="/legacy"${active === 'legacy' ? ' aria-current="page"' : ''}>Legacy</a>
    <a href="/"${active === 'redesign' ? ' aria-current="page"' : ''}>Redesign</a>
    <a href="https://grand-canal-v2.vercel.app/">V2</a>
  </span>
</nav>
`;

// Keep the captured Wix homepage (desktop and phone) at /legacy before the redesign replaces it.
for (const dir of ['', 'm']) {
  const wix = path.join(OUT, dir, 'index.html');
  let html;
  try { html = await fs.readFile(wix, 'utf8'); } catch { continue; }
  if (!html.includes('data-gc-layout')) continue;  // already replaced by an earlier run
  html = html.replace('<head>', '<head><meta name="robots" content="noindex">').replace(/<\/body>/, compareBar('legacy') + '</body>');
  await emit(path.join(dir, 'legacy', 'index.html'), html);
  console.log(`kept legacy homepage at /${dir ? dir + '/' : ''}legacy`);
}

const pages = (await fs.readdir(path.join(SRC, 'pages'))).filter((f) => f.endsWith('.html'));
for (const file of pages) {
  const raw = (await fs.readFile(path.join(SRC, 'pages', file), 'utf8')).replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const body = fill(m ? raw.slice(m[0].length) : raw);
  const slug = file === 'index.html' ? '' : file.replace(/\.html$/, '');
  const html = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'The Grand Canal Retirement Residence')}</title>
<meta name="description" content="${esc(meta.description || '')}">
<link rel="preload" href="${fontUrl}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${cssUrl}">
<link rel="icon" sizes="192x192" href="/assets/img/4d96be-b594daafa23e44449b7b3c805b82e0d7--0ed3615a.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/4d96be-b594daafa23e44449b7b3c805b82e0d7--085ece72.png" type="image/png">
<script src="${jsUrl}" defer></script>
${embeds('head', meta.pageId)}
</head>
<body>
${embeds('bodyStart', meta.pageId)}
${header}
<main id="main">
${body}
</main>
${footer}
${embeds('bodyEnd', meta.pageId)}
${slug === '' ? compareBar('redesign') : ''}
</body>
</html>
`;
  await emit(path.join(slug, 'index.html'), html);
  await emit(path.join('m', slug, 'index.html'), html);
  console.log(`built clean /${slug} (desktop + phone)`);
}
