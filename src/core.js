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
  // reads) rather than metadata, captions, references, ads or link chrome?
  // Trained on LLM-labelled blocks from 17 real sites (tests/e2e); evaluated
  // leave-one-site-out. Input is a plain feature object (see blockScore).
  const META_RX = /(cite|citation|reference|caption|metadata|byline|dateline|author|footer|credit|timestamp|breadcrumb|toc|disclaimer|copyright|modified|meta)/i;
  const BLOCK_MODEL = {
    threshold: 0.4,
    //        bias    logChars linkFrac sentDens endsPunct meta    ad      rel    side    nav     chrome  main    isP    isLi   isTd   wFrac  edge
    w: [-1.163, 1.846, -2.193, 0.533, 0.192, -3.456, -1.159, 0.062, -0.595, -0.739, -2.317, -0.17, 3.132, 1.606, 0.066, 0.679, -0.572]
  };
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  // f: { chars, words, sentences, endsPunct, linkFrac, chain, ad, rel, side, nav,
  //      chrome (nav/aside/header/footer ancestors), main (main/article ancestors),
  //      tag, wFrac (width / viewport), cx (horizontal centre / viewport) }
  const blockScore = (f) => {
    const x = [
      1, Math.log10(Math.max(1, f.chars)) / 3, f.linkFrac, Math.min(1, (f.sentences / Math.max(1, f.words)) * 10),
      f.endsPunct ? 1 : 0, META_RX.test(f.chain || '') ? 1 : 0,
      f.ad > 0 ? 1 : 0, f.rel > 0 ? 1 : 0, f.side > 0 ? 1 : 0, f.nav > 0 ? 1 : 0,
      f.chrome > 0 ? 1 : 0, f.main > 0 ? 1 : 0,
      f.tag === 'p' ? 1 : 0, f.tag === 'li' ? 1 : 0, (f.tag === 'td' || f.tag === 'th') ? 1 : 0,
      f.wFrac, Math.abs(f.cx - 0.5) * 2
    ];
    let z = 0;
    for (let i = 0; i < x.length; i++) z += x[i] * BLOCK_MODEL.w[i];
    return sigmoid(z);
  };
  const isProseBlock = (f) => blockScore(f) > BLOCK_MODEL.threshold;

  const api = { SCHEMES, hexToRgb, mix, rgbStr, parseCssColor, relLuminance, contrastRatio, isDarkSurface, tokenizeWords, blockScore, isProseBlock, BLOCK_MODEL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineCore = api;
})();
