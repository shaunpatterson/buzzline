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
      // coloured) or "plain" (none of it is).
      expectations: [...document.querySelectorAll('[data-expect]')].map((el) => ({
        el: describe(el), expect: el.dataset.expect, share: +colouredShare(el).toFixed(3)
      }))
    })
  };
}
