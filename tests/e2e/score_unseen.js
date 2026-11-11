// Char-weighted precision/recall of the extension before/after the block-model
// gate on sites the model was NOT trained on (labels from the LLM judge).
//   node tests/e2e/score_unseen.js
'use strict';
const sites = require('./data/unseen.json');
const T = { before: { TP: 0, FP: 0, FN: 0 }, after: { TP: 0, FP: 0, FN: 0 } };
for (const rows of Object.values(sites)) {
  for (const r of rows) {
    const guts = r.role === 'body' && !/^h[1-6]$/.test(r.tag), w = Math.min(r.chars, 1000);
    for (const k of ['before', 'after']) {
      const col = r[k] > 0.5, key = guts ? (col ? 'TP' : 'FN') : (col ? 'FP' : null);
      if (key) T[k][key] += w;
    }
  }
}
for (const k of ['before', 'after']) console.log(k.padEnd(7), `precision ${(T[k].TP / (T[k].TP + T[k].FP)).toFixed(3)} recall ${(T[k].TP / (T[k].TP + T[k].FN)).toFixed(3)}`);
