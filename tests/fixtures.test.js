'use strict';
// Content-script behaviour on the fixture pages in tests/e2e/fixtures, driven
// through headless Chrome by tests/e2e/harness.js. Skipped when no Chrome is
// found (set CHROME_PATH).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startHarness } = require('./e2e/harness.js');

const FIXTURES = fs.readdirSync(path.join(__dirname, 'e2e', 'fixtures')).filter((f) => f.endsWith('.html')).sort();
let h = null;
before(async () => { h = await startHarness(); });
after(async () => { if (h) await h.stop(); });
const needChrome = (t) => { if (!h) { t.skip('Chrome not found (set CHROME_PATH)'); return false; } return true; };
// WCAG AA for body text: every colour painted into a "coloured" element must
// stay readable on that element's surface.
const READABLE = 4.5;
const expectationsHold = (snap) => {
  for (const e of snap.expectations) {
    if (e.expect === 'plain') assert.equal(e.share, 0, `${e.el} should stay plain`);
    else {
      assert.ok(e.share > 0.5, `${e.el} should be coloured (share ${e.share})`);
      assert.ok(e.contrast >= READABLE, `${e.el} should be readable: lowest contrast ${e.contrast} < ${READABLE}`);
    }
  }
};

test('dark-color-mix: every scheme stays readable on a color-mix()/oklab() dark surface', async (t) => {
  if (!needChrome(t)) return;
  for (const scheme of Object.keys(require('../src/core.js').SCHEMES)) {
    const snap = await (await h.open('dark-color-mix.html', { enabled: true, scheme })).snapshot();
    for (const e of snap.expectations) assert.ok(e.contrast >= READABLE, `${scheme}: ${e.el} lowest contrast ${e.contrast}`);
  }
});

test('late.html: the prose arrived after the content scripts were running (late path really exercised)', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('late.html');
  assert.equal(await page.evaluate(`document.getElementById('app').dataset.scriptsFirst`), 'true');
});

for (const fixture of FIXTURES) {
  test(`${fixture}: every data-expect verdict holds`, async (t) => {
    if (!needChrome(t)) return;
    const page = await h.open(fixture);
    const snap = await page.snapshot();
    assert.ok(snap.expectations.length > 0, 'fixture declares expectations');
    expectationsHold(snap);
  });
}

test('article: one launcher, neutral links; off removes everything, on restores the same colouring', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html');
  const on = await page.snapshot();
  assert.ok(on.ranges > 0);
  assert.equal(on.launchers, 1);
  assert.equal(on.linkClass, true);
  await page.setSync({ enabled: false }); await page.settle();
  const off = await page.snapshot();
  assert.deepEqual({ ranges: off.ranges, launchers: off.launchers, linkClass: off.linkClass }, { ranges: 0, launchers: 0, linkClass: false });
  await page.setSync({ enabled: true }); await page.settle();
  assert.equal((await page.snapshot()).ranges, on.ranges);
});

test('article: a disabled host is not coloured', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: true, disabledHosts: ['127.0.0.1'] });
  assert.equal((await page.snapshot()).ranges, 0);
  await page.setSync({ disabledHosts: [] }); await page.settle();
  assert.ok((await page.snapshot()).ranges > 0);
});

test('article: the Reader overlay is coloured and closes when colouring stops', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html');
  await page.send({ type: 'open-reader' }); await page.settle();
  const open = await page.snapshot();
  assert.equal(open.readerOpen, true);
  assert.ok(open.readerRanges > 0, 'reader paragraphs are coloured');
  await page.setSync({ enabled: false }); await page.settle();
  assert.equal((await page.snapshot()).readerOpen, false);
});

test('article: feedback records whether the selected block was coloured', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html');
  const select = () => page.evaluate(`getSelection().selectAllChildren(document.getElementById('p1'))`);
  await select();
  await page.send({ type: 'feedback', verdict: 'yes' }); await page.settle(100);
  await page.setSync({ enabled: false }); await page.settle();
  await select();
  await page.send({ type: 'feedback', verdict: 'no' }); await page.settle(100);
  const [yes, no] = (await page.local()).feedback;
  assert.deepEqual([yes.verdict, yes.coloured], ['body', true]);
  assert.deepEqual([no.verdict, no.coloured], ['not-body', false]);
  assert.ok(!('chain' in yes.f) && !('meta' in yes.f), 'stored features keep their shape');
});

test('article: Sprint flashes the page from its first chunk and closes when colouring stops', async (t) => {
  if (!needChrome(t)) return;
  // 150 wpm x 2 words = 800 ms on the first chunk: long enough to read it back.
  const page = await h.open('article.html', { enabled: true, sprintWpm: 150, sprintChunk: 2 });
  await page.send({ type: 'sprint-page' }); await page.settle(150);
  const open = await page.snapshot();
  assert.equal(open.sprintOpen, true);
  assert.equal(open.sprintWord, "The committee's");
  await page.setSync({ enabled: false }); await page.settle(300);
  assert.equal((await page.snapshot()).sprintOpen, false);
});

const PARA = 'Later in the week the committee published its report. It summarised the debate and listed the open questions. Residents were invited to comment before the end of the month, and the chair promised replies to every letter received. ';

test('article: paragraphs added after the first pass are coloured', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html');
  await page.evaluate(`(() => { const p = document.createElement('p'); p.id = 'late'; p.dataset.expect = 'coloured'; p.textContent = ${JSON.stringify(PARA)}; document.querySelector('article').appendChild(p); })()`);
  await page.settle();
  const snap = await page.snapshot();
  assert.ok(snap.expectations.some((e) => e.el.startsWith('p#late')));
  expectationsHold(snap);
});

test('article: a swapped-in <body> (SPA navigation) is coloured', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html');
  await page.evaluate(`(() => { const b = document.createElement('body'); b.innerHTML = '<main><article><h2 data-expect="plain">Next page</h2>' + [1, 2, 3, 4].map((i) => '<p id="n' + i + '" data-expect="coloured">' + ${JSON.stringify(PARA)} + '</p>').join('') + '</article></main>'; document.documentElement.replaceChild(b, document.body); })()`);
  await page.settle();
  const snap = await page.snapshot();
  assert.ok(snap.expectations.some((e) => e.el.startsWith('p#n1')), 'new body is the one checked');
  expectationsHold(snap);
});

// ---- reading aids: ruler, pacer, Sprint safeguards, Reader text ----
const key = (page, k, mods = '') => page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true, cancelable: true ${mods} }))`);

test('ruler: the band snaps to the line under the pointer, spans three lines when asked, moves with Alt+Down, and goes when off', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: false, rulerOn: true, rulerStyle: 'shade', rulerLines: 1 });
  assert.equal(await page.evaluate(`!!document.querySelector('.bzln-ruler-root')`), true, 'runs even with colouring off');
  const move = async (dy) => JSON.parse(await page.evaluate(`(() => { const r = document.getElementById('p1').getBoundingClientRect(); document.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + ${dy}, bubbles: true })); return JSON.stringify({ top: r.top, left: r.left, right: r.right }); })()`));
  const band = async () => { await page.settle(300); return JSON.parse(await page.evaluate(`(() => { const b = document.querySelector('.bzln-ruler-band'); if (!b || b.style.display === 'none') return 'null'; const r = b.getBoundingClientRect(); return JSON.stringify({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, style: b.parentElement.dataset.style }); })()`)); };

  const p = await move(12);
  const one = await band();
  assert.equal(one.style, 'shade');
  assert.ok(one.bottom - one.top > 15 && one.bottom - one.top < 45, `one line of 16px/1.6 text, got ${one.bottom - one.top}px`);
  assert.ok(one.top <= p.top + 12 && one.bottom >= p.top + 12, 'the pointer is inside the band');
  assert.ok(one.left <= p.left && one.right >= p.right - 80, 'the band spans the paragraph');

  await page.setSync({ rulerLines: 3 }); await page.settle(150);
  await move(40);   // second line: a band with a line either side
  const three = await band();
  assert.ok(three.bottom - three.top > 2.5 * (one.bottom - one.top), `three lines are about three times as tall (${three.bottom - three.top} vs ${one.bottom - one.top})`);

  await page.setSync({ rulerLines: 1 }); await page.settle(150);
  await move(40);
  const before = await band();
  await key(page, 'ArrowDown', ', altKey: true'); 
  const after = await band();
  assert.ok(after.top - before.top > 15 && after.top - before.top < 45, `Alt+Down moves one line (${after.top - before.top}px)`);

  await page.setSync({ rulerOn: false }); await page.settle(200);
  assert.equal(await page.evaluate(`!!document.querySelector('.bzln-ruler-root')`), false);
});

test('pacer: a highlight starts at the first reading text in view, advances, pauses, takes lines, and stops on Escape', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: false, pacerWpm: 100, pacerUnit: 'word' });   // works with colouring off too
  const hl = () => page.evaluate(`(() => { const h = CSS.highlights.get('bzln_pace'); const r = h && [...h][0]; return r ? r.toString() : null; })()`);
  await page.send({ type: 'pace-page' }); await page.settle(250);
  assert.equal(await page.evaluate(`!!document.querySelector('.bzln-pacer-bar')`), true);
  const first = await hl();
  assert.ok(first && !/\s/.test(first), `one word is highlighted: ${JSON.stringify(first)}`);
  assert.equal(first, 'The', 'starts at the first paragraph, not the (plain) heading');
  await page.setSync({ pacerWpm: 700 }); await page.settle(700);   // a running pacer follows the setting
  const later = await hl();
  assert.notEqual(later, first, 'the highlight has moved on');

  await key(page, ' ');   // pause
  const a = await hl(); await page.settle(400); const b = await hl();
  assert.equal(a, b, 'paused: it stays put');
  await key(page, 'ArrowRight');
  assert.notEqual(await hl(), a, 'forward steps one word');

  await page.setSync({ pacerUnit: 'line' }); await page.settle(150);
  assert.ok((await hl()).split(/\s+/).length > 4, 'in line mode a whole line is highlighted');

  await key(page, 'Escape'); await page.settle(100);
  assert.equal(await hl(), null);
  assert.equal(await page.evaluate(`!!document.querySelector('.bzln-pacer-bar')`), false);
});

test('pacer: starts from the selection', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: true, pacerWpm: 100 });
  await page.evaluate(`(() => { const n = document.getElementById('p3').firstChild; getSelection().setBaseAndExtent(n, 0, n, 3); })()`);
  await page.send({ type: 'pace-page' }); await page.settle(250);
  assert.equal(await page.evaluate(`[...CSS.highlights.get('bzln_pace')][0].toString()`), 'The');
  assert.equal(await page.evaluate(`[...CSS.highlights.get('bzln_pace')][0].startContainer.parentElement.id`), 'p3');
});

test('Sprint safeguards: back one sentence, a context peek while paused, and a note at very high speed', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: true, sprintWpm: 150 });
  await page.send({ type: 'sprint-page' }); await page.settle(150);
  const word = () => page.evaluate(`document.querySelector('.bzln-sprint-word').textContent`);
  const ctx = async () => JSON.parse(await page.evaluate(`(() => { const c = document.querySelector('.bzln-sprint-context'); const m = c.querySelector('mark'); return JSON.stringify({ on: c.classList.contains('bzln-sprint-context-on'), text: c.textContent.trim(), mark: m && m.textContent.trim() }); })()`));
  assert.equal((await ctx()).on, false, 'no peek while it plays');
  await key(page, ' ');   // pause on the first word
  let c = await ctx();
  assert.equal(c.on, true);
  assert.equal(c.mark, 'The');
  // Sprint reads the heading and then the paragraph, so the first "sentence" runs from the heading to the first full stop.
  assert.ok(c.text.startsWith("The committee's long evening The committee met") && c.text.endsWith('for the region.'), `the whole sentence: ${c.text}`);

  await key(page, 'ArrowDown');
  assert.equal(await word(), 'Members', 'next sentence');
  await key(page, 'ArrowUp');
  assert.equal(await word(), 'The', 'at a sentence start, back goes to the sentence before');
  await key(page, 'ArrowRight'); await key(page, 'ArrowRight');
  assert.equal(await word(), 'long');
  await key(page, 'ArrowUp');
  assert.equal(await word(), 'The', 'mid-sentence, back goes to its start');

  assert.equal(await page.evaluate(`document.querySelector('.bzln-sprint-hint').hidden`), true, 'no note at 150 wpm');
  const fast = await h.open('article.html', { enabled: true, sprintWpm: 800 });
  await fast.send({ type: 'sprint-page' }); await fast.settle(150);
  assert.equal(await fast.evaluate(`document.querySelector('.bzln-sprint-hint').hidden`), false, 'a note at 800 wpm');
});

test('Reader text: the panel opens and the stored text settings reach the open Reader', async (t) => {
  if (!needChrome(t)) return;
  const page = await h.open('article.html', { enabled: true });
  await page.send({ type: 'open-reader' }); await page.settle(300);
  const css = () => page.evaluate(`(() => { const b = document.querySelector('.bzln-reader-body'), p = b.querySelector('p'), s = getComputedStyle(b); return JSON.stringify({ size: s.fontSize, letter: s.letterSpacing, word: s.wordSpacing, line: s.lineHeight, maxWidth: getComputedStyle(p).maxWidth, card: document.querySelector('.bzln-reader-card').getBoundingClientRect().width }); })()`).then(JSON.parse);
  const before = await css();
  assert.equal(before.size, '16px'); assert.equal(before.line, '27.2px'); assert.equal(before.maxWidth, 'none', 'defaults are the original look');

  assert.equal(await page.evaluate(`document.querySelector('.bzln-reader-tpwrap').hidden`), true);
  await page.evaluate(`[...document.querySelectorAll('.bzln-reader-btn')].find((b) => b.textContent === 'Aa').click()`);
  assert.equal(await page.evaluate(`document.querySelector('.bzln-reader-tpwrap').hidden`), false, 'the Aa button opens the panel');

  await page.setSync({ readerSize: 1.3, readerLetter: 0.05, readerLine: 2, readerWidth: 50 }); await page.settle(300);
  const after = await css();
  assert.equal(after.size, '20.8px');
  assert.equal(after.letter, '1.04px');
  assert.equal(after.word, '1.248px', 'word spacing is lifted to the first step at or above the letter spacing (0.06em)');
  assert.equal(after.line, '41.6px');
  assert.ok(parseFloat(after.maxWidth) < after.card, `the column is narrower than the card: ${after.maxWidth}`);
});
