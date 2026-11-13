// Labels every crawled block with System1: "should this block be highlighted
// (coloured) by the tool?", answered by TypeSafe's hosted Jev as a probability
// (a noul, 0..1). Reads data/raw/crawl_v4/*.json, writes
// data/raw/labels_v4.json ({ prompt, model, labels: { "<page>:<i>": noul } });
// resumable, one file write per page. A file written with a different prompt
// or model is never resumed: delete it to relabel.
//
//   TYPESAFE_API_KEY=... node tests/e2e/label.js [--concurrency 4]
//
// FOUNDRY_V3_TYPESAFE_BASE_URL / FOUNDRY_V3_TYPESAFE_MODEL override the API
// base (https://api.typesafe.ai) and model (jev-latest), as in modelhub.
'use strict';
const fs = require('fs');
const path = require('path');

const KEY = process.env.FOUNDRY_V3_TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY;
const BASE = (process.env.FOUNDRY_V3_TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/$/, '');
const MODEL = process.env.FOUNDRY_V3_TYPESAFE_MODEL || 'jev-latest';
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const CONCURRENCY = +arg('concurrency', 4);
const BATCH = 40;   // questions per request; each carries its blocks' text as state
const RAW = path.join(__dirname, 'data', 'raw');
const CRAWL = path.join(RAW, 'crawl_v4');
const OUT = path.join(RAW, 'labels_v4.json');

// The prompt. Checked against the fixture pages' data-expect verdicts before a
// run (block-level ones; isolated comments kept plain by the reading-run rule
// are prose to the classifier). Changing it invalidates existing labels: the
// labels file records PROMPT_ID and a resume with a different one is refused.
const TOOL = 'Buzzline, a browser extension that colours the main reading text of a page with a line-by-line gradient to guide the eye: the paragraphs of an article, blog post, documentation page or story, and substantial posts in a discussion. It should colour only blocks a person reads as continuous prose. It should NOT colour: headings, titles, labels, dates, locations, bylines, navigation, menus, buttons, prices, ads, promos, cookie or subscription notices, captions and metadata; search-result snippets; teaser or summary text in listings, feeds and cards; one- or two-line descriptions under a title such as job entries or product tiles; bullet-point fragments that are not full sentences.';
const QUESTION = (k) => `Should block ${k} be highlighted (coloured) by the tool?`;
const PROMPT_ID = require('crypto').createHash('sha256').update(TOOL + '\n' + QUESTION('{k}') + '\n' + MODEL).digest('hex').slice(0, 12);

async function decide(page, blocks, tool = TOOL) {
  const state = {
    tool,
    page: { title: page.title, url: page.finalUrl || page.url },
    note: 'Blocks are consecutive text blocks of the page, in reading order.',
    blocks: Object.fromEntries(blocks.map(([k, b]) => [k, b.text]))
  };
  const questions = Object.fromEntries(blocks.map(([k]) => [k, { type: 'noul', instructions: QUESTION(k) }]));
  for (let attempt = 0; ; attempt++) {
    let res, text;
    try {
      res = await fetch(BASE + '/v1/systemone', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
        body: JSON.stringify({ model: MODEL, state, questions }),
        signal: AbortSignal.timeout(90000)
      });
      text = await res.text();
    } catch (e) {
      if (attempt < 4) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
      throw e;
    }
    if (res.ok) {
      const data = JSON.parse(text);
      const nouls = blocks.map(([k]) => { const a = data.answers[k]; if (!a || typeof a.noul !== 'number') throw new Error(`no answer for ${k}`); return a.noul; });
      return { nouls, served: String(data.model || '') };
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function main() {
  if (!KEY) throw new Error('set TYPESAFE_API_KEY (or FOUNDRY_V3_TYPESAFE_API_KEY)');
  const file = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { prompt: PROMPT_ID, model: MODEL, labels: {} };
  if (file.prompt !== PROMPT_ID || file.model !== MODEL) {
    throw new Error(`${OUT} was labelled with prompt ${file.prompt || '(none)'} / model ${file.model || '(none)'}, not ${PROMPT_ID} / ${MODEL}; delete it to relabel`);
  }
  const labels = file.labels;
  const files = fs.readdirSync(CRAWL).filter((f) => f.endsWith('.json')).sort();
  // A dump the crawler is still writing does not parse yet: it is picked up by the next run.
  const readable = files.flatMap((f) => { try { return [JSON.parse(fs.readFileSync(path.join(CRAWL, f), 'utf8'))]; } catch { return []; } });
  const todo = readable.filter((p) => p.blocks.some((_, i) => labels[`${p.id}:${i}`] === undefined));
  let next = 0, pagesDone = 0, requests = 0;
  const failed = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const page = todo[next++];
      try {
        const keyed = page.blocks.map((b, i) => ['b' + String(i).padStart(3, '0'), b, i]);
        for (let s = 0; s < keyed.length; s += BATCH) {
          const part = keyed.slice(s, s + BATCH).filter(([, , i]) => labels[`${page.id}:${i}`] === undefined);
          if (!part.length) continue;
          const { nouls, served } = await decide(page, part);
          // jev-latest can move to a new model mid-run: never mix two models' labels.
          file.served ??= served;
          if (served !== file.served) throw Object.assign(new Error(`TypeSafe now serves ${served}, labels so far came from ${file.served}; delete ${OUT} to relabel`), { fatal: true });
          requests++;
          part.forEach(([, , i], j) => { labels[`${page.id}:${i}`] = +nouls[j].toFixed(4); });
        }
        fs.writeFileSync(OUT, JSON.stringify(file));
      } catch (e) {
        if (e.fatal) { next = todo.length; console.error('\n' + e.message); process.exitCode = 1; }
        failed.push(`${page.id}: ${e.message}`);
      }
      pagesDone++;
      process.stdout.write(`\r labelled ${pagesDone}/${todo.length} pages, ${requests} requests, ${failed.length} failed   `);
    }
  }));
  console.log(`\n${Object.keys(labels).length} blocks labelled; failed pages: ${failed.length}`);
  if (failed.length) console.log(failed.slice(0, 20).join('\n'));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { decide, TOOL, PROMPT_ID };
