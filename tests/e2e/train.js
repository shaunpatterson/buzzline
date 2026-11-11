// Fits the block classifier in src/core.js from the labelled e2e dataset.
//   node tests/e2e/train.js            # compare logistic vs MLP, report, write data/model.json
//   node tests/e2e/train.js --quick    # logistic only
//
// data/blocks.json        per-block features (no page text, no DOM paths); columnar:
//                         { columns: [...], rows: { site: { index: [values] } } }
// data/labels.json        "site:i" -> body | related | chrome | ad   (LLM-judged; contested
//                         ~15% re-judged by a stronger model with neighbouring blocks)
// data/holdout_sites.json sites never used for fitting; reported separately
// data/model.json         what core.js embeds (written by this script)
'use strict';
const fs = require('fs');
const path = require('path');
const D = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
const blocksFile = D('blocks.json');
const labels = D('labels.json');
const holdout = new Set(D('holdout_sites.json'));
const quick = process.argv.includes('--quick');

const get = (site, i) => { const cols = blocksFile.columns; const v = blocksFile.rows[site][i]; const o = {}; cols.forEach((c, k) => { o[c] = v[k]; }); return o; };

// Feature vector. MUST match blockScore() in src/core.js.
const NAMES = ['bias', 'logChars', 'linkFrac', 'sentDens', 'meta', 'ad', 'rel', 'side', 'nav', 'chrome', 'main', 'isP', 'isLi', 'isTd', 'wFrac', 'edge', 'nbrLong', 'sibProse', 'promo', 'digitFrac', 'upperFrac', 'puncFrac', 'avgWordLen', 'price', 'dateish', 'endsColon'];
const feat = (b) => [
  1, Math.log10(b.chars) / 3, b.linkFrac, Math.min(1, (b.sentences / Math.max(1, b.words)) * 10), b.meta ? 1 : 0,
  b.f_ad > 0 ? 1 : 0, b.f_rel > 0 ? 1 : 0, b.f_side > 0 ? 1 : 0, b.f_nav > 0 ? 1 : 0,
  (b.l_nav + b.l_aside + b.l_header + b.l_footer) > 0 ? 1 : 0, (b.l_main + b.l_article) > 0 ? 1 : 0,
  b.tag === 'p' ? 1 : 0, b.tag === 'li' ? 1 : 0, (b.tag === 'td' || b.tag === 'th') ? 1 : 0,
  b.wFrac, Math.abs(b.cx - 0.5) * 2, Math.log10(1 + Math.max(b.prevChars, b.nextChars)) / 3, b.sibProse, b.promo ? 1 : 0,
  b.digitFrac, b.upperFrac, b.puncFrac, b.avgWordLen, b.price ? 1 : 0, b.dateish ? 1 : 0, b.endsColon ? 1 : 0,
];
const rows = Object.entries(labels).map(([k, role]) => {
  const [site, i] = k.split(':'); const b = get(site, i);
  return { site, b, x: feat(b), y: role === 'body' && !/^h[1-6]$/.test(b.tag) ? 1 : 0, w: Math.min(b.chars, 1000), col: b.coloured > 0.5 };
});
const sig = (z) => 1 / (1 + Math.exp(-z));

// ---------- logistic ----------
function fitLogistic(train, iters = 3000, lr = 0.5, l2 = 0.002) {
  const d = NAMES.length, w = new Array(d).fill(0), W = train.reduce((s, r) => s + Math.sqrt(r.w), 0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    for (const r of train) { let z = 0; for (let j = 0; j < d; j++) z += w[j] * r.x[j]; const e = (sig(z) - r.y) * Math.sqrt(r.w) / W; for (let j = 0; j < d; j++) g[j] += e * r.x[j]; }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] + (j ? l2 * w[j] : 0));
  }
  return { type: 'logistic', w, predict: (x) => sig(x.reduce((s, v, j) => s + v * w[j], 0)) };
}

// ---------- MLP: d -> H (tanh) -> 1 (sigmoid), Adam, sqrt(char)-weighted log loss ----------
function fitMlp(train, H = 16, epochs = 80, lr = 0.01, l2 = 1e-4, seed = 7) {
  const d = NAMES.length; let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const W1 = Array.from({ length: H }, () => Array.from({ length: d }, () => rnd() * 0.5)); const b1 = new Array(H).fill(0);
  const W2 = Array.from({ length: H }, () => rnd() * 0.5); let b2 = 0;
  const mW1 = W1.map((r) => r.map(() => 0)), vW1 = W1.map((r) => r.map(() => 0)), mb1 = new Array(H).fill(0), vb1 = new Array(H).fill(0), mW2 = new Array(H).fill(0), vW2 = new Array(H).fill(0); let mb2 = 0, vb2 = 0;
  const Wsum = train.reduce((a, r) => a + Math.sqrt(r.w), 0) / train.length;
  const B = 64; let t = 0; const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  const idx = train.map((_, i) => i);
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor((rnd() + 0.5) * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let bi = 0; bi < idx.length; bi += B) {
      const gW1 = W1.map((r) => r.map(() => 0)), gb1 = new Array(H).fill(0), gW2 = new Array(H).fill(0); let gb2 = 0;
      const batch = idx.slice(bi, bi + B);
      for (const k of batch) {
        const r = train[k]; const h = new Array(H);
        for (let j = 0; j < H; j++) { let z = b1[j]; for (let q = 0; q < d; q++) z += W1[j][q] * r.x[q]; h[j] = Math.tanh(z); }
        let z2 = b2; for (let j = 0; j < H; j++) z2 += W2[j] * h[j];
        const e = (sig(z2) - r.y) * Math.sqrt(r.w) / Wsum / batch.length;
        gb2 += e; for (let j = 0; j < H; j++) { gW2[j] += e * h[j]; const dh = e * W2[j] * (1 - h[j] * h[j]); gb1[j] += dh; for (let q = 0; q < d; q++) gW1[j][q] += dh * r.x[q]; }
      }
      t++; const c1 = 1 - Math.pow(beta1, t), c2 = 1 - Math.pow(beta2, t);
      const step = (p, g, m, v) => { const gg = g + l2 * p; m = beta1 * m + (1 - beta1) * gg; v = beta2 * v + (1 - beta2) * gg * gg; return [p - lr * (m / c1) / (Math.sqrt(v / c2) + eps), m, v]; };
      for (let j = 0; j < H; j++) { for (let q = 0; q < d; q++) [W1[j][q], mW1[j][q], vW1[j][q]] = step(W1[j][q], gW1[j][q], mW1[j][q], vW1[j][q]); [b1[j], mb1[j], vb1[j]] = step(b1[j], gb1[j], mb1[j], vb1[j]); [W2[j], mW2[j], vW2[j]] = step(W2[j], gW2[j], mW2[j], vW2[j]); }
      [b2, mb2, vb2] = step(b2, gb2, mb2, vb2);
    }
  }
  const predict = (x) => { let z2 = b2; for (let j = 0; j < H; j++) { let z = b1[j]; for (let q = 0; q < d; q++) z += W1[j][q] * x[q]; z2 += W2[j] * Math.tanh(z); } return sig(z2); };
  return { type: 'mlp', H, W1, b1, W2, b2, predict };
}

// ---------- evaluation ----------
const THRESHOLD = 0.4, FLOOR = 50;
const score = (rs, sel) => { let TP = 0, FP = 0, FN = 0; for (const r of rs) { const p = sel(r); if (p && r.y) TP += r.w; else if (p && !r.y) FP += r.w; else if (!p && r.y) FN += r.w; } return { p: TP / Math.max(1, TP + FP), r: TP / Math.max(1, TP + FN) }; };
const fmt = (m) => `precision ${m.p.toFixed(3)} recall ${m.r.toFixed(3)}`;
const train = rows.filter((r) => !holdout.has(r.site)), test = rows.filter((r) => holdout.has(r.site));
const sites = [...new Set(train.map((r) => r.site))].sort();
const fold = new Map(sites.map((s, i) => [s, i % 5]));
function crossVal(fitter) {
  const pred = new Map();
  for (let f = 0; f < 5; f++) { const m = fitter(train.filter((r) => fold.get(r.site) !== f)); for (const r of train) if (fold.get(r.site) === f) pred.set(r, m.predict(r.x)); }
  return pred;
}
console.log(`train: ${sites.length} sites / ${train.length} blocks; holdout: ${holdout.size} sites / ${test.length} blocks (char-weighted, thr ${THRESHOLD}, floor ${FLOOR})`);
console.log('baseline (root pick only)   cv:', fmt(score(train, (r) => r.col)), ' holdout:', fmt(score(test, (r) => r.col)));
const models = { logistic: fitLogistic };
const H = +(process.env.H || 16);
if (!quick) models.mlp = (tr) => fitMlp(tr, H);
const results = {};
for (const [name, fitter] of Object.entries(models)) {
  const cv = crossVal(fitter); const full = fitter(train);
  const mcv = score(train, (r) => r.col && r.b.chars >= FLOOR && cv.get(r) > THRESHOLD);
  const mho = score(test, (r) => r.col && r.b.chars >= FLOOR && full.predict(r.x) > THRESHOLD);
  // per-site precision on holdout (sites with body text)
  const per = {}; for (const r of test) { const c = per[r.site] ??= { TP: 0, FP: 0, FN: 0, guts: 0 }; const p = r.col && r.b.chars >= FLOOR && full.predict(r.x) > THRESHOLD; if (r.y) c.guts += r.w; if (p && r.y) c.TP += r.w; else if (p && !r.y) c.FP += r.w; else if (!p && r.y) c.FN += r.w; }
  const under = Object.entries(per).filter(([, c]) => c.guts > 0 && c.TP + c.FP > 0 && c.TP / (c.TP + c.FP) < 0.9).map(([s, c]) => `${s} ${(c.TP / Math.max(1, c.TP + c.FP)).toFixed(2)}`);
  const fpNoGuts = Object.entries(per).filter(([, c]) => c.guts === 0 && c.FP > 0).map(([s, c]) => `${s} ${c.FP}c`);
  console.log(`${name.padEnd(9)} 5-fold cv: ${fmt(mcv)} | holdout: ${fmt(mho)} | holdout sites <0.90: ${under.length} [${under.join(', ')}] | coloured on no-prose pages: [${fpNoGuts.join(', ')}]`);
  results[name] = { model: full, cv, mcv, mho, underCount: under.length };
}
// Threshold sweep on the cross-validated predictions; pick model + threshold by
// F0.5 (precision counts twice as much as recall: wrong colouring is what users
// notice), evaluated on CV, then confirmed on the holdout.
const fbeta = (m, b = 0.5) => (1 + b * b) * m.p * m.r / Math.max(1e-9, b * b * m.p + m.r);
let best = null;
for (const [name, res] of Object.entries(results)) {
  for (const thr of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]) {
    const mcv = score(train, (r) => r.col && r.b.chars >= FLOOR && res.cv.get(r) > thr);
    const mho = score(test, (r) => r.col && r.b.chars >= FLOOR && res.model.predict(r.x) > thr);
    console.log(`  ${name.padEnd(9)} thr ${thr.toFixed(2)}  cv ${fmt(mcv)} F0.5 ${fbeta(mcv).toFixed(3)} | holdout ${fmt(mho)} F0.5 ${fbeta(mho).toFixed(3)}`);
    if (!best || fbeta(mcv) > best.f) best = { name, thr, f: fbeta(mcv) };
  }
}
const pick = best.name, THR = best.thr;
const m = results[pick].model;
console.log(`best by CV F0.5: ${pick} @ ${THR}`);
const out = pick === 'mlp' ? { type: 'mlp', names: NAMES, threshold: THR, minChars: FLOOR, H: m.H, W1: m.W1.map((r) => r.map((v) => +v.toFixed(4))), b1: m.b1.map((v) => +v.toFixed(4)), W2: m.W2.map((v) => +v.toFixed(4)), b2: +m.b2.toFixed(4) }
  : { type: 'logistic', names: NAMES, threshold: THR, minChars: FLOOR, w: m.w.map((v) => +v.toFixed(4)) };
if (!process.env.NO_WRITE) fs.writeFileSync(path.join(__dirname, 'data', 'model.json'), JSON.stringify(out));
console.log(`chosen: ${pick} -> data/model.json`);
