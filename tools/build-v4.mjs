// Publishes the V4 compact single page (v4/) at /v4, for desktop and phones (/m/v4), with the
// homepage version bar. Asset paths become absolute (/v4/assets/...) because Vercel strips
// the trailing slash, so relative paths would resolve against the site root.
// Run after tools/build-clean.mjs (it copies the version bar from the built homepage).
//
//   node tools/build-v4.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'v4');
const OUT = path.join(ROOT, 'public');

const home = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
const bar = home.match(/<style id="gc-compare-style">[\s\S]*?<\/nav>/);
if (!bar) throw new Error('Version bar not found in public/index.html; run build-clean first.');
const v4Bar = bar[0]
  .replace(/ aria-current="page"/g, '')
  .replace('<a href="/v4">', '<a href="/v4" aria-current="page">')
  // Lift V4's own pinned visit button above the bar.
  .replace('</style>', '.pin{bottom:74px!important}\n@media (max-width:600px){.pin{bottom:48px!important}body{padding-bottom:128px!important}}\n</style>');

const abs = (s) => s.replace(/(["'(])assets\//g, '$1/v4/assets/')
  .replace(/(href|src)="(styles\.css|app\.js)"/g, '$1="/v4/$2"');

let html = abs(await fs.readFile(path.join(SRC, 'index.html'), 'utf8'));
html = html.replace(/<\/body>/, v4Bar + '\n</body>');
for (const dir of ['v4', 'm/v4']) {
  await fs.mkdir(path.join(OUT, dir), { recursive: true });
  await fs.writeFile(path.join(OUT, dir, 'index.html'), html);
}
await fs.writeFile(path.join(OUT, 'v4', 'styles.css'), abs(await fs.readFile(path.join(SRC, 'styles.css'), 'utf8')));
await fs.writeFile(path.join(OUT, 'v4', 'app.js'), abs(await fs.readFile(path.join(SRC, 'app.js'), 'utf8')));
await fs.cp(path.join(SRC, 'assets'), path.join(OUT, 'v4', 'assets'), { recursive: true });
console.log('published V4 at /v4 and /m/v4');
