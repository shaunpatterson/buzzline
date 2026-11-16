(() => {
  'use strict';

  // Reading ruler: a band that marks the line under the pointer and dims, tints
  // or underlines it. It follows the pointer (snapping to real line boxes) and
  // Alt+Up / Alt+Down move it a line. Controlled by content.js from the settings:
  // start({ style, lines }), stop(). Works on any text, including the Reader
  // overlay, and on the PDF reader (which supplies line boxes for its canvas
  // pages through window.__bzlnLinesAt).
  const { indexAt, groupLines, bandOf } = globalThis.BuzzlineLines;
  const G = globalThis.BuzzlinePageGeo;
  const B = globalThis.BuzzlineBlocks;

  let st = null;   // live ruler, or null when off

  // What lies under a viewport point: { lines, index, left, right, el } for the
  // block of text there, or null.
  function resolveAt(x, y) {
    if (typeof window.__bzlnLinesAt === 'function') {
      const r = window.__bzlnLinesAt(x, y);
      if (r) return r;
    }
    const caret = G.caretAt(x, y);
    if (!caret) return null;
    const el = caret.node.parentElement;
    if (!el || el.closest('.bzln-ruler-root, .bzln-sprint-root')) return null;
    const block = B.nearestBlock(el);
    // Fall back to the one text node when the block is too big to measure.
    const rects = G.textRects(block) || G.textRects(caret.node.parentElement);
    if (!rects) return null;
    const lines = groupLines(rects);
    const index = indexAt(lines, y);
    if (index < 0) return null;
    return { lines, index, left: Math.min(...lines.map((l) => l.left)), right: Math.max(...lines.map((l) => l.right)), el: block };
  }

  function hide() { st.band.style.display = 'none'; }

  function draw(res) {
    const count = st.style === 'underline' ? 1 : st.lines;
    const b = bandOf(res.lines, res.index, count);
    const padY = 2, padX = 8;
    const s = st.band.style;
    s.display = 'block';
    s.left = Math.max(0, res.left - padX) + 'px';
    s.width = Math.max(0, res.right - res.left + 2 * padX) + 'px';
    s.top = (b.top - padY) + 'px';
    s.height = (b.bottom - b.top + 2 * padY) + 'px';
    st.cur = res;
  }

  function update(fromScroll) {
    if (!st) return;
    st.raf = 0;
    if (st.x == null) return;
    if (document.querySelector('.bzln-sprint-root')) { hide(); return; }   // Sprint covers the page
    const res = resolveAt(st.x, st.y);
    if (res) draw(res);
    else if (fromScroll) hide();   // the old line has scrolled away from the pointer
  }
  function schedule(fromScroll) {
    if (st.raf) { if (fromScroll) st.scrolled = true; return; }
    st.scrolled = !!fromScroll;
    st.raf = setTimeout(() => update(st && st.scrolled), 16);   // one measurement per frame at most
  }

  // Move the band one line up (-1) or down (1).
  function nudge(dir) {
    const c = st.cur;
    if (!c) return;
    const i = c.index + dir;
    let res = null;
    if (i >= 0 && i < c.lines.length) res = { ...c, index: i };
    else {
      const edge = dir > 0 ? c.lines[c.lines.length - 1].bottom + 8 : c.lines[0].top - 8;
      res = resolveAt(st.x, edge);
    }
    if (!res) { G.scrollBy(c.el || document.body, dir * 60); return; }
    const line = res.lines[res.index];
    st.y = (line.top + line.bottom) / 2;
    draw(res);
    // keep the band in view: scroll the container by the distance it ran off
    const view = G.viewportOf(res.el || document.body);
    const h = line.bottom - line.top;
    if (line.top < view.top + 40) G.scrollBy(res.el || document.body, line.top - (view.top + 40) - h, 'instant');
    else if (line.bottom > view.bottom - 40) G.scrollBy(res.el || document.body, line.bottom - (view.bottom - 40) + h, 'instant');
    schedule(true);
  }

  function start({ style, lines }) {
    if (st) { st.style = style; st.lines = lines; st.root.dataset.style = style; if (st.cur) draw(st.cur); return; }
    const root = document.createElement('div');
    root.className = 'bzln-ruler-root';
    root.dataset.style = style;
    const band = document.createElement('div');
    band.className = 'bzln-ruler-band';
    band.style.display = 'none';
    root.appendChild(band);
    document.documentElement.appendChild(root);
    st = { root, band, style, lines, x: null, y: null, cur: null, raf: 0, scrolled: false };
    st.onMove = (e) => { st.x = e.clientX; st.y = e.clientY; schedule(false); };
    st.onScroll = () => schedule(true);
    st.onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      nudge(e.key === 'ArrowDown' ? 1 : -1);
    };
    document.addEventListener('pointermove', st.onMove, { capture: true, passive: true });
    document.addEventListener('scroll', st.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', st.onScroll, { passive: true });
    document.addEventListener('keydown', st.onKey, true);
  }

  function stop() {
    if (!st) return;
    if (st.raf) clearTimeout(st.raf);
    document.removeEventListener('pointermove', st.onMove, true);
    document.removeEventListener('scroll', st.onScroll, true);
    window.removeEventListener('resize', st.onScroll);
    document.removeEventListener('keydown', st.onKey, true);
    st.root.remove();
    st = null;
  }

  globalThis.BuzzlineRuler = { start, stop, isOn: () => !!st };
})();
