(() => {
  'use strict';

  // Reading text: which text on the page is the prose a person reads. Owns the
  // content root, the per-pass memos and the extraction used by colouring,
  // Reader, Sprint, launchers and the e2e harness.
  const { parseCssColor, isProseBlock, SENTENCE_END_RX, BLOCK_MODEL, blockScore } = globalThis.BuzzlineCore;
  const { SKIP_TAGS, INLINE_CODE_TAGS, isLauncher, inLink, isBlockLevel, nearestBlock, blockStats, blockFeatures } = globalThis.BuzzlineBlocks;

  const LAUNCHER_MIN_CHARS = 120; // skip captions / tiny labels
  const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
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

  const BIG_PAGE_CHARS = 150000; // root text above this: far blocks wait until scrolled near

  // Smallest container holding the page's real prose (see pickContentRoot).
  // Only text inside it is coloured; null = page has no prose body.
  let contentRoot = null;
  let rootPickedAt = 0;
  // Set when substantial new text is added outside contentRoot (lazy-loaded
  // comments, SPA shells): the root may be a stale, too-small container.
  let rootStale = false;
  // Sibling regions of the same kind as the root's ancestors (other timeline
  // comments next to a dominant description); coloured along with contentRoot.
  let rootPeers = [];
  const inRoots = (el) => (!!contentRoot && contentRoot.contains(el)) || rootPeers.some((r) => r.contains(el));

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

  let bigPageMemo = null;        // [root, isBig]
  const isBigPage = () => {
    if (!contentRoot) return false;
    if (!bigPageMemo || bigPageMemo[0] !== contentRoot) bigPageMemo = [contentRoot, contentRoot.textContent.length > BIG_PAGE_CHARS];
    return bigPageMemo[1];
  };

  // Text with its own deliberate colour (status labels, badges, "green: good")
  // is left alone. Links count as prose. An element is "self-coloured" when its
  // computed colour differs from its block's; a short block is also compared
  // with its parent's, so a coloured <div>Merged</div> label is caught too.
  let colorMemo = new WeakMap();
  const COLOR_TOLERANCE = 48;   // summed |dr|+|dg|+|db|
  const sameColor = (a, b) =>
    !a || !b || Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= COLOR_TOLERANCE;
  const cssColor = (el) => parseCssColor(getComputedStyle(el).color);
  function isSelfColored(node) {
    const start = node.parentElement;
    if (!start) return false;
    const memo = colorMemo.get(start);
    if (memo !== undefined) return memo;
    let result = false;
    if (!inLink(start)) {
      const chain = [];
      let p = start;
      while (p && p !== document.body && !isBlockLevel(p)) { chain.push(p); p = p.parentElement; }
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
    const block = nearestBlock(node.parentElement);
    // The Reader overlay holds only extracted prose: colour all of it.
    if (block.closest('.bzln-reader-root')) return true;
    if (!isReadingCandidate(block) || !inReadingRun(block)) return false;
    return true;
  };

  // ---------- Block prose classifier (runs BEFORE colouring) ----------
  // Memos live for one pass (see beginPass), so a block is scored once per
  // pass, not once per text node.
  let proseMemo = new WeakMap();     // block   -> bool

  // ---------- Reading runs ----------
  // Only long stretches of reading text are coloured: a prose block counts if
  // the run of prose it belongs to (in document order) reaches roughly five
  // sentences. Headings don't break a run; RUN_GAP_CHARS of non-prose text
  // between two prose blocks (a result title + URL, a card header) does, so
  // isolated snippets on search results, feeds and listings stay plain.
  const RUN_MIN_CHARS = 500, RUN_MIN_SENTENCES = 5, RUN_GAP_CHARS = 60;
  let blockOrder = null, blockPos = null, blockOrderRoot = null, blockOrderRebuilt = false;
  let runMemo = new WeakMap();
  function buildBlockOrder() {
    const roots = [contentRoot, ...rootPeers].filter(Boolean)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const order = [], pos = new Map();
    for (const r of roots) for (const { block } of collectReadable(r)) if (!pos.has(block)) { pos.set(block, order.length); order.push(block); }
    blockOrder = order; blockPos = pos; blockOrderRoot = contentRoot;
  }
  const sentencesOf = (b) => (blockStats(b).text.match(SENTENCE_END_RX) || []).length;
  // Hysteresis: blocks scoring a little under the model threshold (a short
  // reader comment next to long ones) still count, but only inside a run that
  // reaches the reading length on its own merits, and only if they hold at
  // least one sentence: a sentence-less blurb under a profile heading or card
  // title ("Delivering inference to AI-native companies") is a label, not a
  // comment. The run itself must contain at least one block the model
  // accepts outright.
  const NEAR_PROSE = 0.12;
  let nearMemo = new WeakMap();
  function isReadingCandidate(block) {
    if (isProseBlockEl(block)) return true;
    let v = nearMemo.get(block);
    if (v === undefined) {
      v = block !== document.body && hasBox(block) && blockStats(block).chars >= BLOCK_MODEL.minChars &&
          sentencesOf(block) > 0 && blockScore(blockFeatures(block)) > NEAR_PROSE;
      nearMemo.set(block, v);
    }
    return v;
  }
  function inReadingRun(block) {
    let v = runMemo.get(block);
    if (v !== undefined) return v;
    let chars = blockStats(block).chars, sents = sentencesOf(block), strong = isProseBlockEl(block);
    const enough = () => chars >= RUN_MIN_CHARS && sents >= RUN_MIN_SENTENCES && strong;
    if (!enough()) {
      // Rebuild the order when the root changed, or once per pass on a miss
      // (new content); stale entries are skipped via isConnected.
      if (!blockOrder || blockOrderRoot !== contentRoot || (!blockPos.has(block) && !blockOrderRebuilt)) {
        buildBlockOrder(); blockOrderRebuilt = true;
      }
      const i = blockPos.get(block);
      if (i !== undefined) {
        for (const dir of [-1, 1]) {
          let gap = 0;
          for (let j = i + dir; j >= 0 && j < blockOrder.length && !enough(); j += dir) {
            const b = blockOrder[j];
            if (!b.isConnected) continue;
            // A heading that is itself a link (a search-result or card title)
            // separates runs; ordinary section headings don't.
            if (isHeading(b)) { if (inLink(b) && (gap += blockStats(b).chars) >= RUN_GAP_CHARS) break; continue; }
            if (isReadingCandidate(b)) { chars += blockStats(b).chars; sents += sentencesOf(b); strong = strong || isProseBlockEl(b); gap = 0; }
            else {
              // Short metadata rows (usernames, "Score: 5 votes", timestamps)
              // and quoted sentences are neutral; only substantive link or
              // label text (result titles, URLs, card headers) separates runs.
              const st = blockStats(b);
              if ((st.link / Math.max(1, st.total) >= 0.5 || (st.chars >= 40 && sentencesOf(b) === 0)) && (gap += st.chars) >= RUN_GAP_CHARS) break;
            }
          }
        }
      }
    }
    v = enough();
    runMemo.set(block, v);
    return v;
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

  const isExtractionSkipped = (el) =>
    (SKIP_TAGS.has(el.tagName) && !INLINE_CODE_TAGS.has(el.tagName)) ||
    isLauncher(el) ||
    isNonContent(el) ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.classList.contains('bzln-reader-root') ||
    el.classList.contains('bzln-sprint-root');

  // -> [{ node, block }] for every readable, rendered text node under root.
  // Whitespace-only nodes are kept so joined text keeps its word breaks.
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
    const blockOf = nearestBlock;   // shares the display memo with the rest of the pipeline
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

  // Group consecutive same-block text into whitespace-collapsed strings. A
  // <br> between two text nodes starts a new string, so <br>-separated
  // paragraphs (paulgraham.com, old forums) don't run together as "it.Partly".
  const afterBr = (node, block) => {
    let p = node;
    while (p && p !== block && !p.previousSibling) p = p.parentNode;
    let prev = p && p !== block ? p.previousSibling : null;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue.trim()) prev = prev.previousSibling;
    return !!prev && prev.nodeName === 'BR';
  };
  function blocksFrom(entries) {
    const blocks = [];
    let lastBlock = null;
    let buf = '';
    const flush = () => {
      const t = buf.replace(/\s+/g, ' ').trim();
      if (t) blocks.push(t);
    };
    for (const { node, block } of entries) {
      if (block !== lastBlock || afterBr(node, block)) {
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
        v = inLink(el);
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

  // ---------- Pass and root lifecycle ----------
  // Verdicts (isReadingText, isBigPage, sectionStarts, ...) are memoised until
  // the next refresh() or changed(); each of those starts a fresh pass.
  function beginPass() {
    colorMemo = new WeakMap(); proseMemo = new WeakMap(); runMemo = new WeakMap(); nearMemo = new WeakMap();
    blockOrderRebuilt = false;
    globalThis.BuzzlineBlocks.reset();
  }

  // Start a colouring pass. The content root is rescanned when it is missing,
  // detached or stale, at most once per ROOT_RETRY_MS.
  //   roots      roots picked by this call, for the caller to colour; [] when
  //              the root is unchanged, the rescan was throttled, or the page
  //              has no prose body
  //   retryInMs  > 0 when a rescan was due but throttled: call refresh()
  //              again after that long so late-loading prose is found
  function refresh() {
    beginPass();
    if (contentRoot && contentRoot.isConnected && !rootStale) return { roots: [], retryInMs: 0 };
    const wait = rootPickedAt + ROOT_RETRY_MS - performance.now();
    if ((!contentRoot || rootStale) && rootPickedAt && wait > 0) return { roots: [], retryInMs: wait };
    rootPickedAt = performance.now();
    const prev = contentRoot && contentRoot.isConnected ? contentRoot : null;
    const picked = pickContentRoot(collectReadable(document.body));
    contentRoot = picked ? picked.root : (rootStale ? prev : null);
    rootPeers = picked ? picked.peers : (rootStale && prev ? rootPeers : []);
    rootStale = false;
    return { roots: contentRoot ? [contentRoot, ...rootPeers] : [], retryInMs: 0 };
  }

  // A batch of page mutations (MutationRecords). Starts a fresh pass and notes
  // substantial text added outside the root (lazy-loaded comments, SPA shells):
  // the root may be a stale, too-small container, so the next refresh()
  // rescans. Returns false when there is no content root yet: the caller
  // should refresh() rather than colour the added text.
  function changed(mutations) {
    beginPass();
    if (!contentRoot) return false;
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !isLauncher(n) && !inRoots(n) && (n.textContent || '').length >= MIN_PAGE_PROSE) rootStale = true;
      }
    }
    return true;
  }

  // Forget the content root (colouring stopped, or the page's <body> was
  // replaced): the next refresh() scans the page afresh.
  function resetRoot() {
    contentRoot = null; rootPickedAt = 0; rootStale = false; rootPeers = []; bigPageMemo = null; blockOrder = null;
  }

  // Text nodes under `root` worth queueing for colouring. A cheap pre-filter
  // (in scope, not blank, root not skipped); isReadingText makes the real
  // per-block decision when the text is coloured.
  function candidateText(root) {
    if (!root || (root.nodeType === 1 && (skipElement(root) || isNonContent(root)))) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.nodeValue && n.nodeValue.trim() && n.parentElement && inContentRoot(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const out = [];
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  const api = { refresh, changed, resetRoot, candidateText, isReadingText: acceptTextNode, isBigPage, editableLeaves: findGradientLeaves, extract: extractAllBlocks, sectionText, sectionStarts };
  globalThis.BuzzlineReading = api;
})();
