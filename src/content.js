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
  const LAUNCHER_ATTR = 'data-bzln-launcher';
  const GRAD_ATTR = 'data-bzln-grad';
  const LAUNCHER_MIN_CHARS = 120; // skip captions / tiny labels
  const SKIP_TAGS = new Set([
    'SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','BUTTON',
    'CODE','PRE','KBD','SAMP','VAR','TT',
    'SVG','CANVAS','VIDEO','AUDIO','IMG','IFRAME','OBJECT','EMBED','MATH'
  ]);

  // Page chrome we never want to color — only the main reading prose.
  const NON_CONTENT_TAGS = new Set([
    'NAV','HEADER','FOOTER','ASIDE','FORM','DIALOG','MENU'
  ]);
  const NON_CONTENT_ROLES = new Set([
    'navigation','banner','complementary','contentinfo',
    'search','form','dialog','menubar','menu','toolbar',
    'tablist','tab','status','alert','alertdialog'
  ]);
  const NON_CONTENT_TOKENS = new Set([
    'nav','navbar','navigation','menu','menubar','mobilemenu','navmenu',
    'header','masthead','topbar',
    'footer',
    'sidebar','sidenav','aside',
    'ad','ads','adv','advert','advertisement','adsense','adsbygoogle',
    'sponsor','sponsored',
    'banner','promo','promotion','promoted',
    'social','share','sharing','follow',
    'related','recommended','recommend',
    'widget','gadget',
    'popup','popover','modal','overlay','tooltip','toast','snackbar',
    'notice','cookie','cookies','consent','gdpr',
    'newsletter','signup','subscribe','subscription',
    'login','auth','signin','register',
    'breadcrumb','breadcrumbs',
    'byline',
    'pagination','pager','paginator',
    'taglist','tagcloud','categories',
    'slashbox','slashboxes',
    'searchbar',
    'skiplink'
  ]);

  // Split on whitespace only — NOT on hyphens/underscores. Modern sites use
  // hyphenated utility classes (e.g. Tailwind's `fixed-sidebar`, `flex-nav-
  // expanded`, `min-h-[calc(100dvh_-_var(--shreddit-header-height))]`) that
  // would otherwise yield false-positive matches against "sidebar", "nav",
  // "header" and skip the entire content subtree. We match only whole class
  // names and whole ids.
  const tokensOf = (s) =>
    s ? s.toLowerCase().split(/\s+/).filter(Boolean) : [];

  const isNonContent = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (NON_CONTENT_TAGS.has(el.tagName)) return true;
    const role = el.getAttribute && el.getAttribute('role');
    if (role && NON_CONTENT_ROLES.has(role.toLowerCase())) return true;
    const cls = el.getAttribute && el.getAttribute('class');
    if (cls) {
      for (const t of tokensOf(cls)) if (NON_CONTENT_TOKENS.has(t)) return true;
    }
    const id = el.id;
    if (id) {
      for (const t of tokensOf(id)) if (NON_CONTENT_TOKENS.has(t)) return true;
    }
    return false;
  };

  const state = { enabled: false, scheme: 'classic', disabledHosts: [] };
  const currentHost = (location.hostname || '').toLowerCase();
  const isHostDisabled = () =>
    Array.isArray(state.disabledHosts) && state.disabledHosts.includes(currentHost);
  let mo = null;
  const pendingTimers = new Set();
  let applyTimer = null;
  let resizeTimer = null;

  const isCharSpan = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute(CHAR_ATTR);

  const isLauncher = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute(LAUNCHER_ATTR);

  const skipElement = (el) => {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (isLauncher(el)) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    return false;
  };

  const inSkippedAncestor = (node) => {
    let p = node.parentElement;
    while (p) {
      if (isCharSpan(p)) return true;
      if (skipElement(p)) return true;
      if (isNonContent(p)) return true;
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
    if (root.nodeType === 1 && (isCharSpan(root) || skipElement(root) || isNonContent(root))) return;
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
    const launchers = document.querySelectorAll(`[${LAUNCHER_ATTR}]`);
    for (const l of launchers) l.remove();
    const grad = document.querySelectorAll(`[${GRAD_ATTR}]`);
    for (const el of grad) clearGradientStyle(el);
    closeReader();
  }

  function clearGradientStyle(el) {
    el.removeAttribute(GRAD_ATTR);
    el.style.removeProperty('background-image');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    el.style.removeProperty('color');
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

    const blocks = new Set();
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
      blocks.add(getBlock(line.spans[0]));
    }

    syncLaunchers(blocks);
    applyGradientBlocks(palette);
  }

  // Safe-mode gradient for contenteditable blocks (Notion, Google Docs-like
  // editors). We can't insert char spans into a CE subtree — the editor's
  // reconciler will wipe them on every keystroke and/or break caret/arrow-key
  // navigation. Instead we paint a per-block CSS gradient onto the leaf via
  // background-clip:text, keeping the DOM untouched. Colors still cycle across
  // leaves using the same palette.
  const isGradientLeaf = (el) => {
    if (!el || el.nodeType !== 1) return false;
    // A CE *root* contains nested CE elements — we only want the leaves.
    if (el.querySelector && el.querySelector('[contenteditable="true"]')) return false;
    const text = (el.textContent || '').trim();
    if (!text) return false;
    return true;
  };

  function findGradientLeaves() {
    const nodes = document.querySelectorAll(
      '[contenteditable="true"], [data-content-editable-leaf="true"]'
    );
    const out = [];
    for (const n of nodes) {
      if (!isGradientLeaf(n)) continue;
      let p = n.parentElement;
      let skip = false;
      while (p) {
        if (isNonContent(p) || SKIP_TAGS.has(p.tagName)) { skip = true; break; }
        p = p.parentElement;
      }
      if (!skip) out.push(n);
    }
    return out;
  }

  function applyGradientBlocks(palette) {
    const leaves = findGradientLeaves();
    const current = new Set(leaves);
    const old = document.querySelectorAll(`[${GRAD_ATTR}]`);
    for (const el of old) if (!current.has(el)) clearGradientStyle(el);
    for (let i = 0; i < leaves.length; i++) {
      const el = leaves[i];
      const start = rgbStr(palette[i % palette.length]);
      const end = rgbStr(palette[(i + 1) % palette.length]);
      el.setAttribute(GRAD_ATTR, '');
      // !important — Notion's React may replace the style string on edit;
      // when that happens, the MutationObserver re-runs applyColors and we
      // paint again. Self-healing rather than fighting React directly.
      el.style.setProperty(
        'background-image',
        `linear-gradient(to right, ${start}, ${end})`,
        'important'
      );
      el.style.setProperty('background-clip', 'text', 'important');
      el.style.setProperty('-webkit-background-clip', 'text', 'important');
      el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      el.style.setProperty('color', 'transparent', 'important');
    }
  }

  // Per-block "Sprint this" launcher. Inserted as the first child of each
  // colored block so it scrolls with content and survives reflow. We tag
  // launchers with LAUNCHER_ATTR so skipElement/acceptTextNode ignore them.
  function makeLauncher(block) {
    const btn = document.createElement('button');
    btn.setAttribute(LAUNCHER_ATTR, '');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Sprint-read this section');
    btn.title = 'Sprint-read this section';
    btn.innerHTML =
      '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect x="0" y="0" width="20" height="20" rx="5" fill="#f7c948"/>' +
        '<path d="M7.5 5.2 L15 10 L7.5 14.8 Z" fill="#1a1a1a"/>' +
      '</svg>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = extractReadableText(block);
      if (text && typeof window.__bzlnSprint === 'function') {
        window.__bzlnSprint(text);
      }
    });
    return btn;
  }

  function extractReadableText(block) {
    // Pull text from non-skipped descendants. Keep whitespace nodes —
    // after splitTextNode, every grapheme (including spaces) is its own
    // char span, so stripping whitespace here would glue every word
    // together. Join with '' to reconstruct the original text, then
    // collapse runs of whitespace.
    const parts = [];
    const walker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => {
          if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
          let p = n.parentElement;
          while (p && p !== block) {
            if (isLauncher(p) || skipElement(p) || isNonContent(p)) {
              return NodeFilter.FILTER_REJECT;
            }
            p = p.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        } }
    );
    let n;
    while ((n = walker.nextNode())) parts.push(n.nodeValue);
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  function syncLaunchers(blocks) {
    const seen = new Set();
    for (const block of blocks) {
      if (!block || !block.isConnected) continue;
      // Only mount launchers directly into block-level containers (avoid
      // floating a button into <body> when a block couldn't be resolved).
      if (block === document.body) continue;
      const textLen = (block.textContent || '').length;
      if (textLen < LAUNCHER_MIN_CHARS) continue;

      let launcher = block.firstElementChild;
      if (launcher && !isLauncher(launcher)) launcher = null;
      if (!launcher) {
        launcher = makeLauncher(block);
        block.insertBefore(launcher, block.firstChild);
      }
      seen.add(launcher);
    }
    // Prune launchers whose block fell out of the recolor pass (block no
    // longer qualifies or was restructured by the page).
    const all = document.querySelectorAll(`[${LAUNCHER_ATTR}]`);
    for (const l of all) {
      if (!seen.has(l)) l.remove();
    }
  }


  // ---------- Whole-page extraction (used by Reader + Sprint-page) ----------
  function extractAllBlocks() {
    const blockCache = new WeakMap();
    const findBlockEl = (node) => {
      const parent = node.parentElement;
      if (!parent) return document.body;
      const cached = blockCache.get(parent);
      if (cached) return cached;
      let p = parent;
      while (p && p !== document.body) {
        const d = getComputedStyle(p).display;
        if (d && d !== 'inline' && d !== 'inline-block' && d !== 'contents') break;
        p = p.parentElement;
      }
      const block = p || document.body;
      blockCache.set(parent, block);
      return block;
    };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => {
          if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
          let p = n.parentElement;
          while (p) {
            if (isLauncher(p)) return NodeFilter.FILTER_REJECT;
            if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
            if (isNonContent(p)) return NodeFilter.FILTER_REJECT;
            if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') {
              return NodeFilter.FILTER_REJECT;
            }
            // Skip our own reader overlay so it never shows up in extraction.
            if (p.classList && p.classList.contains('bzln-reader-root')) {
              return NodeFilter.FILTER_REJECT;
            }
            p = p.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        } }
    );
    const blocks = [];
    let lastBlock = null;
    let buf = '';
    let n;
    while ((n = walker.nextNode())) {
      const block = findBlockEl(n);
      if (block !== lastBlock) {
        const t = buf.replace(/\s+/g, ' ').trim();
        if (t) blocks.push(t);
        buf = n.nodeValue;
        lastBlock = block;
      } else {
        buf += n.nodeValue;
      }
    }
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
    return blocks;
  }

  function sprintPage() {
    const blocks = extractAllBlocks();
    const text = blocks.join(' ');
    if (text && typeof window.__bzlnSprint === 'function') {
      window.__bzlnSprint(text);
    }
  }

  // ---------- Reader overlay ----------
  let readerState = null;

  function openReader() {
    closeReader();
    const blocks = extractAllBlocks();
    if (!blocks.length) return;

    const root = document.createElement('div');
    root.className = 'bzln-reader-root';
    const backdrop = document.createElement('div');
    backdrop.className = 'bzln-reader-backdrop';
    const card = document.createElement('div');
    card.className = 'bzln-reader-card';

    const header = document.createElement('div');
    header.className = 'bzln-reader-header';
    const title = document.createElement('div');
    title.className = 'bzln-reader-title';
    title.textContent = 'Buzzline · Reader';
    const sprintAll = document.createElement('button');
    sprintAll.className = 'bzln-reader-btn bzln-reader-primary';
    sprintAll.type = 'button';
    sprintAll.textContent = 'Sprint all';
    sprintAll.addEventListener('click', () => {
      const text = blocks.join(' ');
      if (text && typeof window.__bzlnSprint === 'function') {
        window.__bzlnSprint(text);
      }
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'bzln-reader-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close (Esc)';
    closeBtn.addEventListener('click', closeReader);
    header.appendChild(title);
    header.appendChild(sprintAll);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'bzln-reader-body';
    for (const text of blocks) {
      const p = document.createElement('p');
      p.className = 'bzln-reader-para';
      p.textContent = text;
      body.appendChild(p);
    }

    card.appendChild(header);
    card.appendChild(body);
    root.appendChild(backdrop);
    root.appendChild(card);
    document.documentElement.appendChild(root);

    backdrop.addEventListener('click', closeReader);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeReader(); }
    };
    document.addEventListener('keydown', onKey, true);
    readerState = { root, onKey };

    // Appended to <html> to escape page CSS (filter/opacity/etc.), which
    // means the body-scoped MutationObserver won't see it. Process + paint
    // the overlay explicitly so its paragraphs pick up per-char coloring.
    if (state.enabled) {
      processRoot(body);
      applyColors();
    }
  }

  function closeReader() {
    if (!readerState) return;
    document.removeEventListener('keydown', readerState.onKey, true);
    if (readerState.root && readerState.root.parentNode) {
      readerState.root.parentNode.removeChild(readerState.root);
    }
    readerState = null;
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
          let ours = true;
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (!isCharSpan(node)) {
                if (!isLauncher(node)) ours = false;
                processRoot(node);
              }
            } else if (node.nodeType === 3) {
              ours = false;
              if (acceptTextNode(node)) splitTextNode(node);
            } else {
              ours = false;
            }
          }
          for (const node of m.removedNodes) {
            if (node.nodeType === 1 && (isCharSpan(node) || isLauncher(node))) continue;
            ours = false;
          }
          // External structural change may alter line wrapping — recolor.
          if (!ours && (m.addedNodes.length || m.removedNodes.length)) {
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
    if (typeof window.__bzlnSprintClose === 'function') {
      window.__bzlnSprintClose();
    }
  }

  function applyEnabledState() {
    const shouldRun = state.enabled && !isHostDisabled();
    if (shouldRun && !mo) enable();
    else if (!shouldRun && mo) disable();
  }

  chrome.storage.sync.get(['enabled', 'scheme', 'disabledHosts'], (res) => {
    state.enabled = !!res.enabled;
    state.scheme = res.scheme || 'classic';
    state.disabledHosts = Array.isArray(res.disabledHosts) ? res.disabledHosts : [];
    applyEnabledState();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'sprint-page') sprintPage();
    else if (msg.type === 'open-reader') openReader();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('scheme' in changes) {
      state.scheme = changes.scheme.newValue || 'classic';
      if (mo) applyColors();
    }
    if ('enabled' in changes) {
      state.enabled = !!changes.enabled.newValue;
      applyEnabledState();
    }
    if ('disabledHosts' in changes) {
      const next = changes.disabledHosts.newValue;
      state.disabledHosts = Array.isArray(next) ? next : [];
      applyEnabledState();
    }
  });
})();
