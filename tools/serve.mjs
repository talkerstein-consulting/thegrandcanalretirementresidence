// Local static server that behaves like the production config (vercel.json):
//   - phones (by user agent) get the mobile layout from public/m/ at the same URL,
//     like Wix's dynamic serving; tablets and desktops get the desktop layout
//   - clean URLs (/about-us -> public/about-us/index.html)
//   - brotli/gzip for text, immutable caching for /assets/*
//
//   node tools/serve.mjs [port]        (default 4321)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MOBILE_UA_RE, REDIRECTS } from './routes.mjs';

// Resolve public/ next to this script so the server works from any working directory.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.argv[2]) || 4321;
const MOBILE = new RegExp(MOBILE_UA_RE);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};
const COMPRESSIBLE = /\.(html|css|js|json|xml|txt|svg)$/;

function resolve(urlPath, mobile) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/\/+$/, '') || '/';
  const candidates = [];
  const base = mobile && !clean.startsWith('/m/') && !clean.startsWith('/assets/') ? ['/m', ''] : [''];
  for (const b of base) {
    const p = b + (clean === '/' ? '' : clean);
    candidates.push(p || '/', p + '/index.html', p + '.html');
  }
  for (const c of candidates) {
    const f = path.join(ROOT, c);
    if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http
  .createServer((req, res) => {
    const target = REDIRECTS[req.url.split('?')[0].replace(/\/+$/, '')];
    if (target) {
      res.writeHead(301, { location: target });
      return res.end();
    }
    const mobile = MOBILE.test(req.headers['user-agent'] || '');
    const file = resolve(req.url, mobile);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': req.url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      vary: 'User-Agent, Accept-Encoding',
    };
    const stat = fs.statSync(file);
    // Range requests (video seeking/streaming).
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range && ext === '.mp4') {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, { ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    const enc = req.headers['accept-encoding'] || '';
    if (COMPRESSIBLE.test(ext) && /\bbr\b/.test(enc)) {
      res.writeHead(200, { ...headers, 'content-encoding': 'br' });
      return fs.createReadStream(file).pipe(zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
    }
    if (COMPRESSIBLE.test(ext) && /\bgzip\b/.test(enc)) {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
      return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    }
    res.writeHead(200, { ...headers, 'content-length': stat.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Grand Canal copy: http://localhost:${PORT}  (phone user agents get the mobile layout)`));
