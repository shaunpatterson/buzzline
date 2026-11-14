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
// Every call times out (CALL_TIMEOUT_MS) and a dropped connection fails all
// pending calls, so a dead or wedged browser surfaces as an error, never a hang.
const CALL_TIMEOUT_MS = 30000;
class Cdp {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.calls = new Map(); this.waiters = []; this.closed = false;
    ws.onclose = () => {
      this.closed = true;
      for (const c of this.calls.values()) c.reject(new Error(`${c.method}: browser connection closed`));
      this.calls.clear();
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const c = this.calls.get(m.id); if (!c) return; this.calls.delete(m.id);
        clearTimeout(c.timer);
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
    if (this.closed) return Promise.reject(new Error(`${method}: browser connection closed`));
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.calls.delete(id); reject(new Error(`${method}: no reply in ${CALL_TIMEOUT_MS} ms`)); }, CALL_TIMEOUT_MS);
      this.calls.set(id, { method, resolve, reject, timer });
    });
  }
  once(method, sessionId) { return new Promise((resolve) => this.waiters.push({ method, sessionId, resolve })); }
  // Forget unanswered once() waiters (a page whose load event never came).
  drop(method, sessionId) { this.waiters = this.waiters.filter((w) => w.method !== method || w.sessionId !== sessionId); }
}

// Script sources are read here and passed into the page, so page CSP never
// blocks them and fixture pages need not serve the extension's files.
function extensionSources() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  return {
    scripts: manifest.content_scripts[0].js.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')),
    collector: fs.readFileSync(path.join(__dirname, 'collector.js'), 'utf8')
  };
}

// A real desktop Chrome UA: some sites serve bot walls to "HeadlessChrome".
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

async function startHarness() {
  const bin = findChrome();
  if (!bin) return null;
  const server = await serveRepo();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome(bin);
  const cdp = await Cdp.connect(chrome.wsUrl);
  const pageScript = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');
  const settle = (ms = SETTLE_MS) => new Promise((r) => setTimeout(r, ms));

  // One browser tab. open(fixture) runs the extension in the fixture page's
  // main world; visit(url) loads a real site and runs it in an isolated world,
  // as Chrome runs content scripts, so the page's own `chrome` and CSP are
  // untouched.
  async function newTab() {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setUserAgentOverride', { userAgent: USER_AGENT });
    let contextId;   // undefined = main world

    // Evaluate an expression in the page; promises are awaited, values returned by value.
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, contextId });
      if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
      return r.result.value;
    }
    const call = (method, ...args) => evaluate(`window.__bzlnHarness.${method}(...${JSON.stringify(args)})`);
    const page = {
      evaluate, settle,
      snapshot: () => call('snapshot'),
      send: (msg) => call('send', msg),
      setSync: (obj) => call('setSync', obj),
      local: () => call('local'),
      collect: () => call('collect'),
    };
    async function load(url, timeoutMs) {
      cdp.drop('Page.loadEventFired', sessionId);
      const loaded = cdp.once('Page.loadEventFired', sessionId);
      const nav = await send('Page.navigate', { url });
      if (nav.errorText) throw new Error(`navigate ${url}: ${nav.errorText}`);
      await Promise.race([loaded, settle(timeoutMs)]);   // slow pages: go on after timeoutMs
    }
    async function inject(sync, sources = extensionSources()) {
      await evaluate(`(${pageScript})(${JSON.stringify(sync)}, ${JSON.stringify(sources)})`);
      await settle();
      return page;
    }
    return {
      async open(fixture, sync = { enabled: true }) {
        contextId = undefined;
        await load(`${origin}/tests/e2e/fixtures/${fixture}`, 15000);
        return inject(sync);
      },
      // sources: extension script sources to run instead of the repo's (live
      // pipeline experiments, e.g. a different model threshold); see extensionSources().
      async visit(url, sync = { enabled: true }, { loadTimeoutMs = 20000, sources } = {}) {
        contextId = undefined;
        await load(url, loadTimeoutMs);
        await settle(1500);   // late client-side rendering
        const { frameTree } = await send('Page.getFrameTree');
        ({ executionContextId: contextId } = await send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'buzzline-harness', grantUniveralAccess: false }));
        return inject(sync, sources);
      },
      close: () => cdp.send('Target.closeTarget', { targetId }).catch(() => {})
    };
  }

  const first = await newTab();

  async function stop() {
    const exited = new Promise((r) => chrome.proc.once('exit', r));
    try { await cdp.send('Browser.close'); } catch { /* already gone */ }
    // A Chrome that already died never emits 'exit' again: only wait if it is alive.
    if (chrome.proc.exitCode === null && chrome.proc.signalCode === null) {
      chrome.proc.kill();
      await Promise.race([exited, settle(5000)]);
      if (chrome.proc.exitCode === null && chrome.proc.signalCode === null) chrome.proc.kill('SIGKILL');
    }
    // Chrome's helper processes can still be writing to the profile for a moment.
    fs.rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    server.closeAllConnections();   // a helper process can hold a keep-alive socket open
    await new Promise((r) => server.close(r));
  }

  return { open: first.open, visit: first.visit, newTab, stop };
}

module.exports = { startHarness, extensionSources, SETTLE_MS };
