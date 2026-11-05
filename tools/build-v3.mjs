// Publishes V3 (v3/: the V2 pages merged into one continuous scroll) at /v3, for desktop and
// phones (/m/v3), with the homepage version bar. Paths become absolute (/v3/...) because Vercel
// strips the trailing slash, so relative paths would resolve against the site root.
// Run after tools/build-clean.mjs (it copies the version bar from the built homepage).
//
//   node tools/build-v3.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'v3');
const OUT = path.join(ROOT, 'public');

const home = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
const bar = home.match(/<style id="gc-compare-style">[\s\S]*?<\/nav>/);
if (!bar) throw new Error('Version bar not found in public/index.html; run build-clean first.');
const v3Bar = bar[0]
  .replace(/ aria-current="page"/g, '')
  .replace('<a href="/v3">', '<a href="/v3" aria-current="page">');

const abs = (s) => s
  .replace(/(["'(])(?:\.\/)?assets\//g, '$1/v3/assets/')
  .replace(/src="\.\/support\.js"/g, 'src="/v3/support.js"');

await fs.rm(path.join(OUT, 'v3'), { recursive: true, force: true });
await fs.mkdir(path.join(OUT, 'v3'), { recursive: true });

let html = abs(await fs.readFile(path.join(SRC, 'index.html'), 'utf8'));
html = html.replace(/<\/body>/, v3Bar + '\n</body>');
for (const dir of ['v3', 'm/v3']) {
  await fs.mkdir(path.join(OUT, dir), { recursive: true });
  await fs.writeFile(path.join(OUT, dir, 'index.html'), html);
}
for (const f of await fs.readdir(SRC)) {
  if (f.endsWith('.dc.html')) await fs.writeFile(path.join(OUT, 'v3', f), abs(await fs.readFile(path.join(SRC, f), 'utf8')));
}
// The runtime fetches components relative to the page; point it at /v3.
const runtime = await fs.readFile(path.join(SRC, 'support.js'), 'utf8');
if (!runtime.includes('var COMPONENT_DIR = ".";')) throw new Error('support.js: COMPONENT_DIR not found');
await fs.writeFile(path.join(OUT, 'v3', 'support.js'), runtime.replace('var COMPONENT_DIR = ".";', 'var COMPONENT_DIR = "/v3";'));
await fs.cp(path.join(SRC, 'assets'), path.join(OUT, 'v3', 'assets'), { recursive: true });
console.log('published V3 at /v3 and /m/v3');
