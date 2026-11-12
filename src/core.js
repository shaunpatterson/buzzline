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
  const BLOCK_MODEL = {"type":"mlp","names":["bias","logChars","linkFrac","sentDens","meta","ad","rel","side","nav","chrome","main","isP","isLi","isTd","wFrac","edge","nbrLong","sibProse","promo","digitFrac","upperFrac","puncFrac","avgWordLen","price","dateish","endsColon"],"threshold":0.45,"minChars":50,"H":16,"W1":[[0.0237,0.0019,0.0209,-0.139,0.0795,0.0407,-0.0059,0.0606,0.0087,0.0159,0.0414,-0.0015,0.0383,-0.0012,0.0379,-0.0241,-0.0874,-0.0096,-0.0199,-0.0036,-0.0007,0.0022,0.0083,-0.0121,0.0576,0.0137],[-0.6872,2.0206,-0.4141,-0.277,0.6904,-1.1439,-0.5616,-0.0161,0.0899,-1.2265,0.2992,-0.1738,-1.3173,-0.1433,0.0726,1.1652,0.2298,0.5585,-0.1051,0.0016,-1.4715,1.0795,-3.7351,0.5243,0.023,0.123],[0.1576,0.0138,0.1847,0.7854,1.2612,-0.7817,0.0813,-0.9639,-1.1443,-0.1268,-1.9767,0.9155,0.5175,-0.7141,-0.875,0.868,-0.3877,-0.6026,-0.3979,1.0009,1.3025,0.2935,0.9869,-0.6526,0.5436,-0.3351],[0.1257,-1.2989,0.8635,-3.1657,0.3618,0.9546,-0.1195,-0.5373,-0.3484,0.488,0.3228,-0.7715,-0.7503,-0.0042,0.9109,0.2643,0.4657,0.3685,-0.0975,0.3963,0.7524,-0.6278,-1.577,0.2535,0.1846,-0.2428],[-0.0802,0.0102,-1.4057,-0.1602,0.5324,-0.4701,0.6551,-0.4637,-0.546,-1.1033,-0.7466,1.5327,-0.9526,-0.1191,-0.5737,2.7695,-1.5896,0.776,-0.2938,-0.6767,-1.7883,0.6001,1.274,0.1662,-0.746,0.8067],[0.284,1.4323,1.9657,-0.3806,-1.5443,-1.1537,-1.4171,0.5719,-0.2804,-0.5231,-1.6877,-0.0015,-0.5942,-0.2131,0.539,-1.394,-0.3615,-0.3933,-1.1114,0.3194,-1.3728,0.6453,0.2577,0.0534,1.3177,-0.0299],[0.3967,-1.1368,0.2311,-0.0127,0.7807,-0.158,-0.064,-0.323,0.3231,0.2616,0.0807,0.066,0.4471,0.1782,-0.1342,-0.0282,0.8354,-0.2721,0.2456,0.0673,-0.743,-0.3037,2.6529,-0.0333,0.2361,0.0549],[0.1392,-0.9071,-0.9919,0.7027,-0.9714,-0.0935,-1.6954,1.2617,0.8765,-1.5773,2.4015,0.6562,1.5174,0.8077,-0.1755,1.4285,-0.2519,0.0504,-0.5479,-0.5579,1.2114,0.5407,-0.1531,-0.8188,0.3605,0.4055],[0.5346,-1.186,-0.0985,-1.2837,0.2299,1.4028,0.6037,0.847,-0.8822,-0.3738,0.8578,-0.1248,-1.3142,0.4611,-1.5174,0.9305,-1.7144,-0.0911,0.5175,-0.1339,0.5858,-0.5046,1.3118,0.2647,-0.5524,0.0914],[-0.3806,0.6901,2.2399,-0.1713,1.0166,-1.0933,-0.3549,-0.4837,0.6419,-0.3238,0.0592,0.5877,-1.4765,0.0758,0.2879,-0.1901,0.9222,0.2523,-0.219,1.7258,0.5522,1.2717,1.9163,0.6301,1.0063,0.2292],[-0.042,-0.9627,0.5,-0.2434,0.5237,0.3581,0.3693,0.4558,0.4932,-0.2757,0.3498,-1.1369,0.521,0.2472,-0.1557,1.3592,0.5775,-0.4008,-1.0614,1.0422,3.1702,0.5017,-0.3825,0.7259,-0.4023,-0.1864],[-0.2732,-1.3413,0.8377,-0.3576,0.3106,0.7548,0.1554,0.0329,0.5859,0.2456,-0.6449,-0.2249,-0.6843,0.0564,2.0422,-0.5809,0.0982,-0.548,0.0804,0.2387,0.0147,-0.2949,-0.3948,0.0847,0.2524,-0.3871],[0.9058,-1.0259,-0.2487,1.1128,0.4386,-0.1138,0.3828,0.466,-0.6202,-0.2512,-1.2179,-1.3205,-1.3824,0.5415,-1.7081,1.9252,-1.4059,0.8498,0.3143,-0.0651,0.5941,-0.6093,0.8628,-0.245,0.2791,0.5137],[1.1013,0.1393,-0.0858,0.8316,1.176,-2.3586,-0.83,-0.7989,1.4826,1.2308,0.3046,-0.3645,-0.6753,-0.6955,-0.1029,0.9144,-1.9056,-0.7258,0.9789,0.0326,0.9869,-0.2518,-0.0489,-0.3911,0.2254,-0.1883],[0.0104,-0.355,1.4254,0.7031,-0.8178,0.1902,-0.0128,0.4695,-0.0309,-0.1028,-0.4306,1.2448,-0.826,0.1591,0.3752,-0.8118,0.7535,1.481,-0.3296,0.782,2.3815,0.3157,-0.6468,0.6161,0.339,0.1168],[-0.3596,0.1327,-0.4538,1.4101,-0.0997,0.7898,1.0581,1.2563,0.794,0.0694,-1.3691,-1.167,0.4371,-0.1736,2.4902,-0.8582,0.7604,0.1629,-0.5274,-0.121,-1.401,0.3403,0.3532,-0.983,0.1656,0.4007]],"b1":[0.0237,-0.5818,0.2224,0.0294,-0.1845,0.1641,0.4137,0.1353,0.5308,-0.2683,-0.0218,-0.2984,0.7551,1.0948,-0.0545,-0.2743],"W2":[0.007,2.7818,-1.8637,-2.6665,2.5322,1.7714,-1.4661,2.5658,-1.8399,-2.4845,-1.8372,-1.1726,-2.0476,-2.6087,-1.7022,1.7929],"b2":-0.3409};
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
