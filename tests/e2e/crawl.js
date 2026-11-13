// Crawls the training pages with the current extension loaded and dumps every
// counting block (live features, text, coloured, inRoot) to
// data/raw/crawl_v4/<page>.json (gitignored: holds page text).
//
//   node tests/e2e/crawl.js                     # existing 250 pages + 250 new Tranco sites
//   node tests/e2e/crawl.js --new 0             # existing pages only
//   TRANCO=/tmp/top-1m.csv node tests/e2e/crawl.js --concurrency 6
//
// Pages: the 250 page URLs of the previous dataset (site names kept), then
// popular sites from the Tranco top list (https://tranco-list.eu, CSV
// "rank,domain") in rank order until --new sites succeed. A new site is its
// homepage plus one in-site article found on it ("<site>~home",
// "<site>~article"); a site counts once its homepage has at least
// MIN_BLOCKS blocks. Resumable: pages already dumped are skipped.
// build_dataset.js writes the page list (URLs only) to sites_v4.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { startHarness } = require('./harness.js');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const NEW_SITES = +arg('new', 250);
const CONCURRENCY = +arg('concurrency', 6);
const TRANCO = process.env.TRANCO || '/tmp/top-1m.csv';
const OUT = path.join(__dirname, 'data', 'raw', 'crawl_v4');
const MIN_BLOCKS = 5;
const PAGE_TIMEOUT_MS = 60000;

// Not websites a person reads: CDNs, ad/analytics/telemetry endpoints, DNS,
// certificate and device-cloud hosts. Adult sites are skipped too.
const INFRA = /(^|[.-])(cdn|edge|akamai|akadns|cloudfront|amazonaws|azureedge|azurefd|trafficmanager|googleapis|gstatic|googleusercontent|googlevideo|googlesyndication|googletagmanager|googleadservices|doubleclick|gvt\d|ggpht|ytimg|fbcdn|whatsapp\.net|tiktokcdn|ttvnw|ntp|dns|ocsp|crl|pki|digicert|sectigo|letsencrypt|analytics|telemetry|metrics|tracking|adsrvr|adnxs|criteo|rubiconproject|pubmatic|casalemedia|openx|taboola|outbrain|scorecardresearch|quantserve|demdex|omtrdc|rlcdn|bidswitch|smartadserver|mathtag|amazon-adsystem|appsflyer|app-measurement|branch|onelink|adjust|kochava|segment|mixpanel|sentry|newrelic|nr-data|hotjar|optimizely|fastly|edgecast|llnwd|jsdelivr|unpkg|cdnjs|bootstrapcdn|typekit|gravatar|windowsupdate|msftauth|msauth|microsoftonline|live\.net|office\.net|apple-dns|aaplimg|icloud-content|mzstatic|ezviz\d*|tuya|miui|hicloud|dbankcloud|heytap|xiaomi\.net|samsungcloud|ttdns|byteoversea|ibytedtos|sc-cdn|nflxvideo|nflximg|nflxext|nflxso|spotifycdn|scdn|rbxcdn|steamserver|steamcontent|playstation\.net|xboxlive|root-servers|gtld-servers|in-addr)([.-]|$)/i;
const ADULT = /(porn|xxx|sex|xvideos|xnxx|xhamster|redtube|youporn|onlyfans|chaturbate|stripchat|bongacams|livejasmin|cam4|camsoda|spankbang|eporner|hentai|rule34|brazzers|tube8|escort|fetish|nsfw|erotic|nude|milf)/i;

const brandOf = (host) => { const parts = host.replace(/^www\./, '').split('.'); return parts.length > 2 && parts.at(-2).length <= 3 ? parts.at(-3) : parts.at(-2); };

function existingPages() {
  const urls = {};
  for (const f of ['blocks_v2.json', 'blocks_v3.json']) {
    const p = path.join(__dirname, 'data', 'raw', f);
    if (fs.existsSync(p)) for (const [site, d] of Object.entries(JSON.parse(fs.readFileSync(p, 'utf8')))) urls[site] = d.url;
  }
  const sites = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'blocks.json'), 'utf8')).rows);
  return sites.filter((s) => urls[s]).map((site) => ({ id: site, site, kind: 'page', url: urls[site] }));
}

function* trancoSites(exclude) {
  const seen = new Set(exclude);
  for (const line of fs.readFileSync(TRANCO, 'utf8').split('\n')) {
    const domain = (line.split(',')[1] || '').trim().toLowerCase();
    if (!domain || INFRA.test(domain) || ADULT.test(domain)) continue;
    const brand = brandOf(domain);
    if (!brand || seen.has(brand)) continue;
    seen.add(brand);
    yield { site: 't-' + brand, domain };
  }
}

// In the page: the first same-site link that looks like an article (a headline
// of >= 30 chars pointing at a path with a slug or an id), skipping account,
// legal and help pages.
const PICK_ARTICLE = `(() => {
  const base = location.hostname.replace(/^www\\./, '').split('.').slice(-2).join('.');
  const skip = /(login|signin|sign-in|signup|register|account|privacy|terms|cookie|legal|about|contact|careers|jobs|help|support|faq|subscribe|newsletter|download|app|cart|checkout|search|tag|category|author|video)/i;
  for (const a of document.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.href); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.endsWith(base) || u.pathname.length < 8 || skip.test(u.pathname)) continue;
    const text = (a.textContent || '').replace(/\\s+/g, ' ').trim();
    const slug = u.pathname.split('/').filter(Boolean).pop() || '';
    if (text.length >= 30 && (slug.split('-').length >= 4 || /\\d{4,}/.test(u.pathname))) return u.href.split('#')[0];
  }
  return null;
})()`;

const dumpPath = (id) => path.join(OUT, encodeURIComponent(id) + '.json');
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms))]);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const h = await startHarness();
  if (!h) throw new Error('Chrome not found (set CHROME_PATH)');
  const tabs = await Promise.all(Array.from({ length: CONCURRENCY }, () => h.newTab()));
  const done = [], failed = [];

  // Visit one page in a tab and dump it; returns the collection or null.
  async function crawl(tab, page, extra) {
    if (fs.existsSync(dumpPath(page.id))) return JSON.parse(fs.readFileSync(dumpPath(page.id), 'utf8'));
    try {
      const run = async () => { const p = await tab.visit(page.url); const c = await p.collect(); const article = extra ? await p.evaluate(PICK_ARTICLE) : null; return { c, article }; };
      const { c, article } = await withTimeout(run(), PAGE_TIMEOUT_MS, page.url);
      const out = { ...page, finalUrl: c.url, title: c.title, vw: c.vw, docH: c.docH, blocks: c.blocks, article };
      // Write then rename: the labeller may read dumps while the crawl runs.
      if (c.blocks.length >= (extra ? MIN_BLOCKS : 1)) { fs.writeFileSync(dumpPath(page.id) + '.tmp', JSON.stringify(out)); fs.renameSync(dumpPath(page.id) + '.tmp', dumpPath(page.id)); }
      return out;
    } catch (e) {
      failed.push(`${page.id} ${e.message.slice(0, 120)}`);
      return null;
    }
  }

  // Phase 1: the existing pages, CONCURRENCY at a time.
  const queue = existingPages();
  let qi = 0;
  await Promise.all(tabs.map(async (tab) => {
    while (qi < queue.length) {
      const page = queue[qi++];
      const r = await crawl(tab, page, false);
      if (r) done.push({ id: page.id, site: page.site, kind: page.kind, url: page.url });
      process.stdout.write(`\r existing ${done.length + failed.length}/${queue.length} (failed ${failed.length})   `);
    }
  }));
  console.log();

  // Phase 2: new Tranco sites (homepage, then one article) until NEW_SITES succeed.
  const known = new Set(queue.map((p) => brandOf(new URL(p.url).hostname)));
  const candidates = trancoSites(known);
  let newOk = 0, tried = 0;
  await Promise.all(tabs.map(async (tab) => {
    while (newOk < NEW_SITES) {
      const next = candidates.next();
      if (next.done) break;
      tried++;
      const { site, domain } = next.value;
      const home = await crawl(tab, { id: site + '~home', site, kind: 'home', url: `https://${domain}/` }, true);
      if (!home || home.blocks.length < MIN_BLOCKS || newOk >= NEW_SITES) continue;
      newOk++;
      done.push({ id: site + '~home', site, kind: 'home', url: home.url });
      if (home.article) {
        const art = await crawl(tab, { id: site + '~article', site, kind: 'article', url: home.article }, false);
        if (art) done.push({ id: site + '~article', site, kind: 'article', url: home.article });
      }
      process.stdout.write(`\r new sites ${newOk}/${NEW_SITES} (tried ${tried}, failed pages ${failed.length})   `);
    }
  }));
  console.log();

  await h.stop();
  fs.writeFileSync(path.join(OUT, '_failed.txt'), failed.join('\n') + '\n');
  const pages = done.length, sites = new Set(done.map((d) => d.site)).size;
  console.log(`pages ${pages} from ${sites} sites (${newOk} new); failed page loads ${failed.length} (see data/raw/crawl_v4/_failed.txt)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
