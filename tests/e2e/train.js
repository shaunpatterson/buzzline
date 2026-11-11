// Fits the tiny block classifier in src/core.js (BLOCK_MODEL) from the labelled
// e2e dataset and prints leave-one-site-out precision/recall plus the weights.
//   node tests/e2e/train.js
'use strict';
const blocks = require('./data/blocks.json');
const labels = require('./data/labels.json');

const META = /(cite|citation|reference|caption|metadata|byline|dateline|author|footer|credit|timestamp|breadcrumb|toc|disclaimer|copyright|modified|meta)/i;
const NAMES = ['bias', 'logChars', 'linkFrac', 'sentDens', 'endsPunct', 'meta', 'ad', 'rel', 'side', 'nav', 'chrome', 'main', 'isP', 'isLi', 'isTd', 'wFrac', 'edge'];
const feat = (b) => [
  1, Math.log10(b.chars) / 3, b.linkFrac, Math.min(1, (b.sentences / Math.max(1, b.words)) * 10),
  b.endsPunct ? 1 : 0, META.test(b.chain) ? 1 : 0,
  b.f_ad > 0 ? 1 : 0, b.f_rel > 0 ? 1 : 0, b.f_side > 0 ? 1 : 0, b.f_nav > 0 ? 1 : 0,
  (b.l_nav + b.l_aside + b.l_header + b.l_footer) > 0 ? 1 : 0, (b.l_main + b.l_article) > 0 ? 1 : 0,
  b.tag === 'p' ? 1 : 0, b.tag === 'li' ? 1 : 0, (b.tag === 'td' || b.tag === 'th') ? 1 : 0,
  b.wFrac, Math.abs(b.cx - 0.5) * 2,
];
const rows = Object.entries(labels).map(([k, role]) => {
  const [site, i] = k.split(':'); const b = blocks[site].blocks[+i];
  return { site, x: feat(b), y: role === 'body' && !/^h[1-6]$/.test(b.tag) ? 1 : 0, w: Math.min(b.chars, 1000), col: b.coloured > 0.5 };
});
const sig = (z) => 1 / (1 + Math.exp(-z));
function fit(train, iters = 4000, lr = 0.5, l2 = 0.002) {
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
const THRESHOLD = 0.4;
const c = { base: { TP: 0, FP: 0, FN: 0 }, gate: { TP: 0, FP: 0, FN: 0 } };
for (const site of new Set(rows.map((r) => r.site))) {
  const w = fit(rows.filter((r) => r.site !== site));
  for (const r of rows.filter((r) => r.site === site)) {
    for (const [k, pos] of [['base', r.col], ['gate', r.col && predict(w, r.x) > THRESHOLD]]) {
      const key = pos && r.y ? 'TP' : pos && !r.y ? 'FP' : !pos && r.y ? 'FN' : null;
      if (key) c[k][key] += r.w;
    }
  }
}
const pr = (x) => `precision ${(x.TP / (x.TP + x.FP)).toFixed(3)} recall ${(x.TP / (x.TP + x.FN)).toFixed(3)}`;
console.log('leave-one-site-out (char-weighted)');
console.log('  extension before gate:', pr(c.base));
console.log('  with model gate      :', pr(c.gate));
console.log('weights:', JSON.stringify(fit(rows).map((v) => Math.round(v * 1000) / 1000)));
