(() => {
  'use strict';

  const { SCHEMES, hexToRgb, mix, rgbStr, parseCssColor, isDarkSurface, ensureContrast, isProseBlock, META_RX, PROMO_RX, PROMO_WINDOW, SENTENCE_END_RX } = globalThis.BuzzlineCore;

  const CHAR_ATTR = 'data-bzln';
  const LAUNCHER_ATTR = 'data-bzln-launcher';
  const GRAD_ATTR = 'data-bzln-grad';
  const LAUNCHER_MIN_CHARS = 120; // skip captions / tiny labels
  const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  const SKIP_TAGS = new Set([
    'SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','BUTTON',
    'CODE','PRE','KBD','SAMP','VAR','TT',
    'SVG','CANVAS','VIDEO','AUDIO','IMG','IFRAME','OBJECT','EMBED','MATH'
  ]);

  // Inline code is part of the sentence when reading aloud/RSVP; only <pre>
  // blocks are skipped for extraction. Colouring still skips all of SKIP_TAGS.
  const INLINE_CODE_TAGS = new Set(['CODE', 'KBD', 'SAMP', 'VAR', 'TT']);
  const MIN_BLOCK_PROSE = 40;   // chars of non-link text for a block to count
  const MIN_PAGE_PROSE = 200;   // below this the page has no prose body
  const DOMINANCE = 0.75;       // child must hold this share to narrow the root
  const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const ROOT_RETRY_MS = 750;    // min gap between full-page root scans while no root is found
  const isHeading = (el) => HEADING_TAGS.has(el.tagName) || el.getAttribute('role') === 'heading';

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
    // Ad markup that class tokens miss: custom elements (<shreddit-ad-post>,
    // <amp-ad>), promoted/sponsored attributes, Google/Reddit ad data-attrs.
    if (el.hasAttribute('promoted') || el.hasAttribute('sponsored') || el.hasAttribute('ad-type') ||
        el.hasAttribute('data-ad') || el.hasAttribute('data-ad-slot') || el.hasAttribute('data-ad-client') ||
        el.hasAttribute('data-ad-unit')) return true;
    const tag = el.tagName.toLowerCase();
    if (tag.includes('-') && /(^|-)(ad|ads|advert|advertisement|promoted|sponsored)(-|$)/.test(tag)) return true;
    if (tag === 'a' && /\bsponsored\b/.test(el.rel || '')) return true;
    return false;
  };

  // Link-like elements. Besides <a>, sites wrap titles in custom elements
  // (Reddit's <delegated-link>, role="link" divs) whose real anchor lives in
  // shadow DOM; their text is navigation, not prose.
  const LINKISH_SEL = 'a, button, label, summary, [role="link"], [role="button"], [href], [url]';
  const isLinkish = (el) => !!el && el.nodeType === 1 && (el.matches(LINKISH_SEL) || (el.tagName.includes('-') && /link|button/i.test(el.tagName)));
  const inLink = (el) => { for (let e = el; e; e = e.parentElement) if (isLinkish(e)) return true; return false; };

  const state = { enabled: false, scheme: 'classic', disabledHosts: [], siteSchemes: {}, linkUnderline: true };
  const currentHost = (location.hostname || '').toLowerCase();
  const isHostDisabled = () =>
    Array.isArray(state.disabledHosts) && state.disabledHosts.includes(currentHost);
  // Per-site scheme override wins over the global scheme.
  const effectiveScheme = () => state.siteSchemes[currentHost] || state.scheme;
  const LINK_CLASS = 'bzln-neutral-links';
  const applyLinkStyle = () => {
    document.documentElement.classList.toggle(LINK_CLASS, !!mo && state.linkUnderline);
  };
  let mo = null;
  let rootMo = null;
  let observedBody = null;
  // Smallest container holding the page's real prose (see pickContentRoot).
  // Only text inside it is coloured; null = page has no prose body.
  let contentRoot = null;
  let rootPickedAt = 0;
  let rootRetryTimer = null;
  // Set when substantial new text is added outside contentRoot (lazy-loaded
  // comments, SPA shells): the root may be a stale, too-small container.
  let rootStale = false;
  // Sibling regions of the same kind as the root's ancestors (other timeline
  // comments next to a dominant description); coloured along with contentRoot.
  let rootPeers = [];
  const inRoots = (el) => (!!contentRoot && contentRoot.contains(el)) || rootPeers.some((r) => r.contains(el));
  const pendingTimers = new Set();
  let applyTimer = null;
  let resizeTimer = null;
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSchemeFlip = () => { if (state.enabled) applyColors(); };

  const isCharSpan = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute(CHAR_ATTR);

  const isLauncher = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute(LAUNCHER_ATTR);

  const skipElement = (el) => {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    // Headings are not body prose; leave them in the page's own colour.
    if (HEADING_TAGS.has(el.tagName) || el.getAttribute('role') === 'heading') return true;
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

  const inContentRoot = (node) => {
    const p = node.parentElement;
    return !!p && (inRoots(p) || !!p.closest('.bzln-reader-root'));
  };

  function ensureRoot() {
    if (contentRoot && contentRoot.isConnected && !rootStale) return;
    // A null/stale result is rescanned at most once per ROOT_RETRY_MS, with a
    // trailing retry so late-loading content is found.
    const wait = rootPickedAt + ROOT_RETRY_MS - performance.now();
    if ((!contentRoot || rootStale) && rootPickedAt && wait > 0) {
      if (!rootRetryTimer) {
        rootRetryTimer = trackTimer(setTimeout(() => {
          pendingTimers.delete(rootRetryTimer);
          rootRetryTimer = null;
          if (state.enabled) applyColors();
        }, wait));
      }
      return;
    }
    rootPickedAt = performance.now();
    const prev = contentRoot && contentRoot.isConnected ? contentRoot : null;
    const picked = pickContentRoot(collectReadable(document.body));
    contentRoot = picked ? picked.root : (rootStale ? prev : null);
    rootPeers = picked ? picked.peers : (rootStale && prev ? rootPeers : []);
    rootStale = false;
    if (contentRoot) { processRoot(contentRoot); rootPeers.forEach(processRoot); }
  }

  // Text with its own deliberate colour (status labels, badges, "green: good")
  // is left alone. Links count as prose. An element is "self-coloured" when its
  // computed colour differs from its block's; a short block is also compared
  // with its parent's, so a coloured <div>Merged</div> label is caught too.
  let colorMemo = new WeakMap();
  const COLOR_TOLERANCE = 48;   // summed |dr|+|dg|+|db|
  const sameColor = (a, b) =>
    !a || !b || Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= COLOR_TOLERANCE;
  const cssColor = (el) => parseCssColor(getComputedStyle(el).color);
  const isBlockDisplay = (el) => {
    const d = getComputedStyle(el).display;
    return !!d && d !== 'inline' && d !== 'inline-block' && d !== 'contents';
  };
  function isSelfColored(node) {
    const start = node.parentElement;
    if (!start) return false;
    const memo = colorMemo.get(start);
    if (memo !== undefined) return memo;
    let result = false;
    if (!inLink(start)) {
      const chain = [];
      let p = start;
      while (p && p !== document.body && !isBlockDisplay(p)) { chain.push(p); p = p.parentElement; }
      const block = p || document.body;
      const base = cssColor(block);
      result = chain.some((el) => !sameColor(cssColor(el), base));
      if (!result && block !== document.body && block.parentElement &&
          (block.textContent || '').trim().length <= 40) {
        result = !sameColor(base, cssColor(block.parentElement));
      }
    }
    colorMemo.set(start, result);
    return result;
  }

  const acceptTextNode = (node) => {
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    if (!node.parentElement) return false;
    if (!inContentRoot(node)) return false;
    if (inSkippedAncestor(node)) return false;
    if (isSelfColored(node)) return false;
    // Score the block before splitting: rejected blocks get no char spans at all.
    if (!isProseBlockEl(nearestBlock(node.parentElement))) return false;
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

  // ---------- Incremental pipeline ----------
  // Work is per block. processRoot() only *finds* prose blocks and queues
  // them; pump() splits them into char spans and colours them, nearest to the
  // viewport first, synchronously under a small budget and then in idle
  // slices, so the main thread is never blocked for long on huge pages.
  const SYNC_BUDGET_MS = 60;      // first paint: how long we may block
  const SLICE_MS = 12;            // idle slices after that
  const NEAR_PX = () => (window.innerHeight || 800) * 1.5;
  const pending = new Map();      // block -> text nodes to split (null = already split, needs colour)
  const painted = new Set();      // blocks that currently hold char spans
  let pumpHandle = null;
  let passCache = null;           // per colouring pass caches (see beginPass)

  function beginPass() {
    const scheme = SCHEMES[effectiveScheme()] || SCHEMES.classic;
    passCache = {
      palettes: { light: scheme.light.map(hexToRgb), dark: scheme.dark.map(hexToRgb) },
      blockByParent: new Map(), verticalByBlock: new Map(), bgByEl: new Map(), paletteByBlock: new Map()
    };
  }

  function processRoot(root) {
    if (!root) return;
    if (root.nodeType === 1 && (isCharSpan(root) || skipElement(root) || isNonContent(root))) return;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      // Cheap pre-filter only; the real checks (classifier, self-colour, skip
      // ancestors) run per block in splitBlock, inside the time slices.
      { acceptNode: (n) => n.nodeValue && n.nodeValue.trim() && n.parentElement && !isCharSpan(n.parentElement) && inContentRoot(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    let n;
    while ((n = walker.nextNode())) {
      const block = nearestBlock(n.parentElement);
      const cur = pending.get(block);
      // null = block already split and queued for colour; new text in it still
      // needs splitting (splitting is idempotent: char spans are never accepted).
      if (cur) cur.push(n); else { pending.set(block, [n]); markQueueChanged(); }
    }
  }

  // Queue one accepted text node (mutation path) for splitting + colouring.
  function queueTextNode(n) {
    const block = nearestBlock(n.parentElement);
    const cur = pending.get(block);
    if (cur === null) { pending.set(block, [n]); markQueueChanged(); return; }   // re-split: new text in a painted block
    if (cur) cur.push(n); else { pending.set(block, [n]); markQueueChanged(); }
  }

  // Split all queued text nodes of a block into char spans.
  function splitBlock(block) {
    const nodes = pending.get(block);
    if (nodes) for (const tn of nodes) if (tn.isConnected && acceptTextNode(tn)) splitTextNode(tn);
    pending.set(block, null);
    painted.add(block);
  }

  const distanceToViewport = (block) => {
    const r = block.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.bottom < 0) return -r.bottom;
    if (r.top > vh) return r.top - vh;
    return 0;
  };

  // Colour one block: group its own char spans into visual lines, then write
  // --bzln-c. Reads (rects, computed styles) happen before any write.
  function colourBlock(block) {
    const C = passCache;
    const getBlock = (el) => {
      const parent = el.parentElement;
      if (!parent) return document.body;
      const cached = C.blockByParent.get(parent);
      if (cached !== undefined) return cached;
      const b = nearestBlock(parent);
      C.blockByParent.set(parent, b);
      return b;
    };
    const isVertical = (b) => {
      const cached = C.verticalByBlock.get(b);
      if (cached !== undefined) return cached;
      const wm = (getComputedStyle(b).writingMode || '').toLowerCase();
      const v = wm.startsWith('vertical') || wm.startsWith('sideways');
      C.verticalByBlock.set(b, v);
      return v;
    };
    if (isVertical(block)) return false;
    const palette = paletteFor(block);
    const lines = [];
    let current = null, lastTop = null;
    for (const span of block.querySelectorAll(`span[${CHAR_ATTR}]`)) {
      if (getBlock(span) !== block) continue;   // belongs to a nested block
      const rect = span.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const top = rect.top;
      const heightGuard = Math.max(1, rect.height);
      if (!current || lastTop === null || Math.abs(top - lastTop) > heightGuard * 0.6) {
        current = { spans: [], rects: [] };
        lines.push(current);
      }
      current.spans.push(span);
      current.rects.push(rect);
      lastTop = top;
    }
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const start = palette[li % palette.length];
      const end = palette[(li + 1) % palette.length];
      const firstLeft = line.rects[0].left;
      const lastRight = line.rects[line.rects.length - 1].right;
      const width = Math.max(1, lastRight - firstLeft);
      for (let i = 0; i < line.spans.length; i++) {
        const r = line.rects[i];
        const t = Math.max(0, Math.min(1, ((r.left + r.right) / 2 - firstLeft) / width));
        line.spans[i].style.setProperty('--bzln-c', rgbStr(mix(start, end, t)));
      }
    }
    return lines.length > 0;
  }

  // Nearest ancestor-or-self background with alpha >= 0.5; null if none.
  function surfaceBg(el) {
    if (!el) return null;
    const C = passCache;
    if (C.bgByEl.has(el)) return C.bgByEl.get(el);
    const c = parseCssColor(getComputedStyle(el).backgroundColor);
    const v = c && c.a >= 0.5 ? c : surfaceBg(el.parentElement);
    C.bgByEl.set(el, v);
    return v;
  }
  function paletteFor(block) {
    const C = passCache;
    let p = C.paletteByBlock.get(block);
    if (!p) {
      // Gradient leaves are painted with color:transparent; ignore that.
      const tc = parseCssColor(getComputedStyle(block).color);
      const bg = surfaceBg(block);
      const dark = isDarkSurface(bg, tc && tc.a > 0 ? tc : null);
      // Mid-tone surfaces (grey cards, tinted callouts) can leave either
      // variant below 4.5:1; nudge lightness only as far as needed.
      p = ensureContrast(dark ? C.palettes.dark : C.palettes.light, bg);
      C.paletteByBlock.set(block, p);
    }
    return p;
  }

  // Drain `pending` nearest-first until the budget is spent; reschedule the
  // rest as idle work. When the queue empties, mount launchers and gradients.
  let order = [];               // pending blocks, nearest-first; rebuilt when stale
  let orderStale = true;
  const markQueueChanged = () => { orderStale = true; };
  const BATCH = 24;             // blocks split per slice before measuring (one relayout per slice)
  const BIG_PAGE_BLOCKS = 400;  // above this, far blocks stay unsplit until scrolled near
  const stale = new Set();      // painted blocks whose colour is out of date (big pages)
  function pump(budgetMs) {
    const t0 = performance.now();
    if (orderStale) {
      for (const b of pending.keys()) if (!b.isConnected) { pending.delete(b); painted.delete(b); stale.delete(b); }
      const scored = [...pending.keys()].map((b) => [distanceToViewport(b), b]).sort((a, b) => a[0] - b[0]);
      // Huge pages: keep the DOM (and every relayout) small by only splitting
      // blocks within reach of the viewport; the rest wait in `pending` for
      // onScroll to bring them into range.
      const far = scored.length > BIG_PAGE_BLOCKS ? NEAR_PX() * 2 : Infinity;
      order = scored.filter((x) => x[0] <= far).map((x) => x[1]);
      orderStale = false;
    }
    while (order.length) {
      if (performance.now() - t0 > budgetMs) break;
      // Phase 1: DOM writes (splitting) for a batch. Phase 2: reads + colour
      // writes. Interleaving split and measure would force a relayout per block.
      const batch = [];
      while (order.length && batch.length < BATCH) {
        const block = order.shift();
        if (!pending.has(block)) continue;
        if (pending.get(block) !== null) splitBlock(block);
        batch.push(block);
      }
      for (const block of batch) {
        if (!colourBlock(block)) painted.delete(block);
        pending.delete(block);
      }
    }
    if (order.length) schedulePump();
    else finishPass();              // everything in range is done; far blocks wait for scroll
  }
  function schedulePump() {
    if (pumpHandle !== null) return;
    const run = () => { pumpHandle = null; if (state.enabled && mo) pump(SLICE_MS); };
    pumpHandle = window.requestIdleCallback ? requestIdleCallback(run, { timeout: 250 }) : setTimeout(run, 16);
  }
  function cancelPump() {
    if (pumpHandle === null) return;
    if (window.requestIdleCallback) cancelIdleCallback(pumpHandle); else clearTimeout(pumpHandle);
    pumpHandle = null;
  }
  function finishPass() {
    syncLaunchers(painted);
    applyGradientBlocks(paletteFor);
  }

  // Full (re)colour: everything that has spans gets re-measured. Nearest
  // blocks are done synchronously within SYNC_BUDGET_MS, the rest in idle
  // time. On big pages only blocks near the viewport are re-queued; the rest
  // are marked stale and picked up as the user scrolls towards them.
  function applyColors() {
    colorMemo = new WeakMap();
    resetBlockMemos();
    ensureRoot();
    beginPass();
    const big = painted.size > BIG_PAGE_BLOCKS;
    const near = NEAR_PX() * 2;
    for (const b of painted) {
      if (pending.has(b)) continue;
      if (big && distanceToViewport(b) > near) stale.add(b); else { pending.set(b, null); stale.delete(b); }
    }
    markQueueChanged();
    cancelPump();
    pump(SYNC_BUDGET_MS);
  }
  let scrollTimer = null;
  function onScroll() {
    if ((!stale.size && !pending.size) || scrollTimer) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      if (!state.enabled || !mo) return;
      const near = NEAR_PX();
      let added = 0;
      for (const b of stale) if (!b.isConnected || distanceToViewport(b) <= near) { stale.delete(b); if (b.isConnected) { pending.set(b, null); added++; } }
      if (added || pending.size) { markQueueChanged(); schedulePump(); }
    }, 150);
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
    cancelPump();
    pending.clear();
    painted.clear();
    stale.clear();
    markQueueChanged();
  }

  function clearGradientStyle(el) {
    el.removeAttribute(GRAD_ATTR);
    el.style.removeProperty('background-image');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    el.style.removeProperty('color');
  }

  // ---------- Block prose classifier (runs BEFORE splitting into char spans) ----------
  // Memos live for one pass (reset at the top of applyColors and on every
  // mutation batch), so a block is scored once per pass, not once per text node.
  const FEAT_AD = /(^|[\s_-])(ad|ads|advert|advertisement|sponsor|sponsored|promo|promoted|outbrain|taboola)($|[\s_-])/i;
  const FEAT_REL = /(related|recommend|trending|popular|most-read|mostread|more-stories|newsletter|subscribe|signup|follow|share|social|cookie|consent|breadcrumb)/i;
  const FEAT_SIDE = /(sidebar|aside|rail|widget)/i;
  const FEAT_NAV = /(^|[\s_-])(nav|navbar|menu|header|masthead|footer|toolbar|tabs?)($|[\s_-])/i;
  const CHROME_TAGS = new Set(['nav', 'aside', 'header', 'footer']);
  const CHROME_ROLES = new Set(['navigation', 'complementary', 'banner', 'contentinfo']);
  let displayMemo = new WeakMap();   // element -> is block-level display
  let statsMemo = new WeakMap();     // block   -> { text, total, link, chars, counts }
  let proseMemo = new WeakMap();     // block   -> bool
  const resetBlockMemos = () => { displayMemo = new WeakMap(); statsMemo = new WeakMap(); proseMemo = new WeakMap(); };

  const isBlockLevel = (el) => {
    let v = displayMemo.get(el);
    if (v === undefined) {
      const d = getComputedStyle(el).display;
      v = !!d && d !== 'inline' && d !== 'inline-block' && d !== 'contents';
      displayMemo.set(el, v);
    }
    return v;
  };
  // Nearest block-level ancestor-or-self (body if none).
  const nearestBlock = (el) => {
    let p = el;
    while (p && p !== document.body && !isBlockLevel(p)) p = p.parentElement;
    return p || document.body;
  };

  // The block's OWN text (text nodes whose nearest block is this block), raw
  // and link char counts, and whether it "counts" as a sibling for the
  // contextual features: visible, >= 30 chars, non-trivial box. Same
  // definitions as tests/e2e/collector.js.
  function blockStats(block) {
    let s = statsMemo.get(block);
    if (s) return s;
    s = { text: '', total: 0, link: 0, chars: 0, counts: false };
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue; if (!v) continue;
      const p = n.parentElement; if (!p || nearestBlock(p) !== block) continue;
      let skip = false;
      for (let e = p; e && e !== block; e = e.parentElement) {
        if ((SKIP_TAGS.has(e.tagName) && !INLINE_CODE_TAGS.has(e.tagName)) || isLauncher(e)) { skip = true; break; }
      }
      if (skip) continue;
      s.text += v; s.total += v.length;
      if (inLink(p)) s.link += v.length;
    }
    s.text = s.text.replace(/\s+/g, ' ').trim();
    s.chars = s.text.length;
    if (s.chars >= 30 && block !== document.body) {
      const r = block.getBoundingClientRect();
      s.counts = r.width >= 20 && r.height >= 8 && (!block.checkVisibility || block.checkVisibility({ visibilityProperty: true }));
    }
    statsMemo.set(block, s);
    return s;
  }
  const countsAsBlock = (el) => el.nodeType === 1 && isBlockLevel(el) && blockStats(el).counts;

  function blockFeatures(block) {
    const s = blockStats(block);
    const text = s.text;
    const rect = block.getBoundingClientRect();
    const vw = window.innerWidth || 1;
    const f = {
      chars: s.chars,
      words: text ? text.split(' ').length : 0,
      sentences: (text.match(SENTENCE_END_RX) || []).length,
      promo: PROMO_RX.test(text.slice(0, PROMO_WINDOW)) ? 1 : 0,
      linkFrac: s.link / Math.max(1, s.total),
      tag: block.tagName.toLowerCase(),
      wFrac: rect.width / vw,
      cx: (rect.left + rect.right) / 2 / vw,
      ad: 0, rel: 0, side: 0, nav: 0, chrome: 0, main: 0, chain: '',
      prevChars: 0, nextChars: 0, sibProse: 0
    };
    const chain = [];
    for (let e = block; e && e !== document.documentElement; e = e.parentElement) {
      const cls = (typeof e.className === 'string' ? e.className : '') + ' ' + (e.id || '');
      if (FEAT_AD.test(cls)) f.ad++;
      if (FEAT_REL.test(cls)) f.rel++;
      if (FEAT_SIDE.test(cls)) f.side++;
      if (FEAT_NAV.test(cls)) f.nav++;
      const t = e.tagName.toLowerCase();
      const role = e.getAttribute('role');
      if (CHROME_TAGS.has(t) || (role && CHROME_ROLES.has(role))) f.chrome++;
      if (t === 'main' || t === 'article' || role === 'main') f.main++;
      if (chain.length < 6) {
        const c0 = typeof e.className === 'string' && e.className ? e.className.trim().split(/\s+/)[0].slice(0, 18) : '';
        chain.push(t + (e.id ? '#' + e.id.slice(0, 18) : '') + (c0 ? '.' + c0 : ''));
      }
    }
    f.chain = chain.join('>');
    // Contextual: nearest counting sibling blocks and the parent's prose share.
    let p = block.previousElementSibling; while (p && !countsAsBlock(p)) p = p.previousElementSibling;
    let nx = block.nextElementSibling; while (nx && !countsAsBlock(nx)) nx = nx.nextElementSibling;
    f.prevChars = p ? blockStats(p).chars : 0;
    f.nextChars = nx ? blockStats(nx).chars : 0;
    const par = block.parentElement;
    const sibs = par ? [...par.children].filter(countsAsBlock) : [];
    if (!sibs.length) sibs.push(block);
    const prose = sibs.filter((c) => { const cs = blockStats(c); return cs.chars >= 80 && cs.link / Math.max(1, cs.total) < 0.5; }).length;
    f.sibProse = prose / sibs.length;
    return f;
  }

  // Blocks with no real box (sr-only, clipped, collapsed) are never prose.
  const hasBox = (b) => { const r = b.getBoundingClientRect(); return r.width >= 20 && r.height >= 8; };

  // Is this block long-form prose a person reads? Memoised per pass.
  function isProseBlockEl(block) {
    let v = proseMemo.get(block);
    if (v === undefined) {
      v = block !== document.body && hasBox(block) && isProseBlock(blockFeatures(block));
      proseMemo.set(block, v);
    }
    return v;
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
      if (!isGradientLeaf(n) || isHeading(n)) continue;
      let p = n.parentElement;
      let skip = false;
      while (p) {
        if (isNonContent(p) || SKIP_TAGS.has(p.tagName) || isHeading(p)) { skip = true; break; }
        p = p.parentElement;
      }
      if (!skip) out.push(n);
    }
    return out;
  }

  function applyGradientBlocks(paletteFor) {
    const leaves = findGradientLeaves();
    const current = new Set(leaves);
    const old = document.querySelectorAll(`[${GRAD_ATTR}]`);
    for (const el of old) if (!current.has(el)) clearGradientStyle(el);
    // Resolve palettes (computed-style reads) before any style writes.
    const pals = leaves.map(paletteFor);
    for (let i = 0; i < leaves.length; i++) {
      const el = leaves[i];
      const palette = pals[i];
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
      const text = sectionText(block);
      if (text && typeof window.__bzlnSprint === 'function') {
        window.__bzlnSprint(text);
      }
    });
    return btn;
  }

  // Sprint text for the heading-delimited section containing `block`: from the
  // preceding heading (inclusive) to the next heading (exclusive).
  function sectionText(block) {
    const root = contentRoot || document.body;
    let start = null;
    let end = null;
    for (const h of root.querySelectorAll(HEADING_SELECTOR)) {
      if (h === block || h.contains(block) || (h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)) start = h;
      else { end = h; break; }
    }
    const entries = collectReadable(root).filter(({ node }) =>
      (!start || (start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) &&
      (!end || (end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)));
    return blocksFrom(entries).join(' ');
  }

  // First block of every heading-delimited section that holds enough text.
  // Paragraphs and list items inside one section share a single launcher.
  function sectionStarts(blocks) {
    const root = contentRoot || document.body;
    const heads = [...root.querySelectorAll(HEADING_SELECTOR)];
    const ordered = [...blocks]
      .filter((b) => b && b.isConnected && b !== document.body && !b.closest('.bzln-reader-root'))
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const groups = new Map();   // index of governing heading -> { first, len }
    let h = -1;
    for (const b of ordered) {
      while (h + 1 < heads.length &&
             (heads[h + 1].compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) h++;
      const len = (b.textContent || '').length;
      const g = groups.get(h);
      if (g) g.len += len; else groups.set(h, { first: b, head: h >= 0 ? heads[h] : null, len });
    }
    // Launcher goes on the section's heading; text before the first heading
    // (no heading) falls back to its first block.
    return [...groups.values()].filter((g) => g.len >= LAUNCHER_MIN_CHARS).map((g) => g.head || g.first);
  }

  function syncLaunchers(blocks) {
    const seen = new Set();
    for (const block of sectionStarts(blocks)) {
      let launcher = block.firstElementChild;
      if (launcher && !isLauncher(launcher)) launcher = null;
      if (!launcher) {
        launcher = makeLauncher(block);
        block.insertBefore(launcher, block.firstChild);
      }
      seen.add(launcher);
    }
    // Prune launchers that are no longer the start of a section (block
    // restructured, section merged, or text fell below the minimum).
    const all = document.querySelectorAll(`[${LAUNCHER_ATTR}]`);
    for (const l of all) {
      if (!seen.has(l)) l.remove();
    }
  }

  const isExtractionSkipped = (el) =>
    (SKIP_TAGS.has(el.tagName) && !INLINE_CODE_TAGS.has(el.tagName)) ||
    isLauncher(el) ||
    isNonContent(el) ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.classList.contains('bzln-reader-root') ||
    el.classList.contains('bzln-sprint-root');

  // -> [{ node, block }] for every readable, rendered text node under root.
  // Whitespace-only nodes are kept: after splitTextNode every grapheme
  // (including spaces) is its own char span.
  function collectReadable(root) {
    const skipCache = new Map();
    const skipped = (el) => {
      if (!el) return false;
      let v = skipCache.get(el);
      if (v === undefined) {
        v = isExtractionSkipped(el) || skipped(el.parentElement);
        skipCache.set(el, v);
      }
      return v;
    };
    const blockOf = nearestBlock;   // shares displayMemo with the rest of the pipeline
    const visCache = new Map();
    const rendered = (b) => {
      let v = visCache.get(b);
      if (v === undefined) {
        v = b.checkVisibility ? b.checkVisibility({ visibilityProperty: true }) : true;
        visCache.set(b, v);
      }
      return v;
    };
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const parent = n.parentElement;
      if (!n.nodeValue || !parent || skipped(parent)) continue;
      const block = blockOf(parent);
      if (!rendered(block)) continue;
      out.push({ node: n, block });
    }
    return out;
  }

  // Group consecutive same-block text into whitespace-collapsed strings.
  function blocksFrom(entries) {
    const blocks = [];
    let lastBlock = null;
    let buf = '';
    const flush = () => {
      const t = buf.replace(/\s+/g, ' ').trim();
      if (t) blocks.push(t);
    };
    for (const { node, block } of entries) {
      if (block !== lastBlock) {
        flush();
        buf = node.nodeValue;
        lastBlock = block;
      } else {
        buf += node.nodeValue;
      }
    }
    flush();
    return blocks;
  }

  // Smallest container holding the page's prose: descend from <body> while one
  // child holds >= DOMINANCE of the current root's prose mass. Link/button text
  // carries no mass, so nav lists, file tables and headline grids never win.
  function pickContentRoot(entries) {
    const linkCache = new Map();
    const linkish = (el) => {
      if (!el) return false;
      let v = linkCache.get(el);
      if (v === undefined) {
        v = isLinkish(el) || linkish(el.parentElement);
        linkCache.set(el, v);
      }
      return v;
    };
    const prose = new Map();                       // block -> non-link chars
    for (const { node, block } of entries) {
      if (linkish(node.parentElement)) continue;
      const len = node.nodeValue.replace(/\s+/g, ' ').trim().length;
      if (len) prose.set(block, (prose.get(block) || 0) + len);
    }
    const mass = new Map();                        // element -> prose in subtree
    for (const [block, m] of prose) {
      if (m < MIN_BLOCK_PROSE) continue;
      for (let el = block; el; el = el.parentElement) mass.set(el, (mass.get(el) || 0) + m);
    }
    let root = document.body;
    if ((mass.get(root) || 0) < MIN_PAGE_PROSE) return null;
    for (;;) {
      let best = null, bestMass = 0;
      for (const c of root.children) {
        const m = mass.get(c) || 0;
        if (m > bestMass) { bestMass = m; best = c; }
      }
      if (!best || bestMass < DOMINANCE * mass.get(root)) break;
      // best is itself a paragraph-like block (owns most of its mass directly):
      // stop so a single long paragraph never becomes the whole root.
      if ((prose.get(best) || 0) >= 0.5 * bestMass) break;
      root = best;
    }
    // Repeated structure holding prose of its own, e.g. other comments beside a
    // dominant PR description: a sibling of an ancestor-or-self of the root with
    // the same tag, mostly the same classes (Jaccard >= 0.5) and at least
    // MIN_PAGE_PROSE of prose. Only the nearest level that has any counts.
    const peers = [];
    if (root !== document.body) {
      for (let a = root; a && a !== document.body && !peers.length; a = a.parentElement) {
        const par = a.parentElement;
        if (!par || !a.className) continue;
        const mine = new Set(tokensOf(a.getAttribute('class')));
        for (const s of par.children) {
          if (s === a || s.tagName !== a.tagName || (mass.get(s) || 0) < MIN_PAGE_PROSE) continue;
          const theirs = new Set(tokensOf(s.getAttribute('class')));
          let shared = 0;
          for (const t of theirs) if (mine.has(t)) shared++;
          if (shared / (mine.size + theirs.size - shared) >= 0.5) peers.push(s);
        }
      }
    }
    return { root, peers };
  }

  // ---------- Whole-page extraction (used by Reader + Sprint-page) ----------
  function extractAllBlocks() {
    const entries = collectReadable(document.body);
    const picked = pickContentRoot(entries);
    const root = picked ? picked.root : document.body;
    const peers = picked ? picked.peers : [];
    const blocks = blocksFrom(
      root === document.body ? entries : entries.filter((e) => root.contains(e.node) || peers.some((p) => p.contains(e.node)))
    );
    // Fallback: if TreeWalker extraction yielded nothing (unusual framework
    // root, aria-hidden wrapper, non-content token on a parent, etc.),
    // derive blocks from innerText so the reader has something to show.
    if (!blocks.length) {
      const text = ((document.body && document.body.innerText) || '').trim();
      if (text) {
        return text
          .split(/\n\s*\n+/)
          .map((s) => s.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      }
    }
    return blocks;
  }

  function sprintPage(given) {
    const sel = String(given || window.getSelection() || '').replace(/\s+/g, ' ').trim();
    const text = sel || extractAllBlocks().join(' ');
    if (text && typeof window.__bzlnSprint === 'function') {
      window.__bzlnSprint(text);
    }
  }

  // ---------- Reader overlay ----------
  let readerState = null;

  function openReader() {
    closeReader();
    const blocks = extractAllBlocks();
    console.log('[Buzzline] openReader — extracted blocks:', blocks.length);
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
    const paras = [];
    const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
    let speakBtn = null;
    if (canSpeak) {
      speakBtn = document.createElement('button');
      speakBtn.className = 'bzln-reader-btn';
      speakBtn.type = 'button';
      speakBtn.textContent = '🔊 Read aloud';
      speakBtn.title = 'Read the text aloud, paragraph by paragraph';
      speakBtn.addEventListener('click', () => {
        if (readerState && readerState.speaking) stopSpeaking();
        else speakFrom(0);
      });
      header.appendChild(speakBtn);
    }
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'bzln-reader-body';
    for (const text of blocks) {
      const p = document.createElement('p');
      p.className = 'bzln-reader-para';
      p.textContent = text;
      // Click a paragraph while reading aloud to jump to it.
      p.addEventListener('click', () => { if (readerState && readerState.speaking) speakFrom(paras.indexOf(p)); });
      paras.push(p);
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
    readerState = { root, onKey, paras, speakBtn, speaking: false, utter: null };

    function stopSpeaking() {
      if (!readerState) return;
      readerState.speaking = false;
      readerState.utter = null;
      window.speechSynthesis.cancel();
      for (const q of readerState.paras) q.classList.remove('bzln-reader-speaking');
      if (readerState.speakBtn) readerState.speakBtn.textContent = '🔊 Read aloud';
    }
    function speakFrom(i) {
      if (!readerState || i < 0 || i >= readerState.paras.length) { stopSpeaking(); return; }
      window.speechSynthesis.cancel();
      const st = readerState;
      st.speaking = true;
      st.speakBtn.textContent = '⏹ Stop';
      for (const q of st.paras) q.classList.remove('bzln-reader-speaking');
      const p = st.paras[i];
      p.classList.add('bzln-reader-speaking');
      p.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const u = new SpeechSynthesisUtterance(p.textContent);
      u.lang = document.documentElement.lang || navigator.language || 'en';
      st.utter = u;
      u.onend = () => { if (readerState === st && st.utter === u && st.speaking) speakFrom(i + 1); };
      u.onerror = () => { if (readerState === st && st.utter === u) stopSpeaking(); };
      window.speechSynthesis.speak(u);
    }

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
    if (readerState.speaking) { readerState.speaking = false; window.speechSynthesis.cancel(); }
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
    observedBody = document.body;
    mo = new MutationObserver((muts) => {
      colorMemo = new WeakMap();
      resetBlockMemos();
      if (!contentRoot) { scheduleApply(); return; }
      let structureChanged = false;
      for (const m of muts) {
        if (m.type === 'childList') {
          let ours = true;
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (!isCharSpan(node)) {
                if (!isLauncher(node)) ours = false;
                if (contentRoot && !isLauncher(node) && !inRoots(node) &&
                    (node.textContent || '').length >= MIN_PAGE_PROSE) rootStale = true;
                processRoot(node);
              }
            } else if (node.nodeType === 3) {
              ours = false;
              if (acceptTextNode(node)) queueTextNode(node);
            } else {
              ours = false;
            }
          }
          for (const node of m.removedNodes) {
            if (node.nodeType === 1 && (isCharSpan(node) || isLauncher(node))) continue;
            // splitTextNode replaces a text node with char spans: that is ours too.
            if (node.nodeType === 3 && m.addedNodes.length && [...m.addedNodes].every(isCharSpan)) continue;
            ours = false;
          }
          // External structural change may alter line wrapping — recolor.
          if (!ours && (m.addedNodes.length || m.removedNodes.length)) {
            structureChanged = true;
          }
        } else if (m.type === 'characterData') {
          const target = m.target;
          if (target.nodeType === 3 && acceptTextNode(target)) {
            queueTextNode(target);
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
    applyColors();
    startObserving();
    // SPA/Turbo navigations can swap the <body> element wholesale; the body
    // observer would stay on the detached node. Watch <html>'s direct
    // children (no subtree) so overlays appended there hit the early return.
    rootMo = new MutationObserver(() => {
      if (!document.body || document.body === observedBody) return;
      contentRoot = null;
      rootPickedAt = 0;
      rootStale = false;
      applyColors();
      startObserving();
    });
    rootMo.observe(document.documentElement, { childList: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    darkMq.addEventListener('change', onSchemeFlip);
    applyLinkStyle();
    // Late layout shifts (webfonts, images) change line wrapping after the
    // initial paint. Re-apply twice to catch them.
    trackTimer(setTimeout(() => { if (state.enabled) applyColors(); }, 500));
    trackTimer(setTimeout(() => { if (state.enabled) applyColors(); }, 1500));
  }

  function disable() {
    if (mo) { mo.disconnect(); mo = null; }
    cancelPump();
    if (rootMo) { rootMo.disconnect(); rootMo = null; }
    observedBody = null;
    contentRoot = null;
    rootPickedAt = 0;
    rootStale = false;
    rootRetryTimer = null;
    rootPeers = [];
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
    darkMq.removeEventListener('change', onSchemeFlip);
    document.documentElement.classList.remove(LINK_CLASS);
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

  const readSettings = (res) => {
    state.enabled = !!res.enabled;
    state.scheme = res.scheme || 'classic';
    state.disabledHosts = Array.isArray(res.disabledHosts) ? res.disabledHosts : [];
    state.siteSchemes = res.siteSchemes && typeof res.siteSchemes === 'object' ? res.siteSchemes : {};
    state.linkUnderline = res.linkUnderline !== false;
  };
  chrome.storage.sync.get(['enabled', 'scheme', 'disabledHosts', 'siteSchemes', 'linkUnderline'], (res) => {
    readSettings(res);
    applyEnabledState();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    console.log('[Buzzline] message received:', msg.type);
    if (msg.type === 'sprint-page') sprintPage(msg.text);
    else if (msg.type === 'open-reader') openReader();
    else if (msg.type === 'feedback') recordFeedback(msg.verdict);
  });

  // "This should / shouldn't be coloured": store the selected block's feature
  // vector and the user's verdict locally (never page text) so it can be
  // exported from the options page into tests/e2e/data as a training label.
  const FEEDBACK_MAX = 500;
  function recordFeedback(verdict) {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return;
    resetBlockMemos();
    const block = nearestBlock(el);
    const full = blockFeatures(block);
    const { chain, ...f } = full;
    const entry = { ts: Date.now(), host: currentHost, verdict: verdict === 'yes' ? 'body' : 'not-body', coloured: !!block.querySelector(`span[${CHAR_ATTR}]`), score: +globalThis.BuzzlineCore.blockScore(full).toFixed(3), meta: META_RX.test(chain) ? 1 : 0, f };
    chrome.storage.local.get(['feedback'], (s) => {
      const list = Array.isArray(s.feedback) ? s.feedback : [];
      list.push(entry);
      chrome.storage.local.set({ feedback: list.slice(-FEEDBACK_MAX) });
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('scheme' in changes || 'siteSchemes' in changes) {
      if ('scheme' in changes) state.scheme = changes.scheme.newValue || 'classic';
      if ('siteSchemes' in changes) state.siteSchemes = changes.siteSchemes.newValue || {};
      if (mo) applyColors();
    }
    if ('linkUnderline' in changes) {
      state.linkUnderline = changes.linkUnderline.newValue !== false;
      if (mo) applyLinkStyle();
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
