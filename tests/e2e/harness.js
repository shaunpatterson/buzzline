// Fixture harness: serves the repo, drives headless Chrome over the DevTools
// protocol (Node's built-in WebSocket; no npm dependencies) and loads the
// manifest's content scripts into a fixture page with a fake `chrome` adapter
// (tests/e2e/page.js). Used by tests/fixtures.test.js.
//
//   const h = await startHarness();          // null when no Chrome is found
//   const page = await h.open('article.html', { enabled: true });
//   await page.snapshot();                    // see page.js
//   await h.stop();
//
// Chrome: $CHROME_PATH, else the macOS app, else google-chrome / chromium on PATH.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SETTLE_MS = 2500;   // covers the 500/1500 ms late re-applies plus idle slices
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { candidates.push(execFileSync('which', [name], { encoding: 'utf8' }).trim()); } catch { /* not installed */ }
  }
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function serveRepo() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launchChrome(bin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bzln-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1200,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Chrome did not start:\n' + log)); }, 20000);
    proc.stderr.on('data', (d) => {
      log += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (m) { clearTimeout(timer); resolve({ proc, profile, wsUrl: m[1] }); }
    });
    proc.on('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited:\n' + log)); });
  });
}

// Minimal DevTools protocol client over one browser-level WebSocket
// (flattened sessions: page commands carry a sessionId).
class Cdp {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.calls = new Map(); this.waiters = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const c = this.calls.get(m.id); this.calls.delete(m.id);
        if (m.error) c.reject(new Error(`${c.method}: ${m.error.message}`)); else c.resolve(m.result);
        return;
      }
      for (const w of this.waiters) if (w.method === m.method && w.sessionId === m.sessionId) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m.params); break; }
    };
  }
  static connect(url) {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => { ws.onopen = () => resolve(new Cdp(ws)); ws.onerror = () => reject(new Error('DevTools connection failed')); });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.calls.set(id, { method, resolve, reject }));
  }
  once(method, sessionId) { return new Promise((resolve) => this.waiters.push({ method, sessionId, resolve })); }
}

async function startHarness() {
  const bin = findChrome();
  if (!bin) return null;
  const server = await serveRepo();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome(bin);
  const cdp = await Cdp.connect(chrome.wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  const pageScript = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

  // Evaluate an expression in the page; promises are awaited, values returned by value.
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  }
  const settle = (ms = SETTLE_MS) => new Promise((r) => setTimeout(r, ms));

  async function open(fixture, sync = { enabled: true }) {
    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await send('Page.navigate', { url: `${origin}/tests/e2e/fixtures/${fixture}` });
    await loaded;
    await evaluate(`(${pageScript})(${JSON.stringify(sync)})`);
    await settle();
    const call = (method, ...args) => evaluate(`window.__bzlnHarness.${method}(...${JSON.stringify(args)})`);
    return {
      evaluate, settle,
      snapshot: () => call('snapshot'),
      send: (msg) => call('send', msg),
      setSync: (obj) => call('setSync', obj),
      local: () => call('local'),
    };
  }

  async function stop() {
    const exited = new Promise((r) => chrome.proc.once('exit', r));
    try { await cdp.send('Browser.close'); } catch { /* already gone */ }
    chrome.proc.kill();
    await exited;
    fs.rmSync(chrome.profile, { recursive: true, force: true });
    await new Promise((r) => server.close(r));
  }

  return { open, stop };
}

module.exports = { startHarness, SETTLE_MS };
