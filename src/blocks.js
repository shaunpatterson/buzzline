(() => {
  'use strict';

  // Block features: what a text block is, what text it owns and the feature
  // object the classifier in core.js scores. One definition, used by the
  // content script, the feedback recorder and the e2e collector (and, via
  // core.featureVector, the trainer).
  const { SENTENCE_END_RX, textFeatures, META_RX } = globalThis.BuzzlineCore;

  const LAUNCHER_ATTR = 'data-bzln-launcher';
  const SKIP_TAGS = new Set([
    'SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','BUTTON',
    'CODE','PRE','KBD','SAMP','VAR','TT',
    'SVG','CANVAS','VIDEO','AUDIO','IMG','IFRAME','OBJECT','EMBED','MATH'
  ]);

  // Inline code is part of the sentence when reading aloud/RSVP; only <pre>
  // blocks are skipped for extraction. Colouring still skips all of SKIP_TAGS.
  const INLINE_CODE_TAGS = new Set(['CODE', 'KBD', 'SAMP', 'VAR', 'TT']);

  // Link-like elements. Besides <a>, sites wrap titles in custom elements
  // (Reddit's <delegated-link>, role="link" divs) whose real anchor lives in
  // shadow DOM; their text is navigation, not prose.
  // Direct checks, not Element.matches(): this runs for every ancestor of
  // every text node and a selector list showed up as the top CPU cost.
  const LINK_TAGS = new Set(['A', 'BUTTON', 'LABEL', 'SUMMARY']);
  let linkMemo = new WeakMap();     // element -> is link-like itself or via an ancestor
  const isLinkish = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const t = el.tagName;
    if (LINK_TAGS.has(t) || el.hasAttribute('href') || el.hasAttribute('url')) return true;
    const role = el.getAttribute('role');
    if (role === 'link' || role === 'button') return true;
    return t.includes('-') && /LINK|BUTTON/.test(t);
  };
  const inLink = (el) => {
    if (!el || el.nodeType !== 1) return false;
    let v = linkMemo.get(el);
    if (v === undefined) { v = isLinkish(el) || inLink(el.parentElement); linkMemo.set(el, v); }
    return v;
  };

  const isLauncher = (el) =>
    !!el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute(LAUNCHER_ATTR);

  // ---------- Block prose classifier features ----------
  // Memos live for one pass (reset() at the top of every colouring pass and on
  // every mutation batch), so a block is measured once per pass, not once per
  // text node.
  const FEAT_AD = /(^|[\s_-])(ad|ads|advert|advertisement|sponsor|sponsored|promo|promoted|outbrain|taboola)($|[\s_-])/i;
  const FEAT_REL = /(related|recommend|trending|popular|most-read|mostread|more-stories|newsletter|subscribe|signup|follow|share|social|cookie|consent|breadcrumb)/i;
  const FEAT_SIDE = /(sidebar|aside|rail|widget)/i;
  const FEAT_NAV = /(^|[\s_-])(nav|navbar|menu|header|masthead|footer|toolbar|tabs?)($|[\s_-])/i;
  const CHROME_TAGS = new Set(['nav', 'aside', 'header', 'footer']);
  const CHROME_ROLES = new Set(['navigation', 'complementary', 'banner', 'contentinfo']);
  let displayMemo = new WeakMap();   // element -> is block-level display
  let statsMemo = new WeakMap();     // block   -> { text, total, link, chars, counts }
  const reset = () => { displayMemo = new WeakMap(); statsMemo = new WeakMap(); linkMemo = new WeakMap(); };

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
  // contextual features: visible, >= 30 chars, non-trivial box.
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
      ...textFeatures(text),   // promo, digitFrac, upperFrac, puncFrac, avgWordLen, price, dateish, endsColon
      linkFrac: s.link / Math.max(1, s.total),
      tag: block.tagName.toLowerCase(),
      wFrac: rect.width / vw,
      cx: (rect.left + rect.right) / 2 / vw,
      ad: 0, rel: 0, side: 0, nav: 0, chrome: 0, main: 0, chain: '',
      prevChars: 0, nextChars: 0, sibProse: 0
    };
    const chain = [];
    // Class/id flags stop at the enclosing main/article: page wrappers above it
    // (body.cafemedia-no-footer-…) say nothing about the block.
    let pastMain = false;
    for (let e = block; e && e !== document.documentElement; e = e.parentElement) {
      const cls = pastMain ? '' : (typeof e.className === 'string' ? e.className : '') + ' ' + (e.id || '');
      if (FEAT_AD.test(cls)) f.ad++;
      if (FEAT_REL.test(cls)) f.rel++;
      if (FEAT_SIDE.test(cls)) f.side++;
      if (FEAT_NAV.test(cls)) f.nav++;
      const t = e.tagName.toLowerCase();
      const role = e.getAttribute('role');
      if (CHROME_TAGS.has(t) || (role && CHROME_ROLES.has(role))) f.chrome++;
      if (t === 'main' || t === 'article' || role === 'main') { f.main++; pastMain = true; }
      if (chain.length < 6) {
        const c0 = typeof e.className === 'string' && e.className ? e.className.trim().split(/\s+/)[0].slice(0, 18) : '';
        chain.push(t + (e.id ? '#' + e.id.slice(0, 18) : '') + (c0 ? '.' + c0 : ''));
      }
    }
    f.chain = chain.join('>');
    f.meta = META_RX.test(f.chain) ? 1 : 0;
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

  const api = { LAUNCHER_ATTR, SKIP_TAGS, INLINE_CODE_TAGS, isLauncher, isLinkish, inLink, isBlockLevel, nearestBlock, blockStats, countsAsBlock, blockFeatures, reset };
  globalThis.BuzzlineBlocks = api;
})();
