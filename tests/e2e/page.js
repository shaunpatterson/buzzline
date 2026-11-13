// Page side of the fixture harness (tests/e2e/harness.js evaluates this file
// as a function expression in the fixture page). Installs a fake `chrome`
// adapter: in-memory storage with async callbacks and onChanged events, and a
// captured runtime.onMessage listener. Then loads the manifest's content
// scripts and exposes window.__bzlnHarness.
async (initialSync) => {
  const later = (fn) => setTimeout(fn, 0);   // chrome.* callbacks are async
  const store = { sync: { ...initialSync }, local: {} };
  const onChanged = [], onMessage = [];
  const area = (name) => ({
    get(keys, cb) {
      const out = {};
      for (const k of [].concat(keys)) if (k in store[name]) out[k] = structuredClone(store[name][k]);
      later(() => cb(out));
    },
    set(obj, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: store[name][k], newValue: structuredClone(v) }; store[name][k] = structuredClone(v); }
      later(() => { for (const fn of onChanged) fn(changes, name); if (cb) cb(); });
    }
  });
  window.chrome = {
    storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (fn) => onChanged.push(fn) } },
    runtime: { onMessage: { addListener: (fn) => onMessage.push(fn) } }
  };

  const nc = { cache: 'no-store' };
  const manifest = await (await fetch('/manifest.json', nc)).json();
  for (const f of manifest.content_scripts[0].js) (0, eval)(await (await fetch('/' + f, nc)).text());
  const collectorSrc = await (await fetch('/tests/e2e/collector.js', nc)).text();

  const OWN = '.bzln-sprint-root, [data-bzln-launcher]';
  const ranges = (inside) => {
    let n = 0;
    for (const [name, h] of CSS.highlights) {
      if (!name.startsWith('bzln-')) continue;
      for (const r of h) {
        const p = r.startContainer.parentElement;
        if (!inside || (p && p.closest(inside))) n++;
      }
    }
    return n;
  };
  // Share of an element's own text (launchers excluded) that is coloured.
  const colouredShare = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let total = 0, coloured = 0, n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim() || n.parentElement.closest(OWN)) continue;
      total += n.nodeValue.length;
      if (window.__bzlnIsColoured(n)) coloured += n.nodeValue.length;
    }
    return total ? coloured / total : 0;
  };
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.textContent || '').trim().slice(0, 40) + '"';

  // Readability, measured independently of the extension: the browser
  // converts any CSS colour (oklab(), color-mix(), ...) by painting a pixel.
  const px = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  const toRgb = (css) => { px.clearRect(0, 0, 1, 1); px.fillStyle = css; px.fillRect(0, 0, 1, 1); const [r, g, b, a] = px.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
  const surfaceOf = (el) => {
    for (let e = el; e; e = e.parentElement) { const c = toRgb(getComputedStyle(e).backgroundColor); if (c.a >= 0.5) return c; }
    return { r: 255, g: 255, b: 255 };   // the canvas default
  };
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Lowest contrast of any colour the extension painted inside el against
  // el's surface; null when nothing inside is painted.
  const minContrast = (el) => {
    const bg = surfaceOf(el);
    let min = null;
    for (const [name, h] of CSS.highlights) {
      const m = /^bzln-(\d+)-(\d+)-(\d+)/.exec(name);
      if (!m) continue;
      for (const r of h) {
        if (!el.contains(r.startContainer)) continue;
        const c = contrast({ r: +m[1], g: +m[2], b: +m[3] }, bg);
        if (min === null || c < min) min = c;
      }
    }
    return min === null ? null : +min.toFixed(2);
  };

  window.__bzlnHarness = {
    send: (msg) => { for (const fn of onMessage) fn(msg); },
    setSync: (obj) => { chrome.storage.sync.set(obj); },
    local: () => structuredClone(store.local),
    snapshot: () => ({
      ranges: ranges(),
      readerRanges: ranges('.bzln-reader-root'),
      launchers: document.querySelectorAll('[data-bzln-launcher]').length,
      readerOpen: !!document.querySelector('.bzln-reader-root'),
      sprintOpen: !!document.querySelector('.bzln-sprint-root'),
      sprintWord: (document.querySelector('.bzln-sprint-word') || {}).textContent || null,
      linkClass: document.documentElement.classList.contains('bzln-neutral-links'),
      blocks: (0, eval)(collectorSrc).blocks.length,
      // Fixture expectations: data-expect="coloured" (most of its text is
      // coloured) or "plain" (none of it is); contrast = lowest contrast of
      // the painted colours against the element's surface.
      expectations: [...document.querySelectorAll('[data-expect]')].map((el) => ({
        el: describe(el), expect: el.dataset.expect, share: +colouredShare(el).toFixed(3), contrast: minContrast(el)
      }))
    })
  };
}
