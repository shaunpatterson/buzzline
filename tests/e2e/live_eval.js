// Measures the whole live pipeline (content root, classifier, reading runs,
// self-colour; what a user sees) against the System1 labels, and sweeps the
// two numbers that couple the classifier to the reading-run rule: the model
// threshold (BLOCK_MODEL.threshold in core.js) and NEAR_PROSE (reading.js).
// train.js picks a threshold for the classifier alone; this picks it for the
// pipeline. Pick on training sites, confirm once on the holdout.
//
//   node tests/e2e/live_eval.js --set train --sample 120 --thr 0.45,0.5,0.55 --near 0.12,0.2 --baseline /tmp/core.previous.js
//   node tests/e2e/live_eval.js --set holdout --thr 0.5 --near 0.2 --baseline /tmp/core.previous.js
//
// Configurations: every --thr x --near pair on the repo's sources ("keep"
// leaves a value as it is), plus, with --baseline, that core.js unchanged.
// Each configuration runs in a fresh browser (one session degrades after a few
// hundred loads). Pages are revisited live (tests/e2e/harness.js) and their
// blocks matched by text to the labelled crawl (data/raw/crawl_v4,
// data/raw/labels_v4.json). Scored on the extension's decision
// (BuzzlineReading.isReadingText, the collector's `reading`; it overcounts a
// little on vertical writing modes, which colourBlock skips later), not on painted
// ranges: painting is time-sliced and viewport-first, so it lags on long pages
// and would measure paint speed. The table is computed only over pages every
// configuration measured, so all rows see the same pages. Char-weighted
// precision / recall / F0.5; a block is reading text when its System1 label
// is >= 0.5 and it is not a heading.
'use strict';
const fs = require('fs');
const path = require('path');
const { startHarness, extensionSources } = require('./harness.js');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const SET = arg('set', 'train');
const SAMPLE = +arg('sample', 0);
const CONCURRENCY = +arg('concurrency', 6);
const VISIT_TIMEOUT_MS = 60000;
const list = (s) => s.split(',').map((v) => (v === 'keep' ? null : +v));
const THRS = list(arg('thr', 'keep')), NEARS = list(arg('near', 'keep'));
const BASELINE = arg('baseline', null);

const E2E = __dirname;
const holdout = new Set(JSON.parse(fs.readFileSync(path.join(E2E, 'data', 'holdout_sites.json'), 'utf8')));
const labels = JSON.parse(fs.readFileSync(path.join(E2E, 'data', 'raw', 'labels_v4.json'), 'utf8')).labels;
const hash = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };
let pages = JSON.parse(fs.readFileSync(path.join(E2E, 'sites_v4.json'), 'utf8')).filter((p) => (SET === 'holdout') === holdout.has(p.site));
if (SAMPLE) pages = pages.sort((a, b) => hash(a.id) - hash(b.id)).slice(0, SAMPLE);
const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 160);

// Extension sources with core.js swapped and/or the threshold and NEAR_PROSE
// replaced; a pattern that is not found is an error, not a silent no-op.
function variant({ core, thr, near }) {
  const src = extensionSources();
  const files = JSON.parse(fs.readFileSync(path.join(E2E, '..', '..', 'manifest.json'), 'utf8')).content_scripts[0].js;
  const swap = (s, rx, to, what) => { if (!rx.test(s)) throw new Error(`${what} not found in the extension sources`); return s.replace(rx, to); };
  src.scripts = src.scripts.map((s, i) => {
    if (files[i].endsWith('core.js')) {
      if (core) s = fs.readFileSync(core, 'utf8');
      if (thr !== null) s = swap(s, /("threshold":)[\d.]+/, `$1${thr}`, 'BLOCK_MODEL threshold');
    }
    if (files[i].endsWith('reading.js') && near !== null) s = swap(s, /const NEAR_PROSE = [\d.]+;/, `const NEAR_PROSE = ${near};`, 'NEAR_PROSE');
    return s;
  });
  return src;
}

// Visit every page under one configuration; -> Map(pageId -> { TP, FP, FN }).
async function measure(config, dumps) {
  const h = await startHarness();
  if (!h) throw new Error('Chrome not found (set CHROME_PATH)');
  const sources = variant(config);
  const tabs = await Promise.all(Array.from({ length: CONCURRENCY }, () => h.newTab()));
  const results = new Map(), errors = [];
  let next = 0, reported = null;
  const visitOnce = (tab, page) => Promise.race([(async () => {
    const p = await tab.visit(page.url, { enabled: true }, { sources });
    reported ??= await p.evaluate(`'thr ' + BuzzlineCore.BLOCK_MODEL.threshold`);   // what really runs
    return p.collect();
  })(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), VISIT_TIMEOUT_MS))]);
  const t0 = Date.now();
  console.log(`  ${config.name}: starting`);
  try {
  await Promise.all(tabs.map(async (_, slot) => {
    while (next < pages.length) {
      const page = pages[next++];
      let live = null;
      for (let attempt = 0; attempt < 2 && !live; attempt++) {
        try { live = await visitOnce(tabs[slot], page); } catch (e) {
          // A timed-out visit keeps running in its tab: replace the tab so the
          // next visit cannot race it. A page that redirected after load lost
          // its isolated world: one retry.
          if (attempt === 1) errors.push(`${page.id}: ${e.message.slice(0, 100)}`);
          tabs[slot].close();
          tabs[slot] = await h.newTab();
        }
      }
      if (!live) continue;
      const m = { TP: 0, FP: 0, FN: 0 };
      const byText = new Map(live.blocks.map((b) => [norm(b.text), b]));
      dumps.get(page.id).blocks.forEach((b, i) => {
        const y = labels[`${page.id}:${i}`], l = byText.get(norm(b.text));
        if (y === undefined || !l) return;
        const t = !/^h[1-6]$/.test(b.tag) && y >= 0.5, p = l.reading > 0.5, w = Math.min(b.chars, 1000);
        if (p && t) m.TP += w; else if (p && !t) m.FP += w; else if (!p && t) m.FN += w;
      });
      results.set(page.id, m);
      if (results.size % 20 === 0) console.log(`  ${config.name}: ${results.size}/${pages.length} pages, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }));
  } finally {
    console.log(`  ${config.name}: measured ${results.size}/${pages.length} pages in ${Math.round((Date.now() - t0) / 1000)} s [injected ${reported}]${errors.length ? `; errors e.g. ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await h.stop();
  }
  if (results.size < pages.length * 0.8) throw new Error(`only ${results.size}/${pages.length} pages measured for ${config.name}: stopping`);
  return results;
}

async function main() {
  const dumps = new Map(pages.map((p) => [p.id, JSON.parse(fs.readFileSync(path.join(E2E, 'data', 'raw', 'crawl_v4', encodeURIComponent(p.id) + '.json'), 'utf8'))]));
  const configs = [];
  if (BASELINE) configs.push({ name: `baseline ${path.basename(BASELINE)}`, core: BASELINE, thr: null, near: null });
  for (const thr of THRS) for (const near of NEARS) configs.push({ name: `thr ${thr ?? 'keep'} near ${near ?? 'keep'}`, core: null, thr, near });
  console.log(`${SET}: ${pages.length} pages, ${configs.length} configurations`);
  const all = [];
  for (const c of configs) all.push([c, await measure(c, dumps)]);
  const shared = pages.map((p) => p.id).filter((id) => all.every(([, r]) => r.has(id)));
  console.log(`scored on the ${shared.length} pages every configuration measured:`);
  for (const [c, r] of all) {
    const m = { TP: 0, FP: 0, FN: 0 };
    for (const id of shared) for (const k of ['TP', 'FP', 'FN']) m[k] += r.get(id)[k];
    const P = m.TP / Math.max(1, m.TP + m.FP), R = m.TP / Math.max(1, m.TP + m.FN), F = 1.25 * P * R / Math.max(1e-9, 0.25 * P + R);
    console.log(`  ${c.name.padEnd(28)} precision ${P.toFixed(3)} recall ${R.toFixed(3)} F0.5 ${F.toFixed(3)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
