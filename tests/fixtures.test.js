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

for (const fixture of FIXTURES) {
  test(`${fixture}: every data-expect verdict holds`, async (t) => {
    if (!needChrome(t)) return;
    const page = await h.open(fixture);
    const snap = await page.snapshot();
    assert.ok(snap.expectations.length > 0, 'fixture declares expectations');
    for (const e of snap.expectations) {
      if (e.expect === 'plain') assert.equal(e.share, 0, `${e.el} should stay plain`);
      else assert.ok(e.share > 0.5, `${e.el} should be coloured (share ${e.share})`);
    }
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
