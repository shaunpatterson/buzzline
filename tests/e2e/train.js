// Fits the tiny block classifier in src/core.js (BLOCK_MODEL) from the labelled
// e2e dataset and prints leave-one-site-out and held-out precision/recall plus
// the weights.   node tests/e2e/train.js
//
// data/blocks.json  per-block features (no page text, no DOM paths), keyed site -> index -> block
// data/labels.json  "site:i" -> body | related | chrome | ad   (LLM-judged; the
//                   contested ~15% were re-judged by a stronger model with the
//                   neighbouring blocks as context)
// data/holdout_sites.json  sites never used for fitting; reported separately
'use strict';
const blocks = require('./data/blocks.json');
const labels = require('./data/labels.json');
const holdout = new Set(require('./data/holdout_sites.json'));

const NAMES = ['bias', 'logChars', 'linkFrac', 'sentDens', 'endsPunct', 'meta', 'ad', 'rel', 'side', 'nav', 'chrome', 'main', 'isP', 'isLi', 'isTd', 'wFrac', 'edge', 'nbrLong', 'sibProse', 'promo'];
// Must stay identical to blockScore() in src/core.js.
const feat = (b) => [
  1, Math.log10(b.chars) / 3, b.linkFrac, Math.min(1, (b.sentences / Math.max(1, b.words)) * 10),
  b.endsPunct ? 1 : 0, b.meta ? 1 : 0,
  b.f_ad > 0 ? 1 : 0, b.f_rel > 0 ? 1 : 0, b.f_side > 0 ? 1 : 0, b.f_nav > 0 ? 1 : 0,
  (b.l_nav + b.l_aside + b.l_header + b.l_footer) > 0 ? 1 : 0, (b.l_main + b.l_article) > 0 ? 1 : 0,
  b.tag === 'p' ? 1 : 0, b.tag === 'li' ? 1 : 0, (b.tag === 'td' || b.tag === 'th') ? 1 : 0,
  b.wFrac, Math.abs(b.cx - 0.5) * 2,
  Math.log10(1 + Math.max(b.prevChars, b.nextChars)) / 3, b.sibProse, b.promo ? 1 : 0,
];
const rows = Object.entries(labels).map(([k, role]) => {
  const [site, i] = k.split(':'); const b = blocks[site][i];
  return { site, b, x: feat(b), y: role === 'body' && !/^h[1-6]$/.test(b.tag) ? 1 : 0, w: Math.min(b.chars, 1000), col: b.coloured > 0.5 };
});
const sig = (z) => 1 / (1 + Math.exp(-z));
function fit(train, iters = 3000, lr = 0.5, l2 = 0.002) {
  const d = NAMES.length, w = new Array(d).fill(0), W = train.reduce((s, r) => s + Math.sqrt(r.w), 0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    for (const r of train) {
      let z = 0; for (let j = 0; j < d; j++) z += w[j] * r.x[j];
      const e = (sig(z) - r.y) * Math.sqrt(r.w) / W;
      for (let j = 0; j < d; j++) g[j] += e * r.x[j];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] + (j ? l2 * w[j] : 0));
  }
  return w;
}
const predict = (w, x) => sig(x.reduce((s, v, j) => s + v * w[j], 0));
const THRESHOLD = 0.4, FLOOR = 50;
const score = (rs, sel) => { let TP = 0, FP = 0, FN = 0; for (const r of rs) { const p = sel(r); if (p && r.y) TP += r.w; else if (p && !r.y) FP += r.w; else if (!p && r.y) FN += r.w; } return `precision ${(TP / (TP + FP)).toFixed(3)} recall ${(TP / (TP + FN)).toFixed(3)}`; };
const train = rows.filter((r) => !holdout.has(r.site)), test = rows.filter((r) => holdout.has(r.site));
const oof = new Map();
for (const s of new Set(train.map((r) => r.site))) { const w = fit(train.filter((r) => r.site !== s)); for (const r of train.filter((r) => r.site === s)) oof.set(r, predict(w, r.x)); }
console.log(`train: ${new Set(train.map((r) => r.site)).size} sites / ${train.length} blocks; holdout: ${holdout.size} sites / ${test.length} blocks (char-weighted)`);
console.log('leave-one-site-out  baseline:', score(train, (r) => r.col));
console.log('leave-one-site-out  gate    :', score(train, (r) => r.col && r.b.chars >= FLOOR && oof.get(r) > THRESHOLD));
const w = fit(train);
console.log('holdout sites       baseline:', score(test, (r) => r.col));
console.log('holdout sites       gate    :', score(test, (r) => r.col && r.b.chars >= FLOOR && predict(w, r.x) > THRESHOLD));
console.log('weights:', JSON.stringify(w.map((v) => Math.round(v * 1000) / 1000)));
