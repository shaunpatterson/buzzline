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

  const api = { SCHEMES, hexToRgb, mix, rgbStr, parseCssColor, relLuminance, contrastRatio, isDarkSurface, tokenizeWords };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineCore = api;
})();
