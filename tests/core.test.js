'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMES, hexToRgb, parseCssColor, contrastRatio, isDarkSurface, tokenizeWords
} = require('../src/core.js');

test('tokenizeWords folds punctuation-only tokens into neighbours', () => {
  assert.deepEqual(tokenizeWords('page (skipping , , inputs, and'), ['page', '(skipping,,', 'inputs,', 'and']);
  assert.deepEqual(tokenizeWords('Open . Enable'), ['Open.', 'Enable']);
  assert.deepEqual(tokenizeWords('say ( hello )'), ['say', '(hello)']);
  assert.deepEqual(tokenizeWords('— start'), ['—start']);
  assert.deepEqual(tokenizeWords(' , '), [',']);
  assert.deepEqual(tokenizeWords(''), []);
});

test('parseCssColor parses computed rgb/rgba and rejects other syntaxes', () => {
  assert.deepEqual(parseCssColor('rgb(13, 17, 23)'), { r: 13, g: 17, b: 23, a: 1 });
  assert.equal(parseCssColor('rgba(0, 0, 0, 0)').a, 0);
  assert.equal(parseCssColor('rgb(13 17 23 / 50%)').a, 0.5);
  assert.equal(parseCssColor('oklch(0.5 0.1 20)'), null);
});

test('isDarkSurface prefers background, falls back to text luminance', () => {
  assert.equal(isDarkSurface({ r: 13, g: 17, b: 23 }, null), true);
  assert.equal(isDarkSurface({ r: 255, g: 255, b: 255 }, { r: 240, g: 246, b: 252 }), false);
  assert.equal(isDarkSurface(null, { r: 240, g: 246, b: 252 }), true);
  assert.equal(isDarkSurface(null, { r: 27, g: 27, b: 27 }), false);
  assert.equal(isDarkSurface(null, null), false);
});

test('every scheme has anchored 4-colour light/dark variants readable on dark surfaces', () => {
  const surfaces = ['#0d1117', '#1e1e1e'].map(hexToRgb);
  for (const [key, scheme] of Object.entries(SCHEMES)) {
    for (const variant of ['light', 'dark']) {
      const colors = scheme[variant];
      assert.equal(colors.length, 4, `${key}.${variant} length`);
      assert.equal(colors[0], colors[2], `${key}.${variant} anchors`);
    }
    for (const c of scheme.dark) {
      for (const s of surfaces) {
        assert.ok(contrastRatio(hexToRgb(c), s) >= 4.5, `${key}.dark ${c} contrast`);
      }
    }
  }
});

test('blockScore separates long prose from metadata, references and link chrome', () => {
  const { blockScore, isProseBlock } = require('../src/core.js');
  const base = { chars: 0, words: 0, sentences: 0, linkFrac: 0, chain: '', ad: 0, rel: 0, side: 0, nav: 0, chrome: 0, main: 0, tag: 'div', wFrac: 0.5, cx: 0.5 };
  const prose = { ...base, chars: 420, words: 70, sentences: 4, tag: 'p', main: 1, chain: 'p>div.post>article', prevChars: 300, nextChars: 300, sibProse: 1 };
  const reference = { ...base, chars: 300, words: 40, sentences: 3, linkFrac: 0.5, tag: 'li', chain: 'li#cite_note-4>ol.mw-references' };
  const byline = { ...base, chars: 45, words: 7, sentences: 0, tag: 'div', chain: 'div.dateline>div#abs' };
  const sidebarLinks = { ...base, chars: 90, words: 12, linkFrac: 1, tag: 'li', side: 1, chrome: 1, cx: 0.9, wFrac: 0.2 };
  assert.ok(isProseBlock(prose), 'long paragraph is prose');
  assert.ok(!isProseBlock(reference), 'citation entry is not');
  assert.ok(!isProseBlock(byline), 'dateline is not');
  assert.ok(!isProseBlock(sidebarLinks), 'sidebar link list is not');
  assert.ok(blockScore(prose) > blockScore({ ...prose, chars: 60 }), 'longer text scores higher');
});

test('ensureContrast lifts every palette colour to 4.5:1 on mid-tone surfaces and leaves good ones alone', () => {
  const { ensureContrast, contrastRatio, hexToRgb, SCHEMES } = require('../src/core.js');
  const grey = { r: 110, g: 110, b: 110 };          // neither variant is readable here as-is
  for (const scheme of Object.values(SCHEMES)) for (const variant of ['light', 'dark']) {
    const pal = scheme[variant].map(hexToRgb);
    for (const c of ensureContrast(pal, grey)) assert.ok(contrastRatio(c, grey) >= 4.5, `${scheme.name} ${variant} on grey`);
  }
  const white = { r: 255, g: 255, b: 255 };
  const light = SCHEMES.classic.light.map(hexToRgb);
  assert.deepEqual(ensureContrast(light, white), light, 'already-readable palette is untouched');
  assert.deepEqual(ensureContrast(light, null), light, 'unknown background: untouched');
});

test('promo wording lowers the prose score; text-derived features match explicit ones; CJK terminators count', () => {
  const { blockScore, textFeatures, SENTENCE_END_RX } = require('../src/core.js');
  const base = { chars: 150, words: 25, sentences: 3, linkFrac: 0, chain: '', ad: 0, rel: 0, side: 0, nav: 0, chrome: 0, main: 0, tag: 'p', wFrac: 0.5, cx: 0.5, prevChars: 0, nextChars: 0, sibProse: 0.5 };
  const plain = textFeatures('The committee met on three occasions to discuss the proposal and its consequences for the region.');
  const promo = textFeatures('Subscribe to continue reading. Get unlimited access to all our journalism for one low monthly price.');
  assert.ok(blockScore({ ...base, ...plain }) > blockScore({ ...base, ...promo }), 'promo paragraph scores lower than plain prose');
  const text = 'Subscribe to continue reading.';
  assert.equal(blockScore({ ...base, text }), blockScore({ ...base, ...textFeatures(text) }), 'features derived from text');
  assert.equal(('ミツバチは花の蜜を集める。働き蜂は巣を守る！'.match(SENTENCE_END_RX) || []).length, 2);
  assert.equal(('end. Next'.match(SENTENCE_END_RX) || []).length, 1);
  assert.equal(('Done!" She left'.match(SENTENCE_END_RX) || []).length, 1);
});
