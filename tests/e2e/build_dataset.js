// Builds the committed training data from the crawl and the System1 labels:
//   data/raw/crawl_v4/*.json + data/raw/labels_v4.json
//     -> data/blocks.json         per-block features, never text (columnar:
//                                 { columns, rows: { page: { index: [values] } } })
//        data/labels.json         "<page>:<i>" -> System1 "should be highlighted" (0..1)
//        data/holdout_sites.json  sites never trained on
//
//   node tests/e2e/build_dataset.js [--holdout 100]
//
// Pages of one site ("<site>~home", "<site>~article") share a site and are
// held out together. The previous holdout sites stay held out; new sites fill
// the rest, chosen by a fixed hash of the site name.
'use strict';
const fs = require('fs');
const path = require('path');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const HOLDOUT = +arg('holdout', 100);
const DATA = path.join(__dirname, 'data');
const CRAWL = path.join(DATA, 'raw', 'crawl_v4');
const COLUMNS = ['tag', 'chars', 'words', 'sentences', 'linkFrac', 'cx', 'wFrac', 'coloured', 'inRoot', 'prevChars', 'nextChars', 'sibProse', 'meta',
  'promo', 'digitFrac', 'upperFrac', 'puncFrac', 'avgWordLen', 'price', 'dateish', 'endsColon', 'ad', 'rel', 'side', 'nav', 'chrome', 'main'];
const siteOf = (page) => page.split('~')[0];
// FNV-1a: a stable, uniform pick that does not depend on crawl order.
const hash = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };

const labelsIn = JSON.parse(fs.readFileSync(path.join(DATA, 'raw', 'labels_v4.json'), 'utf8')).labels;
const rows = {}, labels = {}, pages = [];
let blocks = 0, unlabelled = 0;
for (const f of fs.readdirSync(CRAWL).filter((n) => n.endsWith('.json')).sort()) {
  const page = JSON.parse(fs.readFileSync(path.join(CRAWL, f), 'utf8'));
  pages.push({ id: page.id, site: page.site, kind: page.kind, url: page.url });
  page.blocks.forEach((b, i) => {
    const y = labelsIn[`${page.id}:${i}`];
    if (y === undefined) { unlabelled++; return; }
    (rows[page.id] ??= {})[i] = COLUMNS.map((c) => (typeof b[c] === 'number' ? +b[c].toFixed(4) : b[c]));
    labels[`${page.id}:${i}`] = y;
    blocks++;
  });
}

const sites = [...new Set(Object.keys(rows).map(siteOf))].sort();
const previous = fs.existsSync(path.join(DATA, 'holdout_sites.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'holdout_sites.json'), 'utf8')) : [];
const holdout = new Set(previous.filter((s) => sites.includes(s)));
for (const s of sites.filter((s) => !holdout.has(s)).sort((a, b) => hash(a) - hash(b) || a.localeCompare(b))) {
  if (holdout.size >= HOLDOUT) break;
  if (s.startsWith('t-')) holdout.add(s);
}

fs.writeFileSync(path.join(DATA, 'blocks.json'), JSON.stringify({ columns: COLUMNS, rows }));
fs.writeFileSync(path.join(DATA, 'labels.json'), JSON.stringify(labels));
fs.writeFileSync(path.join(DATA, 'holdout_sites.json'), JSON.stringify([...holdout].sort()));
// The page list (URLs only) is exactly the pages in the dataset.
fs.writeFileSync(path.join(__dirname, 'sites_v4.json'), JSON.stringify(pages.filter((p) => rows[p.id]), null, 1) + '\n');
console.log(`${blocks} labelled blocks (${unlabelled} unlabelled skipped) from ${Object.keys(rows).length} pages / ${sites.length} sites; holdout ${holdout.size} sites`);
