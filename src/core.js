(() => {
  'use strict';

  // [anchor, accentA, anchor, accentB]; line i runs colors[i%4] -> colors[(i+1)%4].
  // The intentional duplicates anchor every other line to a neutral colour.
  // `light` is used on light surfaces, `dark` on dark surfaces.
  const SCHEMES = {
    classic:      { name: 'Classic',       light: ['#000000', '#1f4fb0', '#000000', '#b02a2a'], dark: ['#eaeaea', '#7fb7ff', '#eaeaea', '#ff9c8a'] },
    ocean:        { name: 'Ocean',         light: ['#003a5c', '#0087c7', '#003a5c', '#00b3a4'], dark: ['#d8ecf5', '#4fc3f7', '#d8ecf5', '#4dd9c8'] },
    bumblebee:    { name: 'Bumblebee',     light: ['#1a1a1a', '#d4a017', '#1a1a1a', '#8b4513'], dark: ['#f0f0f0', '#f7c948', '#f0f0f0', '#e0915a'] },
    highcontrast: { name: 'High contrast', light: ['#000000', '#0000ff', '#000000', '#d40000'], dark: ['#ffffff', '#6ea8ff', '#ffffff', '#ff6b6b'] }
  };

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

  // Computed-style colours only: "rgb(r, g, b)", "rgba(r, g, b, a)", "rgb(r g b / a)".
  // Anything else (oklch(), color(), '') -> null.
  const parseCssColor = (s) => {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s || '');
    if (!m) return null;
    const a = m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };

  const relLuminance = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrastRatio = (a, b) => {
    const la = relLuminance(a), lb = relLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  // bg: nearest opaque ancestor background or null; text: the block's own colour or null.
  // 0.18 is where black and white text have equal contrast. With no known
  // background, light text implies a dark surface.
  const isDarkSurface = (bg, text) =>
    bg ? relLuminance(bg) < 0.18 : (text ? relLuminance(text) > 0.5 : false);

  // Nudge each palette colour toward white (dark surface) or black (light
  // surface) until it reaches `min` contrast against `bg`. Keeps hue; only the
  // lightness moves, and only as far as needed. bg null -> palette unchanged.
  const MIN_CONTRAST = 4.5;
  const ensureContrast = (palette, bg, min = MIN_CONTRAST) => {
    if (!bg) return palette;
    const target = relLuminance(bg) < 0.18 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    return palette.map((c) => {
      if (contrastRatio(c, bg) >= min) return c;
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {           // binary search the mix amount
        const t = (lo + hi) / 2;
        if (contrastRatio(mix(c, target, t), bg) >= min) hi = t; else lo = t;
      }
      return mix(c, target, hi);
    });
  };

  // Whitespace split, then fold punctuation-only tokens into a neighbour so
  // Sprint never flashes a lone "," or "—". Unambiguous openers attach to the
  // next word; everything else attaches to the previous word.
  const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
  const OPENER = /^[(\[{“‘«¿¡]+$/;
  const tokenizeWords = (text) => {
    const out = [];
    let prefix = '';
    for (const tok of (text || '').trim().split(/\s+/).filter(Boolean)) {
      if (HAS_WORD_CHAR.test(tok)) { out.push(prefix + tok); prefix = ''; }
      else if (OPENER.test(tok) || !out.length) prefix += tok;
      else out[out.length - 1] += tok;
    }
    if (prefix) { if (out.length) out[out.length - 1] += prefix; else out.push(prefix); }
    return out;
  };

  // Tiny logistic model: is this text block "guts" (long-form prose a person
  // reads) rather than metadata, captions, references, ads, listing cards or
  // link chrome? Trained on 5.5k LLM-labelled blocks from 82 real sites
  // (tests/e2e/train.js); 16 sites held out. Input is a plain feature object.
  const META_RX = /(cite|citation|reference|caption|metadata|byline|dateline|author|footer|credit|timestamp|breadcrumb|toc|disclaimer|copyright|modified|meta)/i;
  // Wording typical of paywalls, newsletter/subscribe prompts and promos that
  // are otherwise structurally identical to body paragraphs. Tested on the first
  // PROMO_WINDOW chars only: that is what the training data stored, and promos
  // announce themselves early.
  const PROMO_WINDOW = 220;
  const PROMO_RX = /\b(subscri(?:be|ption|ber)s?|newsletter|sign up|unlimited access|support (?:our|independent|quality)|podcast|follow us|download (?:the|our) app|start the conversation|continue reading|become a member|already a member|log ?in|all rights reserved|cookie)\b/i;
  // Sentence terminators incl. CJK full-width forms.
  const SENTENCE_END_RX = /[.!?]["')\]]?(\s|$)|[。！？]/g;
  // Cheap lexical features of a block, all computed on the first TEXT_WINDOW
  // chars (that is what the training data stores). Catches metadata-ish text
  // the structural features miss: prices, dates, ALL-CAPS labels, "Updated 3
  // days ago", "Name:" rows, number-heavy tables.
  const TEXT_WINDOW = 220;
  const PRICE_RX = /[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP)\b|\b\d+(?:\.\d+)?%\s?off\b/i;
  const DATEISH_RX = /\b(?:\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?|(?:mon|tues|wednes|thurs|fri|satur|sun)day|updated|published|posted|\d{4}-\d{2}-\d{2})\b/i;
  const textFeatures = (text) => {
    const s = (text || '').slice(0, TEXT_WINDOW);
    const letters = (s.match(/\p{L}/gu) || []).length;
    const upper = (s.match(/\p{Lu}/gu) || []).length;
    const digits = (s.match(/\p{N}/gu) || []).length;
    const punct = (s.match(/[^\p{L}\p{N}\s]/gu) || []).length;
    const words = s.trim() ? s.trim().split(/\s+/) : [];
    return {
      promo: PROMO_RX.test(s) ? 1 : 0,
      digitFrac: digits / Math.max(1, s.length),
      upperFrac: upper / Math.max(1, letters),
      puncFrac: punct / Math.max(1, s.length),
      avgWordLen: Math.min(12, words.reduce((a, w) => a + w.length, 0) / Math.max(1, words.length)) / 12,
      price: PRICE_RX.test(s) ? 1 : 0,
      dateish: DATEISH_RX.test(s) ? 1 : 0,
      endsColon: /:\s*$/.test(s) && s.length < TEXT_WINDOW ? 1 : 0
    };
  };

  const BLOCK_MODEL = {
    threshold: 0.4,
    minChars: 50,   // hard floor: shorter blocks are never "long stretches of text"
    //   bias   logChars linkFrac sentDens meta   ad     rel    side  nav   chrome  main   isP   isLi  isTd  wFrac  edge  nbrLong sibProse promo
    w: [-3.099, 1.717, -2.272, -0.221, -2.541, -0.138, -0.546, 0.183, 0.303, -1.762, -0.272, 2.202, 0.598, -0.198, 0.698, -0.113, 0.977, 1.713, -1.036]
  };
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  // f: { chars, words, sentences, linkFrac, chain (ancestor path; only
  //      META_RX matters), ad, rel, side, nav (class/id token hits), chrome
  //      (nav/aside/header/footer ancestors), main (main/article ancestors),
  //      tag, wFrac (width / viewport), cx (horizontal centre / viewport),
  //      prevChars/nextChars (chars of the nearest sibling blocks, 0 if none),
  //      sibProse (share of sibling blocks that are >= 80 chars and < 50% links),
  //      promo (PROMO_RX wording in the first PROMO_WINDOW chars; or `text` to derive it) }
  const blockScore = (f) => {
    const x = [
      1, Math.log10(Math.max(1, f.chars)) / 3, f.linkFrac, Math.min(1, (f.sentences / Math.max(1, f.words)) * 10),
      (f.meta !== undefined ? f.meta : META_RX.test(f.chain || '')) ? 1 : 0,
      f.ad > 0 ? 1 : 0, f.rel > 0 ? 1 : 0, f.side > 0 ? 1 : 0, f.nav > 0 ? 1 : 0,
      f.chrome > 0 ? 1 : 0, f.main > 0 ? 1 : 0,
      f.tag === 'p' ? 1 : 0, f.tag === 'li' ? 1 : 0, (f.tag === 'td' || f.tag === 'th') ? 1 : 0,
      f.wFrac, Math.abs(f.cx - 0.5) * 2,
      Math.log10(1 + Math.max(f.prevChars || 0, f.nextChars || 0)) / 3, f.sibProse || 0,
      (f.promo !== undefined ? f.promo : PROMO_RX.test((f.text || '').slice(0, PROMO_WINDOW))) ? 1 : 0
    ];
    let z = 0;
    for (let i = 0; i < x.length; i++) z += x[i] * BLOCK_MODEL.w[i];
    return sigmoid(z);
  };
  const isProseBlock = (f) => f.chars >= BLOCK_MODEL.minChars && blockScore(f) > BLOCK_MODEL.threshold;

  const api = { SCHEMES, hexToRgb, mix, rgbStr, parseCssColor, relLuminance, contrastRatio, isDarkSurface, ensureContrast, tokenizeWords, blockScore, isProseBlock, BLOCK_MODEL, META_RX, PROMO_RX, PROMO_WINDOW, TEXT_WINDOW, textFeatures, SENTENCE_END_RX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineCore = api;
})();
