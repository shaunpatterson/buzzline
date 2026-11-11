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
