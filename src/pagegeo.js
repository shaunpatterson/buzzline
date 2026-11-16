(() => {
  'use strict';

  // Page geometry shared by the reading ruler and the pacer: where a point is in
  // the text, the line boxes of a block, and scrolling the right container.

  // The text node and offset under a viewport point, or null (not over text).
  function caretAt(x, y) {
    let node = null, offset = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    }
    return node && node.nodeType === 3 ? { node, offset } : null;
  }

  // Client rects of the text (and only the text) inside `root`; null when the
  // block holds too many text nodes to measure cheaply.
  function textRects(root, cap = 600) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n, count = 0;
    while ((n = walker.nextNode())) {
      if (!/\S/.test(n.nodeValue)) continue;
      if (++count > cap) return null;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
    return out;
  }

  // The scrolling container of `el` (an overflow:auto/scroll ancestor), or null
  // when the page itself scrolls.
  function scrollParent(el) {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) return e;
    }
    return null;
  }

  // Visible vertical extent of the scroller around `el`: [top, bottom] in viewport px.
  function viewportOf(el) {
    const p = scrollParent(el);
    if (!p) return { top: 0, bottom: window.innerHeight };
    const r = p.getBoundingClientRect();
    return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) };
  }

  function scrollBy(el, dy, behavior = 'smooth') {
    const p = scrollParent(el);
    if (p) p.scrollBy({ top: dy, behavior });
    else window.scrollBy({ top: dy, behavior });
  }

  globalThis.BuzzlinePageGeo = { caretAt, textRects, scrollParent, viewportOf, scrollBy };
})();
