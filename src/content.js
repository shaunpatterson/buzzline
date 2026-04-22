(() => {
  'use strict';

  // Four-entry cycle. Line i colors go palette[i%N] → palette[(i+1)%N].
  // The intentional duplicates (e.g. black in "classic") anchor every
  // other line to a neutral color — the BeeLine pattern in the screenshot.
  const SCHEMES = {
    classic:      ['#000000', '#1f4fb0', '#000000', '#b02a2a'],
    dark:         ['#eaeaea', '#7fb7ff', '#eaeaea', '#ff9c8a'],
    ocean:        ['#003a5c', '#0087c7', '#003a5c', '#00b3a4'],
    bumblebee:    ['#1a1a1a', '#d4a017', '#1a1a1a', '#8b4513'],
    highcontrast: ['#000000', '#0000ff', '#000000', '#d40000']
  };

  const CHAR_ATTR = 'data-bzln';
  const SKIP_TAGS = new Set([
    'SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','BUTTON',
    'CODE','PRE','KBD','SAMP','VAR','TT',
    'SVG','CANVAS','VIDEO','AUDIO','IMG','IFRAME','OBJECT','EMBED','MATH'
  ]);

  const state = { enabled: false, scheme: 'classic' };
  let mo = null;
  const pendingTimers = new Set();
  let applyTimer = null;
  let resizeTimer = null;

  const isCharSpan = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute(CHAR_ATTR);

  const skipElement = (el) => {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    return false;
  };

  const inSkippedAncestor = (node) => {
    let p = node.parentElement;
    while (p) {
      if (isCharSpan(p)) return true;
      if (skipElement(p)) return true;
      p = p.parentElement;
    }
    return false;
  };

  const acceptTextNode = (node) => {
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    if (!node.parentElement) return false;
    if (inSkippedAncestor(node)) return false;
    return true;
  };

  // Segment on grapheme clusters so we never split surrogate pairs, ZWJ
  // sequences, flag emoji, skin-tone modifiers, or combining marks.
  const segmenter =
    (typeof Intl !== 'undefined' && Intl.Segmenter)
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;

  const graphemes = (text) =>
    segmenter
      ? Array.from(segmenter.segment(text), (s) => s.segment)
      : Array.from(text); // code-point fallback

  function splitTextNode(node) {
    const text = node.nodeValue;
    if (!text) return;
    const frag = document.createDocumentFragment();
    for (const ch of graphemes(text)) {
      const span = document.createElement('span');
      span.setAttribute(CHAR_ATTR, '');
      span.textContent = ch;
      frag.appendChild(span);
    }
    node.parentNode.replaceChild(frag, node);
  }

  function processRoot(root) {
    if (!root) return;
    if (root.nodeType === 1 && (isCharSpan(root) || skipElement(root))) return;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => acceptTextNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const batch = [];
    let n;
    while ((n = walker.nextNode())) batch.push(n);
    for (const tn of batch) splitTextNode(tn);
  }

  function unprocessAll() {
    // Don't call normalize() — SPA frameworks (React, Vue, Angular) hold
    // direct references to specific text nodes for reconciliation. Merging
    // adjacent text nodes breaks them. Leaving them unmerged is harmless.
    const spans = document.querySelectorAll(`span[${CHAR_ATTR}]`);
    for (const span of spans) {
      const parent = span.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(span.textContent), span);
    }
  }

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  };
  const mix = (a, b, t) => ({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
  const rgbStr = (c) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;

  function applyColors() {
    const palette = (SCHEMES[state.scheme] || SCHEMES.classic).map(hexToRgb);
    const spans = document.querySelectorAll(`span[${CHAR_ATTR}]`);
    if (!spans.length) return;

    // Per-run caches scoped to one apply call. Keyed by parentElement,
    // which is stable within a run and shared by most sibling char spans —
    // collapses tens of thousands of getComputedStyle calls into a few.
    const blockByParent = new Map();
    const verticalByBlock = new Map();

    const getBlock = (el) => {
      const parent = el.parentElement;
      if (!parent) return document.body;
      const cached = blockByParent.get(parent);
      if (cached !== undefined) return cached;
      let p = parent;
      while (p && p !== document.body) {
        const d = getComputedStyle(p).display;
        if (d && d !== 'inline' && d !== 'inline-block' && d !== 'contents') break;
        p = p.parentElement;
      }
      const block = p || document.body;
      blockByParent.set(parent, block);
      return block;
    };

    const isVertical = (block) => {
      const cached = verticalByBlock.get(block);
      if (cached !== undefined) return cached;
      const wm = (getComputedStyle(block).writingMode || '').toLowerCase();
      const v = wm.startsWith('vertical') || wm.startsWith('sideways');
      verticalByBlock.set(block, v);
      return v;
    };

    // Group spans into visual lines. Skip vertical writing-mode blocks —
    // our top/left heuristic doesn't map to their flow direction.
    const lines = [];
    let current = null;
    let lastTop = null;
    let lastBlock = null;

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const rect = span.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const block = getBlock(span);
      if (isVertical(block)) continue;
      const top = rect.top;
      const heightGuard = Math.max(1, rect.height);
      const lineBreak =
        !current ||
        block !== lastBlock ||
        lastTop === null ||
        Math.abs(top - lastTop) > heightGuard * 0.6;
      if (lineBreak) {
        current = { spans: [], rects: [] };
        lines.push(current);
      }
      current.spans.push(span);
      current.rects.push(rect);
      lastTop = top;
      lastBlock = block;
    }

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line.spans.length) continue;
      const start = palette[li % palette.length];
      const end = palette[(li + 1) % palette.length];
      const firstLeft = line.rects[0].left;
      const lastRight = line.rects[line.rects.length - 1].right;
      const width = Math.max(1, lastRight - firstLeft);
      for (let i = 0; i < line.spans.length; i++) {
        const r = line.rects[i];
        const center = (r.left + r.right) / 2;
        const t = Math.max(0, Math.min(1, (center - firstLeft) / width));
        const c = mix(start, end, t);
        // Write to a custom property; content.css reads it via var().
        line.spans[i].style.setProperty('--bzln-c', rgbStr(c));
      }
    }
  }

  function trackTimer(id) { pendingTimers.add(id); return id; }

  function scheduleApply() {
    if (applyTimer) return;
    applyTimer = trackTimer(setTimeout(() => {
      pendingTimers.delete(applyTimer);
      applyTimer = null;
      if (state.enabled) applyColors();
    }, 40));
  }

  function onResize() {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      pendingTimers.delete(resizeTimer);
    }
    resizeTimer = trackTimer(setTimeout(() => {
      pendingTimers.delete(resizeTimer);
      resizeTimer = null;
      if (state.enabled) applyColors();
    }, 120));
  }

  function startObserving() {
    if (mo) mo.disconnect();
    mo = new MutationObserver((muts) => {
      let structureChanged = false;
      for (const m of muts) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (!isCharSpan(node)) processRoot(node);
            } else if (node.nodeType === 3) {
              if (acceptTextNode(node)) splitTextNode(node);
            }
          }
          // Any structural change may alter line wrapping — recolor.
          if (m.addedNodes.length || m.removedNodes.length) {
            structureChanged = true;
          }
        } else if (m.type === 'characterData') {
          const target = m.target;
          if (target.nodeType === 3 && acceptTextNode(target)) {
            splitTextNode(target);
            structureChanged = true;
          }
        }
      }
      if (structureChanged) scheduleApply();
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function enable() {
    if (mo) return; // already enabled
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', enable, { once: true });
      return;
    }
    processRoot(document.body);
    applyColors();
    startObserving();
    window.addEventListener('resize', onResize);
    // Late layout shifts (webfonts, images) change line wrapping after the
    // initial paint. Re-apply twice to catch them.
    trackTimer(setTimeout(() => { if (state.enabled) applyColors(); }, 500));
    trackTimer(setTimeout(() => { if (state.enabled) applyColors(); }, 1500));
  }

  function disable() {
    if (mo) { mo.disconnect(); mo = null; }
    window.removeEventListener('resize', onResize);
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.clear();
    applyTimer = null;
    resizeTimer = null;
    unprocessAll();
  }

  chrome.storage.sync.get(['enabled', 'scheme'], (res) => {
    state.enabled = !!res.enabled;
    state.scheme = res.scheme || 'classic';
    if (state.enabled) enable();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('scheme' in changes) {
      state.scheme = changes.scheme.newValue || 'classic';
      if (state.enabled) applyColors();
    }
    if ('enabled' in changes) {
      const next = !!changes.enabled.newValue;
      if (next === state.enabled) return;
      state.enabled = next;
      if (next) enable(); else disable();
    }
  });
})();
