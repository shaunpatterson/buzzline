(() => {
  'use strict';

  const { SCHEMES, hexToRgb, rgbStr, parseCssColor, isDarkSurface, ensureContrast } = globalThis.BuzzlineCore;
  const { planRuns } = globalThis.BuzzlineGradient;
  const { LAUNCHER_ATTR, isLauncher, inLink, nearestBlock, blockFeatures } = globalThis.BuzzlineBlocks;
  const R = globalThis.BuzzlineReading;

  const GRAD_ATTR = 'data-bzln-grad';

  const S = globalThis.BuzzlineSettings;
  let settings = S.normalize({});
  const currentHost = (location.hostname || '').toLowerCase();
  const LINK_CLASS = 'bzln-neutral-links';
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');

  // ---------- Highlight-API colouring (no DOM mutation) ----------
  // Text is coloured with the CSS Custom Highlight API: each run planned by
  // the Line gradient (gradient.js) is a Range registered under a highlight
  // name that encodes its colour. The page's DOM is never touched, so host
  // scripts' MutationObservers stay quiet and no relayout is ever forced.
  const HL_PREFIX = 'bzln-';
  const hlSheet = new CSSStyleSheet();    // ::highlight() rules, added lazily
  const hlRules = new Set();
  const supportsHighlights = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
  if (supportsHighlights) document.adoptedStyleSheets = [...document.adoptedStyleSheets, hlSheet];

  const colourKey = (c) => `${c.r | 0}-${c.g | 0}-${c.b | 0}`;

  // ---------- Incremental pipeline ----------
  // Work is per block. processRoot() only *finds* prose blocks and queues
  // them; pump() splits them into char spans and colours them, nearest to the
  // viewport first, synchronously under a small budget and then in idle
  // slices, so the main thread is never blocked for long on huge pages.
  const SYNC_BUDGET_MS = 40;      // first paint: how long we may block
  const SLICE_MS = 12;            // idle slices after that
  const NEAR_PX = () => (window.innerHeight || 800) * 1.5;

  // ---------- Colouring session ----------
  // Everything whose lifetime is "colouring is enabled": highlights, queues,
  // observers, listeners and timers. stop() tears it all down; the closure is
  // then dropped, so no field needs resetting by hand.
  function startSession() {
    const highlights = new Map();           // name -> Highlight
    const blockRanges = new Map();          // block -> [[name, range], ...]
    const blockNodes = new Map();   // block -> Set of its queued text nodes
    const pending = new Set();      // blocks waiting to be (re)coloured
    const painted = new Set();      // blocks currently carrying highlights
    const stale = new Set();      // painted blocks whose colour is out of date (big pages)
    let order = [];               // pending blocks, nearest-first; rebuilt when stale
    let orderStale = true;
    let pumpHandle = null;
    let passCache = null;           // per colouring pass caches (see beginPass)
    let mo = null;
    let rootMo = null;
    let observedBody = null;
    const pendingTimers = new Set();
    let applyTimer = null;
    let resizeTimer = null;
    let scrollTimer = null;
    let rootRetryTimer = null;
    let stopped = false;

    function highlightFor(color, inLinkRun) {
      const name = HL_PREFIX + colourKey(color) + (inLinkRun ? '-l' : '');
      let h = highlights.get(name);
      if (!h) {
        h = new Highlight();
        highlights.set(name, h);
        CSS.highlights.set(name, h);
        if (!hlRules.has(name)) {
          hlRules.add(name);
          const deco = inLinkRun && settings.linkUnderline ? ' text-decoration: underline; text-decoration-color: rgba(128,128,128,0.55);' : '';
          hlSheet.insertRule(`::highlight(${name}) { color: ${rgbStr(color)};${deco} }`);
        }
      }
      return h;
    }
    function clearBlock(block) {
      const rs = blockRanges.get(block);
      if (rs) for (const [name, r] of rs) { const h = highlights.get(name); if (h) h.delete(r); }
      blockRanges.delete(block);
    }
    function clearAllHighlights() {
      for (const name of highlights.keys()) CSS.highlights.delete(name);
      highlights.clear();
      blockRanges.clear();
    }

    // Line fragments of one text node: [{ start, end, rect }] by char offset.
    // Range.getClientRects() gives one box per line box; the char boundary of
    // each box is found by bisection on a probe range (O(lines * log n) rects).
    function textFragments(node, range) {
      const n = node.nodeValue.length;
      range.selectNodeContents(node);
      const boxes = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!boxes.length) return [];
      if (boxes.length === 1) return [{ start: 0, end: n, rect: boxes[0] }];
      const topOf = (i) => { range.setStart(node, i); range.setEnd(node, i + 1); return range.getBoundingClientRect().top; };
      const frags = [];
      let start = 0;
      for (let k = 1; k < boxes.length; k++) {
        // first char offset whose box top reaches box k's top
        const targetTop = boxes[k].top - 0.5;
        let lo = start + 1, hi = n - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (topOf(mid) >= targetTop) hi = mid; else lo = mid + 1; }
        frags.push({ start, end: lo, rect: boxes[k - 1] });
        start = lo;
      }
      frags.push({ start, end: n, rect: boxes[boxes.length - 1] });
      return frags;
    }

    // Colour one block: measure the line fragments of its own text nodes, let
    // the Line gradient plan the coloured runs, register each run as a Range.
    function colourBlock(block) {
      const C = passCache;
      const isVertical = (b) => {
        const cached = C.verticalByBlock.get(b);
        if (cached !== undefined) return cached;
        const wm = (getComputedStyle(b).writingMode || '').toLowerCase();
        const v = wm.startsWith('vertical') || wm.startsWith('sideways');
        C.verticalByBlock.set(b, v);
        return v;
      };
      clearBlock(block);
      if (isVertical(block)) return false;
      const set = blockNodes.get(block);
      const nodes = set ? [...set].filter((tn) => tn.isConnected && R.isReadingText(tn)) : [];
      for (const tn of (set || [])) if (!tn.isConnected) set.delete(tn);
      if (!nodes.length) return false;
      const palette = paletteFor(block);
      const probe = document.createRange();
      const fragments = [];
      for (const tn of nodes) {
        const linkRun = inLink(tn.parentElement);
        for (const f of textFragments(tn, probe)) fragments.push({ node: tn, start: f.start, end: f.end, rect: f.rect, linkRun });
      }
      const out = [];
      for (const run of planRuns(fragments, palette)) {
        const r = document.createRange(); r.setStart(run.node, run.start); r.setEnd(run.node, run.end);
        highlightFor(run.color, run.linkRun).add(r);
        out.push([HL_PREFIX + colourKey(run.color) + (run.linkRun ? '-l' : ''), r]);
      }
      blockRanges.set(block, out);
      painted.add(block);
      return fragments.length > 0;
    }

    function beginPass() {
      const scheme = SCHEMES[S.effectiveScheme(settings, currentHost)];
      passCache = {
        palettes: { light: scheme.light.map(hexToRgb), dark: scheme.dark.map(hexToRgb) },
        blockByParent: new Map(), verticalByBlock: new Map(), bgByEl: new Map(), paletteByBlock: new Map()
      };
    }

    function processRoot(root) {
      if (!root) return;
      if (root.nodeType === 1 && R.isSkipped(root)) return;
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        // Cheap pre-filter only; the real checks (classifier, self-colour, skip
        // ancestors) run per block in colourBlock, inside the time slices.
        { acceptNode: (n) => n.nodeValue && n.nodeValue.trim() && n.parentElement && R.inScope(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
      );
      let n;
      while ((n = walker.nextNode())) queueTextNode(n);
    }

    // Remember a text node under its block and queue the block for colouring.
    function queueTextNode(n) {
      const block = nearestBlock(n.parentElement);
      let set = blockNodes.get(block);
      if (!set) { set = new Set(); blockNodes.set(block, set); }
      set.add(n);
      if (!pending.has(block)) { pending.add(block); markQueueChanged(); }
    }

    const distanceToViewport = (block) => {
      const r = block.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      if (r.bottom < 0) return -r.bottom;
      if (r.top > vh) return r.top - vh;
      return 0;
    };

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
    const markQueueChanged = () => { orderStale = true; };
    function pump(budgetMs, visibleOnly = false) {
      const t0 = performance.now();
      if (orderStale) {
        for (const b of pending) if (!b.isConnected) { pending.delete(b); painted.delete(b); stale.delete(b); blockNodes.delete(b); }
        const scored = [...pending].map((b) => [distanceToViewport(b), b]).sort((a, b) => a[0] - b[0]);
        // Huge pages: only colour blocks within reach of the viewport (bounded
        // number of live Ranges); the rest wait in `pending` for onScroll.
        const far = R.isBigPage() ? NEAR_PX() * 2 : Infinity;
        order = scored.filter((x) => x[0] <= far);
        orderStale = false;
      }
      while (order.length) {
        if (performance.now() - t0 > budgetMs) break;
        // Synchronous first pass: stop at the first block outside the viewport;
        // everything else goes to idle slices.
        if (visibleOnly && order[0][0] > 0) break;
        const block = order.shift()[1];
        if (!pending.has(block)) continue;
        pending.delete(block);
        if (!colourBlock(block)) painted.delete(block);
      }
      if (order.length) schedulePump();
      else finishPass();              // everything in range is done; far blocks wait for scroll
    }
    function schedulePump() {
      if (pumpHandle !== null) return;
      const run = () => { pumpHandle = null; if (!stopped) pump(SLICE_MS); };
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
      R.beginPass();
      ensureRoot();
      beginPass();
      const big = R.isBigPage();
      const near = NEAR_PX() * 2;
      for (const b of painted) {
        if (pending.has(b)) continue;
        if (big && distanceToViewport(b) > near) stale.add(b); else { pending.add(b); stale.delete(b); }
      }
      markQueueChanged();
      cancelPump();
      pump(SYNC_BUDGET_MS, true);
    }
    function onScroll() {
      if ((!stale.size && !pending.size) || scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (stopped) return;
        const near = NEAR_PX();
        let added = 0;
        for (const b of stale) if (!b.isConnected || distanceToViewport(b) <= near) { stale.delete(b); if (b.isConnected) { pending.add(b); added++; } }
        if (added || pending.size) { markQueueChanged(); schedulePump(); }
      }, 150);
    }
    function onResize() {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
        pendingTimers.delete(resizeTimer);
      }
      resizeTimer = trackTimer(setTimeout(() => {
        pendingTimers.delete(resizeTimer);
        resizeTimer = null;
        if (!stopped) applyColors();
      }, 120));
    }
    const onSchemeFlip = () => { if (!stopped) applyColors(); };

    function trackTimer(id) { pendingTimers.add(id); return id; }

    function scheduleApply() {
      if (applyTimer) return;
      applyTimer = trackTimer(setTimeout(() => {
        pendingTimers.delete(applyTimer);
        applyTimer = null;
        if (!stopped) applyColors();
      }, 40));
    }

    // Content root upkeep lives in reading.js; this side arms the trailing
    // retry when a rescan is throttled and queues the new roots.
    function ensureRoot() {
      const r = R.ensureRoot();
      if (!r) return;
      if (r.retryInMs !== undefined) {
        if (!rootRetryTimer) {
          rootRetryTimer = trackTimer(setTimeout(() => {
            pendingTimers.delete(rootRetryTimer);
            rootRetryTimer = null;
            if (!stopped) applyColors();
          }, r.retryInMs));
        }
        return;
      }
      r.roots.forEach(processRoot);
    }

    function startObserving() {
      if (mo) mo.disconnect();
      observedBody = document.body;
      mo = new MutationObserver((muts) => {
        R.beginPass();
        if (!R.hasRoot()) { scheduleApply(); return; }
        let structureChanged = false;
        for (const m of muts) {
          if (m.type === 'childList') {
            let ours = true;
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                if (!isLauncher(node)) ours = false;
                if (!isLauncher(node)) R.noteAdded(node);
                processRoot(node);
              } else if (node.nodeType === 3) {
                ours = false;
                if (R.isReadingText(node)) queueTextNode(node);
              } else {
                ours = false;
              }
            }
            for (const node of m.removedNodes) {
              if (node.nodeType === 1 && isLauncher(node)) continue;
              ours = false;
            }
            // External structural change may alter line wrapping — recolor.
            if (!ours && (m.addedNodes.length || m.removedNodes.length)) {
              structureChanged = true;
            }
          } else if (m.type === 'characterData') {
            const target = m.target;
            if (target.nodeType === 3 && R.isReadingText(target)) {
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

    applyColors();
    startObserving();
    // SPA/Turbo navigations can swap the <body> element wholesale; the body
    // observer would stay on the detached node. Watch <html>'s direct
    // children (no subtree) so overlays appended there hit the early return.
    rootMo = new MutationObserver(() => {
      if (!document.body || document.body === observedBody) return;
      R.resetRoot();
      applyColors();
      startObserving();
    });
    rootMo.observe(document.documentElement, { childList: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    darkMq.addEventListener('change', onSchemeFlip);
    // Late layout shifts (webfonts, images) change line wrapping after the
    // initial paint. Re-apply twice to catch them.
    trackTimer(setTimeout(() => { if (!stopped) applyColors(); }, 500));
    trackTimer(setTimeout(() => { if (!stopped) applyColors(); }, 1500));

    return {
      repaint: applyColors,
      // The Reader overlay is appended to <html>, outside the body observer.
      paintOverlay(el) { processRoot(el); applyColors(); },
      isPainted: (block) => painted.has(block),
      isColoured(node) {
        const rs = node && node.parentElement && blockRanges.get(nearestBlock(node.parentElement));
        return !!rs && rs.some(([, r]) => r.startContainer === node);
      },
      stop() {
        stopped = true;
        mo.disconnect();
        rootMo.disconnect();
        cancelPump();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll);
        darkMq.removeEventListener('change', onSchemeFlip);
        clearTimeout(scrollTimer);
        for (const t of pendingTimers) clearTimeout(t);
        clearAllHighlights();
        for (const l of document.querySelectorAll(`[${LAUNCHER_ATTR}]`)) l.remove();
        for (const el of document.querySelectorAll(`[${GRAD_ATTR}]`)) clearGradientStyle(el);
      }
    };
  }

  function clearGradientStyle(el) {
    el.removeAttribute(GRAD_ATTR);
    el.style.removeProperty('background-image');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    el.style.removeProperty('color');
  }

  function applyGradientBlocks(paletteFor) {
    const leaves = R.editableLeaves();
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
  // launchers with LAUNCHER_ATTR so the reading-text checks ignore them.
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
      const text = R.sectionText(block);
      if (text && typeof window.__bzlnSprint === 'function') {
        window.__bzlnSprint(text);
      }
    });
    return btn;
  }

  function syncLaunchers(blocks) {
    const seen = new Set();
    for (const block of R.sectionStarts(blocks)) {
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

  function sprintPage(given) {
    const sel = String(given || window.getSelection() || '').replace(/\s+/g, ' ').trim();
    const text = sel || R.extract().join(' ');
    if (text && typeof window.__bzlnSprint === 'function') {
      window.__bzlnSprint(text);
    }
  }

  // ---------- Reader overlay ----------
  let readerState = null;

  function openReader() {
    closeReader();
    const blocks = R.extract();
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
    if (session) session.paintOverlay(body);
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

  // ---------- Lifecycle ----------
  let session = null;   // live colouring session while enabled, else null

  const applyLinkStyle = () => {
    document.documentElement.classList.toggle(LINK_CLASS, !!session && settings.linkUnderline);
  };

  function enable() {
    if (session) return; // already enabled
    if (!supportsHighlights) { console.warn('[Buzzline] CSS Custom Highlight API unavailable; colouring disabled'); return; }
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', applyEnabledState, { once: true });
      return;
    }
    session = startSession();
    applyLinkStyle();
  }

  function disable() {
    if (!session) return;
    session.stop();
    session = null;
    R.resetRoot();
    document.documentElement.classList.remove(LINK_CLASS);
    closeReader();
    if (typeof window.__bzlnSprintClose === 'function') {
      window.__bzlnSprintClose();
    }
  }

  function applyEnabledState() {
    const shouldRun = settings.enabled && !S.isHostDisabled(settings, currentHost);
    if (shouldRun) enable();
    else disable();
  }

  S.load((s) => { settings = s; applyEnabledState(); });

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
    R.beginPass();
    const block = nearestBlock(el);
    const full = blockFeatures(block);
    const { chain, meta, ...f } = full;
    const entry = { ts: Date.now(), host: currentHost, verdict: verdict === 'yes' ? 'body' : 'not-body', coloured: !!session && session.isPainted(block), score: +globalThis.BuzzlineCore.blockScore(full).toFixed(3), meta, f };
    chrome.storage.local.get(['feedback'], (s) => {
      const list = Array.isArray(s.feedback) ? s.feedback : [];
      list.push(entry);
      chrome.storage.local.set({ feedback: list.slice(-FEEDBACK_MAX) });
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    settings = S.merge(settings, changes);
    if ('scheme' in changes || 'siteSchemes' in changes) {
      if (session) session.repaint();
    }
    if ('linkUnderline' in changes) {
      if (session) applyLinkStyle();
    }
    if ('enabled' in changes) {
      applyEnabledState();
    }
    if ('disabledHosts' in changes) {
      applyEnabledState();
    }
  });

  // e2e harness hook (tests/e2e/collector.js): is this text node coloured?
  window.__bzlnIsColoured = (node) => !!session && session.isColoured(node);
})();
