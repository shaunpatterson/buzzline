// PROTOTYPE — throwaway (see NOTES.md). Serves the repo, pdf.js and a PDF proxy
// (most hosts send no CORS headers).
//   node prototype/pdf-viewer/serve.js        HOST / PORT override 127.0.0.1:8791
// /fetch will request any http(s) URL from this machine, so keep the server on
// localhost (Docker: publish with -p 127.0.0.1:8791:8791).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = +(process.env.PORT || 8791);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.pdf': 'application/pdf' };

// pdf.js: from vendor/ when present (the Docker image downloads it at build
// time; an extension page could not load it remotely either), else fetched
// from the CDN once and kept in memory.
const PDFJS_VERSION = '4.10.38';
const PDFJS_FILES = new Set(['pdf.min.mjs', 'pdf.worker.min.mjs']);
const VENDOR = path.join(__dirname, 'vendor');
const fetched = new Map();
async function pdfjs(name) {
  const local = path.join(VENDOR, name);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  if (!fetched.has(name)) {
    const r = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/${name}`);
    if (!r.ok) throw new Error(`pdf.js ${name}: HTTP ${r.status}`);
    fetched.set(name, Buffer.from(await r.arrayBuffer()));
  }
  return fetched.get(name);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/') { res.writeHead(302, { location: '/prototype/pdf-viewer/' }); res.end(); return; }
    if (u.pathname === '/fetch') {
      // Only http(s), and only bodies that really are PDFs get passed on.
      let target; try { target = new URL(u.searchParams.get('url')); } catch { target = null; }
      if (!target || !/^https?:$/.test(target.protocol)) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('url must be http(s)'); return; }
      const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
      const body = Buffer.from(await r.arrayBuffer());
      if (!r.ok || body.subarray(0, 1024).indexOf('%PDF-') < 0) { res.writeHead(502, { 'content-type': 'text/plain' }); res.end('not a PDF'); return; }
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(body);
      return;
    }
    const lib = /^\/vendor\/pdfjs\/([\w.]+)$/.exec(u.pathname);
    if (lib && PDFJS_FILES.has(lib[1])) { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'max-age=86400' }); res.end(await pdfjs(lib[1])); return; }
    let file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(502, { 'content-type': 'text/plain' }); res.end(String(e.message || e)); }
}).listen(PORT, HOST, () => console.log(`Buzzline PDF prototype: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/prototype/pdf-viewer/`));
