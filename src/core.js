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

  // Computed-style colours. "rgb(r, g, b)", "rgba(r, g, b, a)" and
  // "rgb(r g b / a)" are parsed directly. Modern CSS computes to other
  // syntaxes too: color-mix() and oklch() surfaces (Discord, Tailwind 4,
  // Open Props themes) come back as oklab()/oklch()/lab()/color(...). Those
  // are converted by the browser itself: paint one pixel, read it back.
  // Outside a browser (node), and for '' or invalid input, the result is null.
  const RGB_RX = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/;
  let pixel = null;
  const converted = new Map();   // css string -> { r, g, b, a } | null
  const viaBrowser = (s) => {
    if (!s || typeof OffscreenCanvas !== 'function' || typeof CSS === 'undefined' || !CSS.supports('color', s)) return null;
    let c = converted.get(s);
    if (c !== undefined) return c;
    if (!pixel) pixel = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = s;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    c = { r, g, b, a: a / 255 };
    if (converted.size >= 512) converted.clear();
    converted.set(s, c);
    return c;
  };
  const parseCssColor = (s) => {
    const m = RGB_RX.exec(s || '');
    if (!m) return viaBrowser(s);
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

  // Tiny block classifier: is this text block "guts" (long-form prose a person
  // reads) rather than metadata, captions, references, ads, listing cards or
  // link chrome? A 26-feature -> 16 tanh -> 1 MLP (~450 weights) trained on
  // 15k LLM-labelled blocks from 250 real sites, 50 held out
  // (tests/e2e/train.js + scripts/embed_model.js). Input is a plain feature object.
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

  // BLOCK_MODEL:begin (generated by scripts/embed_model.js from tests/e2e/data/model.json)
  const BLOCK_MODEL = {"type":"mlp","names":["bias","logChars","linkFrac","sentDens","meta","ad","rel","side","nav","chrome","main","isP","isLi","isTd","wFrac","edge","nbrLong","sibProse","promo","digitFrac","upperFrac","puncFrac","avgWordLen","price","dateish","endsColon"],"threshold":0.6,"minChars":50,"H":16,"W1":[[0.0242,0.0699,-0.0313,-0.0196,-0.2331,-0.0944,0.0058,0.0262,-0.0319,0.0147,0.0041,-0.0453,-0.1016,-0.0311,0.0138,-0.0859,-0.0213,0.0297,0.007,0.0074,0.013,0.0145,0.0273,0.0275,0.1333,-0.0169],[-0.2456,0.9601,-0.4358,0.4922,0.3315,0.1368,-0.3789,0.3897,0.2522,-0.0948,-0.3285,1.1092,-1.1106,-0.0872,-1.2906,-0.0647,0.1083,0.4225,-0.9747,-0.2563,-0.696,-0.507,-0.1879,0.1914,-0.1707,-0.1724],[-0.0182,0.1615,0.7388,0.0149,0.9343,-0.1362,-0.6286,-0.6763,0.261,-0.0054,-0.1782,-1.4108,-0.5802,0.515,-0.7896,-0.1312,-0.7032,-0.3828,-0.3119,-0.0409,-0.2462,-0.0173,1.2524,-0.1607,-0.1971,0.5496],[0.0181,0.0033,0.1063,-0.0064,-0.1421,0.0132,0.0009,-0.0959,0.0388,0.0586,0.0837,0.0935,-0.082,-0.023,0.0148,-0.0536,-0.1357,0.0161,0.1166,-0.0282,-0.0349,-0.0447,0.019,0.0686,-0.149,-0.0084],[0.6403,0.1838,-0.9692,-1.0186,-0.4703,0.2545,0.1159,-0.1181,-0.3123,-1.4109,0.1728,0.6726,0.028,0.0204,0.0038,0.4525,-0.8258,-0.0193,-0.3783,-0.6391,-1.059,-1.0077,0.5846,0.1861,-0.3511,0.0745],[-0.5659,2.7817,-0.3649,-0.6487,-1.7951,-0.6387,-1.7266,-0.415,-0.2092,-0.4783,-0.3705,-0.1173,0.8044,0.1387,-0.117,0.0647,0.3251,-0.024,-0.0546,0.1703,-0.2836,0.348,0.5691,-0.0993,0.1639,-0.1485],[0.0956,0.491,0.671,0.3416,-0.1978,-0.1042,0.3275,-0.3004,-0.0423,0.0339,-0.7037,0.3598,0.5086,-0.1373,0.7853,0.3586,-1.1061,-1.7025,0.7777,0.0819,0.0905,-0.1593,-0.1773,0.0952,-0.1303,-0.1914],[-0.0293,-0.0396,0.0054,0.0139,0.2192,0.0887,-0.0145,-0.0009,0.0495,0.0032,0.0074,-0.0307,0.1255,0.0379,-0.0091,-0.0108,0.048,-0.0104,-0.0168,0.0104,-0.0021,0.0034,-0.0125,-0.0456,-0.0598,0],[0.0308,0.0652,-0.0236,-0.0296,-0.2137,-0.0889,0.0085,0.0164,-0.0302,0.0308,0.0057,-0.0483,-0.0831,-0.028,0.0022,-0.087,-0.0421,0.0386,0.0089,0.0034,0.0069,0.0087,0.0322,0.0212,0.1265,-0.0196],[0.2323,0.3346,0.6933,0.586,0.2477,-0.6047,-0.4359,-0.5622,0.0211,0.3572,-0.2359,0.5038,-1.3476,0.002,-0.2685,0.0105,0.0397,-0.4148,-0.1243,0.497,1.0587,0.5785,1.325,0.0939,0.1761,-0.0337],[-0.0328,-0.0835,0.0338,0.0196,0.2235,0.0894,-0.0081,-0.0361,0.0357,-0.0172,0.0086,0.0454,0.0846,0.0274,0.0064,0.107,0.0179,-0.0202,0.0007,-0.0056,-0.013,-0.0149,-0.0305,-0.0215,-0.1409,0.0215],[0.0633,-0.2811,-0.0206,-3.084,-0.6278,0.4438,-0.4254,-0.2761,-0.0916,-0.1503,0.233,-0.6521,-0.4773,-0.0733,-0.2293,-0.1405,0.0237,-0.1353,-0.1452,-0.3306,0.2495,-0.5777,0.9585,-0.0379,0.0541,-0.1731],[0.3653,0.5437,0.4139,0.0402,0.3523,-0.04,-0.0069,0.2202,0.6809,0.4532,0.2786,-0.682,-0.3319,-0.021,0.0215,1.1897,-0.4996,0.6413,0.4251,0.047,0.4581,-0.1925,-1.0218,-0.057,-0.0427,0.6887],[1.2131,-2.801,0.1095,-0.2381,0.0618,-0.1775,0.2049,-0.1951,-0.0744,-0.2278,-0.3543,-0.5083,0.4168,0.2248,-1.209,-0.0056,-0.3915,-0.0339,-0.0889,0.592,2.5274,0.7342,1.5265,0.0165,0.0031,-0.2531],[0.5276,-0.4241,-1.0161,0.0613,-0.059,-0.379,-1.3246,-0.0494,-0.2525,-0.7702,-0.4737,0.2905,0.1612,0.0811,0.3974,0.0658,-0.0708,0.9737,-0.2036,0.2096,-0.1459,0.1522,0.6246,-0.4523,-0.2592,-0.1469],[0.0392,0.037,-0.0068,-0.0014,-0.2085,-0.0711,-0.0009,-0.0176,-0.0155,0.0535,0.0169,-0.0243,-0.0619,-0.0234,0.003,-0.1714,-0.0681,0.0393,0.0315,-0.0133,-0.0038,-0.0083,0.0406,0.0319,0.0436,-0.0298]],"b1":[0.0242,-0.2394,-0.0161,0.0181,0.6376,-0.58,0.0957,-0.0293,0.0308,0.2359,-0.0328,0.06,0.3644,1.2116,0.5275,0.0392],"W2":[-0.0413,0.5691,1.1238,-0.0453,0.9146,1.0345,-0.6078,0.0261,-0.0373,-1.1383,0.0358,-1.3366,-0.6962,-1.7239,-0.9304,-0.0304],"b2":0.1683};
  // BLOCK_MODEL:end
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  // f: { chars, words, sentences, linkFrac, chain (ancestor path; only
  //      META_RX matters), ad, rel, side, nav (class/id token hits), chrome
  //      (nav/aside/header/footer ancestors), main (main/article ancestors),
  //      tag, wFrac (width / viewport), cx (horizontal centre / viewport),
  //      prevChars/nextChars (chars of the nearest sibling blocks, 0 if none),
  //      sibProse (share of sibling blocks that are >= 80 chars and < 50% links),
  //      promo/digitFrac/upperFrac/puncFrac/avgWordLen/price/dateish/endsColon
  //      (textFeatures of the first TEXT_WINDOW chars; or `text` to derive them) }
  // The trainer calls this function; this is the only definition.
  const FEATURE_NAMES = ['bias', 'logChars', 'linkFrac', 'sentDens', 'meta', 'ad', 'rel', 'side', 'nav', 'chrome', 'main', 'isP', 'isLi', 'isTd', 'wFrac', 'edge', 'nbrLong', 'sibProse', 'promo', 'digitFrac', 'upperFrac', 'puncFrac', 'avgWordLen', 'price', 'dateish', 'endsColon'];
  const featureVector = (f) => {
    const t = f.digitFrac === undefined ? textFeatures(f.text || '') : f;
    return [
      1, Math.log10(Math.max(1, f.chars)) / 3, f.linkFrac, Math.min(1, (f.sentences / Math.max(1, f.words)) * 10),
      (f.meta !== undefined ? f.meta : META_RX.test(f.chain || '')) ? 1 : 0,
      f.ad > 0 ? 1 : 0, f.rel > 0 ? 1 : 0, f.side > 0 ? 1 : 0, f.nav > 0 ? 1 : 0,
      f.chrome > 0 ? 1 : 0, f.main > 0 ? 1 : 0,
      f.tag === 'p' ? 1 : 0, f.tag === 'li' ? 1 : 0, (f.tag === 'td' || f.tag === 'th') ? 1 : 0,
      f.wFrac, Math.abs(f.cx - 0.5) * 2,
      Math.log10(1 + Math.max(f.prevChars || 0, f.nextChars || 0)) / 3, f.sibProse || 0,
      t.promo ? 1 : 0, t.digitFrac || 0, t.upperFrac || 0, t.puncFrac || 0, t.avgWordLen || 0,
      t.price ? 1 : 0, t.dateish ? 1 : 0, t.endsColon ? 1 : 0
    ];
  };
  const blockScore = (f) => {
    const x = featureVector(f);
    const M = BLOCK_MODEL;
    if (M.type === 'mlp') {
      let z2 = M.b2;
      for (let j = 0; j < M.H; j++) {
        let z = M.b1[j];
        const row = M.W1[j];
        for (let q = 0; q < x.length; q++) z += row[q] * x[q];
        z2 += M.W2[j] * Math.tanh(z);
      }
      return sigmoid(z2);
    }
    let z = 0;
    for (let i = 0; i < x.length; i++) z += x[i] * M.w[i];
    return sigmoid(z);
  };
  const isProseBlock = (f) => f.chars >= BLOCK_MODEL.minChars && blockScore(f) > BLOCK_MODEL.threshold;

  const api = { SCHEMES, hexToRgb, mix, rgbStr, parseCssColor, relLuminance, contrastRatio, isDarkSurface, ensureContrast, tokenizeWords, featureVector, FEATURE_NAMES, blockScore, isProseBlock, BLOCK_MODEL, META_RX, PROMO_RX, PROMO_WINDOW, TEXT_WINDOW, textFeatures, SENTENCE_END_RX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineCore = api;
})();
