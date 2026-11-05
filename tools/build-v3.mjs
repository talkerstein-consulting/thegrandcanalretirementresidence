// Publishes the V3 single page (site/) at /v3, for desktop and phones (/m/v3), with the
// homepage version bar. Asset paths become absolute (/v3/assets/...) because Vercel strips
// the trailing slash, so relative paths would resolve against the site root.
// Run after tools/build-clean.mjs (it copies the version bar from the built homepage).
//
//   node tools/build-v3.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'site');
const OUT = path.join(ROOT, 'public');

const home = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
const bar = home.match(/<style id="gc-compare-style">[\s\S]*?<\/nav>/);
if (!bar) throw new Error('Version bar not found in public/index.html; run build-clean first.');
const v3Bar = bar[0]
  .replace(/ aria-current="page"/g, '')
  .replace('<a href="/v3">', '<a href="/v3" aria-current="page">')
  // Lift V3's own pinned visit button above the bar.
  .replace('</style>', '.pin{bottom:74px!important}\n@media (max-width:600px){.pin{bottom:48px!important}body{padding-bottom:128px!important}}\n</style>');

const abs = (s) => s.replace(/(["'(])assets\//g, '$1/v3/assets/')
  .replace(/(href|src)="(styles\.css|app\.js)"/g, '$1="/v3/$2"');

let html = abs(await fs.readFile(path.join(SRC, 'index.html'), 'utf8'));
html = html.replace(/<\/body>/, v3Bar + '\n</body>');
for (const dir of ['v3', 'm/v3']) {
  await fs.mkdir(path.join(OUT, dir), { recursive: true });
  await fs.writeFile(path.join(OUT, dir, 'index.html'), html);
}
await fs.writeFile(path.join(OUT, 'v3', 'styles.css'), abs(await fs.readFile(path.join(SRC, 'styles.css'), 'utf8')));
await fs.writeFile(path.join(OUT, 'v3', 'app.js'), abs(await fs.readFile(path.join(SRC, 'app.js'), 'utf8')));
await fs.cp(path.join(SRC, 'assets'), path.join(OUT, 'v3', 'assets'), { recursive: true });
console.log('published V3 at /v3 and /m/v3');
