// Page-side collector for the Buzzline e2e harness. Evaluate this file's single
// expression in a page that already has the extension injected. It returns every
// visible text block (>= 30 chars) with layout/structure features and the share
// of its text the extension coloured (`coloured`, 0..1).
(() => {
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','BUTTON','SVG','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED','MATH','PRE']);
  const RX = { ad: /(^|[\s_-])(ad|ads|advert|advertisement|sponsor|sponsored|promo|promoted|outbrain|taboola)($|[\s_-])/i,
    rel: /(related|recommend|trending|popular|most-read|mostread|more-stories|newsletter|subscribe|signup|follow|share|social|cookie|consent|breadcrumb)/i,
    side: /(sidebar|aside|rail|widget)/i, nav: /(^|[\s_-])(nav|navbar|menu|header|masthead|footer|toolbar|tabs?)($|[\s_-])/i, comment: /comment/i };
  const vw = innerWidth, docH = Math.max(document.documentElement.scrollHeight, 1);
  const displayCache = new Map();
  const isBlockEl = (el) => { let v = displayCache.get(el); if (v === undefined) { const d = getComputedStyle(el).display; v = !!d && d !== 'inline' && d !== 'inline-block' && d !== 'contents'; displayCache.set(el, v); } return v; };
  const blockOf = (el) => { let p = el; while (p && p !== document.body && !isBlockEl(p)) p = p.parentElement; return p || document.body; };
  const skipCache = new Map();
  const skipped = (el) => { if (!el) return false; let v = skipCache.get(el); if (v === undefined) { v = (SKIP.has(el.tagName) && !el.closest('a')) || el.getAttribute('aria-hidden') === 'true' || el.classList.contains('bzln-sprint-root') || el.classList.contains('bzln-reader-root') || el.hasAttribute('data-bzln-launcher') || skipped(el.parentElement); skipCache.set(el, v); } return v; };
  const blocks = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement; if (!p || skipped(p) || !n.nodeValue) continue;
    const b = blockOf(p);
    let r = blocks.get(b); if (!r) { r = { el: b, text: '', link: 0, coloured: 0, total: 0 }; blocks.set(b, r); }
    const v = n.nodeValue; r.text += v; r.total += v.length;
    if (p.closest('a')) r.link += v.length;
    if (p.hasAttribute('data-bzln') && p.style.getPropertyValue('--bzln-c')) r.coloured += v.length;
  }
  const out = [];
  const recs = [];
  for (const r of blocks.values()) {
    const el = r.el; if (!el.checkVisibility || !el.checkVisibility({ visibilityProperty: true })) continue;
    const text = r.text.replace(/\s+/g, ' ').trim(); if (text.length < 30) continue;
    const rect = el.getBoundingClientRect(); if (rect.width < 20 || rect.height < 8) continue;
    const cs = getComputedStyle(el);
    const words = text.split(' ').length;
    const sentences = (text.match(/[.!?]["')\]]?(\s|$)|[。！？]/g) || []).length;
    const promo = /\b(subscri(?:be|ption|ber)s?|newsletter|sign up|unlimited access|support (?:our|independent|quality)|podcast|follow us|download (?:the|our) app|start the conversation|continue reading|become a member|already a member|log ?in|all rights reserved|cookie)\b/i.test(text) ? 1 : 0;
    const chain = []; const flags = { ad: 0, rel: 0, side: 0, nav: 0, comment: 0 }; const land = { main: 0, article: 0, nav: 0, aside: 0, header: 0, footer: 0, form: 0 };
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cls = (typeof e.className === 'string' ? e.className : '') + ' ' + (e.id || '');
      for (const k of Object.keys(RX)) if (RX[k].test(cls)) flags[k]++;
      const t = e.tagName.toLowerCase(); if (land[t] !== undefined) land[t]++;
      const role = e.getAttribute('role'); if (role === 'main') land.main++; if (role === 'navigation') land.nav++; if (role === 'complementary') land.aside++; if (role === 'banner') land.header++; if (role === 'contentinfo') land.footer++;
      if (chain.length < 6) chain.push(t + (e.id ? '#' + e.id.slice(0, 18) : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0].slice(0, 18) : ''));
    }
    let depth = 0; for (let e = el; e; e = e.parentElement) depth++;
    const rec = { el, link: r.link / Math.max(1, r.total), row: out.length };
    recs.push(rec);
    out.push({ tag: el.tagName.toLowerCase(), chars: text.length, words, sentences, promo, endsPunct: /[.!?。！？]["')\]]?$/.test(text) ? 1 : 0, linkFrac: +(r.link / Math.max(1, r.total)).toFixed(3),
      cx: +(((rect.left + rect.right) / 2) / vw).toFixed(3), wFrac: +(rect.width / vw).toFixed(3), left: +(rect.left / vw).toFixed(3), y: +(((rect.top + scrollY) / docH)).toFixed(3), h: Math.round(rect.height),
      fs: parseFloat(cs.fontSize) || 0, depth, ...Object.fromEntries(Object.entries(flags).map(([k, v]) => ['f_' + k, v])), ...Object.fromEntries(Object.entries(land).map(([k, v]) => ['l_' + k, v])),
      coloured: +(r.coloured / Math.max(1, r.total)).toFixed(3), chain: chain.reverse().join('>'), text: text.slice(0, 220) });
  }
  // Contextual features. "Collected block" = any block in `out` (visible, >= 30 chars).
  // prev/nextChars: chars of the nearest previous/next element sibling that is a collected block.
  // sibProse: share of the parent's collected-block children with >= 80 chars and < 50% link text.
  const byEl = new Map(recs.map((r) => [r.el, r]));
  for (const r of recs) {
    let p = r.el.previousElementSibling; while (p && !byEl.has(p)) p = p.previousElementSibling;
    let n = r.el.nextElementSibling; while (n && !byEl.has(n)) n = n.nextElementSibling;
    const o = out[r.row];
    o.prevChars = p ? out[byEl.get(p).row].chars : 0;
    o.nextChars = n ? out[byEl.get(n).row].chars : 0;
    const sibs = r.el.parentElement ? [...r.el.parentElement.children].filter((c) => byEl.has(c)) : [r.el];
    const prose = sibs.filter((c) => { const s = out[byEl.get(c).row]; return s.chars >= 80 && s.linkFrac < 0.5; }).length;
    o.sibProse = +(prose / Math.max(1, sibs.length)).toFixed(3);
  }
  return { title: document.title.slice(0, 120), url: location.href, vw, docH, blocks: out };
})()
