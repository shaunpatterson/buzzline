// The Buzzline PDF reader (src/pdf.html). pdf.js draws each page and lists its
// text; the text is grouped into lines and paragraphs by position. "Original"
// lays a gradient strip over each line of the drawn page; "Reader" reflows the
// paragraphs into a column that the content scripts colour like any web page.
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const VARIANTS = ['A', 'B'];
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const state = {
  variant: VARIANTS.includes(params.get('variant')) ? params.get('variant') : 'A',
  scheme: 'classic',   // the extension's setting, read below
  dark: params.has('dark') ? params.get('dark') === '1' : matchMedia('(prefers-color-scheme: dark)').matches,
  bodyOnly: params.get('all') !== '1',
  shades: params.get('shades') === '1',   // show the dark page shade picker (off unless asked for)
  size: +params.get('size') || 1,   // text size: Reader font size, Original page zoom
  file: params.get('file') || '',
  doc: null, pages: [], bodyH: 0, name: '', total: 0
};
const DRAW_AHEAD = '1500px 0px';   // pages are drawn as they come near the window and dropped when far
const pageWidth = () => Math.max(320, Math.min(900, innerWidth - 32));

const { SCHEMES } = globalThis.BuzzlineCore;
state.scheme = (await new Promise((done) => globalThis.BuzzlineSettings.load(done))).scheme;
// Join two lines of one paragraph: a word broken at the line end loses its
// hyphen ("transduc-" + "tion"); a hyphenated compound keeps it ("English-" + "to-German").
const join = (a, b) => (!a ? b : /[a-z]-$/.test(a) && /^[a-z]/.test(b) ? (/^[a-z]+-/.test(b) ? a + b : a.slice(0, -1) + b) : a + ' ' + b);

// ---- PDF -> lines -> blocks ----
function toLines(items) {
  const lines = []; let c = null;
  for (const it of items) {
    const brk = !c || Math.abs(it.y - c.y) > 0.5 * c.h || it.x < c.right - c.h || it.x - c.right > 3 * c.h;
    if (brk) { c = { y: it.y, h: it.h, left: it.x, right: it.x + it.w, text: it.str }; lines.push(c); }
    else { c.text += ((it.x - c.right > 0.15 * c.h || c.sp) && !/\s$/.test(c.text) ? ' ' : '') + it.str; c.right = Math.max(c.right, it.x + it.w); c.h = Math.max(c.h, it.h); }
    c.sp = !!it.spaceAfter;
  }
  return lines;
}
function toBlocks(lines) {
  const blocks = []; let b = null, prev = null;
  for (const l of lines) {
    const gap = prev ? (l.y - l.h) - prev.y : 0;
    const brk = !b || Math.abs(l.h - b.h) / b.h > 0.08 || gap > 0.6 * b.h || l.y < prev.y - 0.5 * b.h ||
      Math.abs(l.left - b.left) > 3 * b.h ||
      // A line indented from the one before starts a new paragraph. Measured against the previous
      // line, not the block's edge: a bullet's text is indented from its marker on every line.
      (b.lines.length >= 2 && l.left > prev.left + 0.7 * b.h);
    if (brk) { b = { lines: [], h: l.h, left: l.left, right: l.right }; blocks.push(b); }
    b.lines.push(l); b.left = Math.min(b.left, l.left); b.right = Math.max(b.right, l.right);
    prev = l;
  }
  for (const k of blocks) {
    k.text = k.lines.reduce((t, l) => join(t, l.text), '')
      .replace(/([\[(])\s+/g, '$1').replace(/\s+([\]),.;:])/g, '$1');   // "[ 27 ]" -> "[27]"
    k.chars = k.text.length;
  }
  return blocks;
}
// Body text is the document's most common text size, or a little smaller: an
// abstract is often set a size down, footnotes and captions two.
const kind = (b) => (b.title ? 'title' : b.h > state.bodyH * 0.87 && b.h < state.bodyH * 1.06 && b.lines.length >= 2 && b.chars >= 120 ? 'body'
  : b.h > state.bodyH * 1.15 && b.chars < 90 ? 'heading' : 'minor');

function busy(big, small = '', frac = 0) {
  $('empty').hidden = false; $('view').hidden = true;
  $('empty').querySelector('.spinner').hidden = false;
  $('emptyBig').textContent = big; $('emptySmall').textContent = small;
  $('progress').firstElementChild.style.width = (frac * 100) + '%';
}
function fail(message) {
  $('empty').hidden = false; $('view').hidden = true;
  $('empty').querySelector('.spinner').hidden = true;
  $('emptyBig').textContent = 'Could not open that PDF'; $('emptySmall').textContent = message;
  $('progress').firstElementChild.style.width = '0';
}

async function load(data, name) {
  busy('Opening PDF…', name);
  const doc = await pdfjs.getDocument({ data }).promise;
  if (state.doc) state.doc.destroy();
  state.doc = doc; state.pages = []; state.name = name; state.total = doc.numPages;
  const dpr = window.devicePixelRatio || 1, hist = new Map(), n = doc.numPages, W = pageWidth();
  for (let i = 1; i <= n; i++) {
    busy('Reading…', `page ${i} of ${n}`, (i - 1) / n);
    const page = await doc.getPage(i);
    const scale = W / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 0;   // empty until draw(): a new canvas is 300x150, which draw() would take for drawn
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    const items = [];
    for (const it of (await page.getTextContent()).items) {
      if (!it.str || !it.str.trim()) { if (items.length) items.at(-1).spaceAfter = true; continue; }
      const t = pdfjs.Util.transform(vp.transform, it.transform);
      if (Math.abs(t[1]) > Math.abs(t[0])) continue;   // rotated text (margin watermarks)
      items.push({ str: it.str, x: t[4], y: t[5], w: it.width * scale, h: Math.hypot(t[2], t[3]) });
    }
    const blocks = toBlocks(toLines(items));
    for (const b of blocks) { const k = Math.round(b.h * 2) / 2; hist.set(k, (hist.get(k) || 0) + b.chars); }
    state.pages.push({ page, scale: scale * dpr, canvas, w: vp.width, h: vp.height, blocks, want: false, busy: false });
  }
  state.bodyH = [...hist].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  // the document title: the largest short block on the first page
  const front = state.pages[0].blocks;
  const first = front.filter((b) => b.chars < 200 && b.chars > 3).sort((a, b) => b.h - a.h)[0];
  if (first && first.h > state.bodyH * 1.2) {
    // a title on several centred lines comes out as one block per line: join them
    for (let next; (next = front[front.indexOf(first) + 1]) && Math.abs(next.h - first.h) / first.h < 0.03 && first.chars + next.chars < 300;) {
      first.lines.push(...next.lines); first.text = join(first.text, next.text); first.chars = first.text.length;
      first.left = Math.min(first.left, next.left); first.right = Math.max(first.right, next.right);
      front.splice(front.indexOf(next), 1);
    }
    first.title = true; state.title = first.text;
  } else state.title = name;
  $('progress').firstElementChild.style.width = '100%';
  setTimeout(() => { $('progress').firstElementChild.style.width = '0'; }, 400);
  $('empty').hidden = true; $('view').hidden = false;
  render();
}

// A page's canvas is drawn while it is near the window and emptied when it is
// not, so a long PDF does not hold every page in memory.
async function draw(p) {
  p.want = true;
  if (p.busy || p.canvas.width > 1) return;
  p.busy = true;
  const vp = p.page.getViewport({ scale: p.scale });
  p.canvas.width = vp.width; p.canvas.height = vp.height;
  try { await p.page.render({ canvasContext: p.canvas.getContext('2d'), viewport: vp }).promise; } catch { p.canvas.width = p.canvas.height = 0; }
  p.busy = false;
  if (!p.want) release(p);
}
function release(p) { p.want = false; if (!p.busy) p.canvas.width = p.canvas.height = 0; }
let nearPages = null;

// ---- A: gradient strips over the canvas ----
function renderA(view) {
  const pal = SCHEMES[state.scheme][state.dark ? 'dark' : 'light'];
  let coloured = 0;
  const byEl = new Map();
  nearPages = new IntersectionObserver((entries) => { for (const e of entries) { const p = byEl.get(e.target); if (e.isIntersecting) draw(p); else release(p); } }, { rootMargin: DRAW_AHEAD });
  state.pages.forEach((p, pi) => {
    const sheet = document.createElement('section'); sheet.className = 'sheet'; sheet.dataset.w = p.w;
    const num = document.createElement('div'); num.className = 'num'; num.textContent = `Page ${pi + 1}`;
    const el = document.createElement('div'); el.className = 'page'; el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
    el.appendChild(p.canvas); byEl.set(el, p); nearPages.observe(el);
    for (const b of p.blocks) {
      if (state.bodyOnly && kind(b) !== 'body') continue;
      coloured++;
      b.lines.forEach((l, i) => {
        const s = document.createElement('div'); s.className = 'strip';
        const pitch = b.lines[i + 1] ? b.lines[i + 1].y - l.y : l.h * 1.25;
        Object.assign(s.style, { left: l.left + 'px', top: (l.y - l.h * 0.92) + 'px', width: (l.right - l.left) + 'px', height: Math.min(l.h * 1.25, Math.max(l.h, pitch)) + 'px',
          backgroundImage: `linear-gradient(to right, ${pal[i % pal.length]}, ${pal[(i + 1) % pal.length]})`,
          backgroundSize: `${b.right - b.left}px 100%`, backgroundPosition: `${b.left - l.left}px 0` });
        el.appendChild(s);
      });
    }
    sheet.append(num, el); view.appendChild(sheet);
  });
  fit();
  return coloured;
}
// Pages are drawn at the width the window had on load; when it changes, scale
// the drawn page and its strips together rather than redrawing.
function fit() {
  const target = pageWidth() * state.size;
  for (const sheet of document.querySelectorAll('.sheet')) {
    const f = target / +sheet.dataset.w;
    sheet.style.width = (+sheet.dataset.w * f) + 'px'; sheet.querySelector('.page').style.zoom = f;
  }
}
addEventListener('resize', fit);

// ---- B: reflowed text; the extension's own pipeline colours it ----
function paragraphs() {
  const out = [];
  const hasTitle = state.pages[0].blocks.some((b) => b.title);
  let started = !hasTitle;   // text above the title (notices, running heads) is not part of the reading text
  state.pages.forEach((p, pi) => {
    if (pi) out.push({ kind: 'pagebreak', text: `Page ${pi + 1}` });
    for (const b of p.blocks) {
      const k = kind(b), last = out.findLast((o) => o.kind !== 'pagebreak');
      if (k === 'title') started = true;
      if (!started) continue;
      // a paragraph cut by a column or page break continues
      if (k === 'body' && last && last.kind === 'body' && !/[.!?:”"]$/.test(last.text) && /^[a-z(]/.test(b.text)) { last.text = join(last.text, b.text); continue; }
      out.push({ kind: k, text: b.text });
    }
  });
  return out;
}
function renderB(view) {
  const col = document.createElement('article'); col.className = 'reflow';
  const TAG = { title: 'h1', heading: 'h2', pagebreak: 'div' };
  let n = 0;
  for (const p of paragraphs()) {
    if (p.kind === 'minor' && state.bodyOnly) continue;
    const el = document.createElement(TAG[p.kind] || 'p');
    if (p.kind === 'minor' || p.kind === 'pagebreak') el.className = p.kind;
    if (p.kind === 'body') n++;
    el.textContent = p.text; col.appendChild(el);
  }
  view.appendChild(col);
  return n;
}

function render() {
  document.body.classList.toggle('dark', state.dark);
  $('shades').hidden = !(state.dark && state.shades);
  applySize();
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-selected', b.dataset.v === state.variant);
  const swatch = (k) => { const c = SCHEMES[k][state.dark ? 'dark' : 'light']; return `linear-gradient(135deg, ${c[1]} 15%, ${c[3]} 85%)`; };
  for (const b of $('schemes').children) { b.setAttribute('aria-pressed', b.dataset.k === state.scheme); b.style.background = swatch(b.dataset.k); }
  $('schemeBtn').style.background = swatch(state.scheme); $('schemeBtn').title = `Colour scheme: ${SCHEMES[state.scheme].name}`;
  $('bodyOnly').setAttribute('aria-pressed', state.bodyOnly); $('theme').setAttribute('aria-pressed', state.dark);
  if (!state.pages.length) return;
  if (nearPages) { nearPages.disconnect(); nearPages = null; }
  if (state.variant !== 'A') state.pages.forEach(release);
  const view = $('view'); view.replaceChildren();
  const coloured = state.variant === 'A' ? renderA(view) : renderB(view);
  $('title').textContent = state.title; document.title = `${state.title} · Buzzline`;
  $('meta').textContent = `${state.total} ${state.total === 1 ? 'page' : 'pages'} · ${coloured} ${state.variant === 'A' ? 'passages' : 'paragraphs'} coloured · ${SCHEMES[state.scheme].name}`;
  syncUrl();
}
function syncUrl() {
  const q = new URLSearchParams({ variant: state.variant, dark: state.dark ? '1' : '0' });
  if (!state.bodyOnly) q.set('all', '1'); if (state.size !== 1) q.set('size', state.size); if (state.shades) q.set('shades', '1'); if (state.file) q.set('file', state.file);
  history.replaceState(null, '', '?' + q);
}

// ---- text size: the Reader's font size, the Original's page zoom ----
const SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8];
function applySize() {
  if (!SIZES.includes(state.size)) state.size = SIZES.reduce((a, b) => (Math.abs(b - state.size) < Math.abs(a - state.size) ? b : a));   // a hand-typed ?size=
  document.documentElement.style.setProperty('--size', state.size);
  const i = SIZES.indexOf(state.size), pct = Math.round(state.size * 100) + '%';
  $('smaller').disabled = i <= 0; $('larger').disabled = i >= SIZES.length - 1;
  $('smaller').title = `Smaller text (−) · now ${pct}`; $('larger').title = `Larger text (+) · now ${pct}`;
  fit();
}
function resize(d) {
  const i = SIZES.indexOf(state.size) + d;
  if (i < 0 || i >= SIZES.length) return;
  const at = scrollY / Math.max(1, document.documentElement.scrollHeight);   // keep the reading position
  state.size = SIZES[i];
  applySize(); syncUrl();
  scrollTo(0, at * document.documentElement.scrollHeight);
  dispatchEvent(new Event('resize'));   // lines rewrap: the extension recolours on resize
}

// ---- dark page shade: 24 candidates (4 tints x 6 depths) ----
{
  const TINTS = [[0, 0], [220, 16], [222, 34], [200, 22]];   // [hue, saturation %]: neutral, blue-grey, navy, teal-slate
  const DEPTHS = [6, 9, 12, 15, 18, 22];                     // lightness %
  const hex = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); };
  const pick = (c) => {
    if (c) { document.documentElement.style.setProperty('--shade', c); localStorage.setItem('bzln-pdf-shade', c); }
    $('shadeHex').textContent = c || '#0d0e12';
    for (const b of $('shades').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.c === c);
  };
  for (const [h, s] of TINTS) for (const l of DEPTHS) {
    const b = document.createElement('button'); b.dataset.c = hex(h, s, l); b.title = b.dataset.c; b.style.background = b.dataset.c; b.onclick = () => pick(b.dataset.c);
    $('shades').firstElementChild.appendChild(b);
  }
  pick(state.shades ? localStorage.getItem('bzln-pdf-shade') : null);   // without the flag, always the default
}

// ---- controls ----
for (const [k, s] of Object.entries(SCHEMES)) { const b = document.createElement('button'); b.dataset.k = k; b.title = s.name; b.onclick = () => { $('schemeWrap').classList.remove('open'); chrome.storage.sync.set({ scheme: k }); }; $('schemes').appendChild(b); }
// The scheme is the extension's setting: the popup changes it here too.
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes.scheme && SCHEMES[changes.scheme.newValue]) { state.scheme = changes.scheme.newValue; render(); } });
$('schemeBtn').onclick = () => $('schemeWrap').classList.toggle('open');
for (const b of document.querySelectorAll('.seg button')) b.onclick = () => { state.variant = b.dataset.v; render(); scrollTo(0, 0); };
$('theme').onclick = () => { state.dark = !state.dark; render(); };
$('smaller').onclick = () => resize(-1); $('larger').onclick = () => resize(1);
$('bodyOnly').onclick = () => { state.bodyOnly = !state.bodyOnly; render(); };
$('sprint').onclick = () => { const text = paragraphs().filter((p) => p.kind === 'body').map((p) => p.text).join(' '); if (text) window.__bzlnSprint(text); };
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.bzln-sprint-root') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = e.key === 'ArrowLeft' ? -1 : 1; state.variant = VARIANTS[(VARIANTS.indexOf(state.variant) + d + VARIANTS.length) % VARIANTS.length]; render(); }
  if (e.key === 'Escape') { $('openPanel').hidden = true; $('schemeWrap').classList.remove('open'); }
  if (e.key === '+' || e.key === '=') resize(1);
  if (e.key === '-' || e.key === '_') resize(-1);
});

const fromUrl = async (url) => {
  state.file = url; $('openPanel').hidden = true; busy('Opening PDF…', url);
  let r;
  try { r = await fetch(url, { credentials: 'include' }); }
  catch { throw new Error(url.startsWith('file:') ? 'To open files on this computer, turn on "Allow access to file URLs" for Buzzline in the browser\'s extension settings, or use Open… and choose the file.' : `Could not reach ${url}`); }
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  const data = await r.arrayBuffer();
  if (!new TextDecoder('latin1').decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('That address is not a PDF.');
  await load(data, decodeURIComponent(new URL(url).pathname.split('/').pop() || url));
};
const fromFile = async (f) => { state.file = ''; $('openPanel').hidden = true; await load(await f.arrayBuffer(), f.name); };
const open = (p) => p.catch((e) => fail(e.message));
$('openBtn').onclick = () => { $('openPanel').hidden = !$('openPanel').hidden; if (!$('openPanel').hidden) { $('url').value = state.file; $('url').select(); } };
$('load').onclick = () => { const u = $('url').value.trim(); if (u) open(fromUrl(u)); };
$('url').onkeydown = (e) => { if (e.key === 'Enter') $('load').click(); };
$('pick').onclick = () => $('file').click();
$('file').onchange = () => { const f = $('file').files[0]; if (f) open(fromFile(f)); };
addEventListener('pointerdown', (e) => { if (!e.target.closest('#openPanel, #openBtn')) $('openPanel').hidden = true; if (!e.target.closest('#schemeWrap')) $('schemeWrap').classList.remove('open'); });
let drags = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); drags++; document.body.classList.add('dragging'); });
addEventListener('dragleave', () => { if (--drags <= 0) { drags = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); drags = 0; document.body.classList.remove('dragging'); const f = e.dataTransfer.files[0]; if (f) open(fromFile(f)); });

render();
if (state.file) open(fromUrl(state.file));
else { fail(''); $('emptyBig').textContent = 'Open a PDF'; $('emptySmall').textContent = 'Paste an address, choose a file, or drop one here.'; $('openPanel').hidden = false; }
