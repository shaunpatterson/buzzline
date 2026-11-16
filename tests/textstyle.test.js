'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../src/settings.js');
const { readerVars, FONTS } = require('../src/textstyle.js');

test('default reader settings set nothing, so each surface keeps its own look', () => {
  assert.deepEqual(Object.values(readerVars(normalize({}))), [null, null, null, null, null, null]);
});

test('chosen settings become CSS custom properties', () => {
  const v = readerVars(normalize({ readerFont: 'serif', readerSize: 1.3, readerLetter: 0.05, readerWord: 0.2, readerLine: 2, readerWidth: 60 }));
  assert.deepEqual(v, {
    '--bzln-r-font': FONTS.serif, '--bzln-r-size': '1.3', '--bzln-r-letter': '0.05em',
    '--bzln-r-word': '0.2em', '--bzln-r-line': '2', '--bzln-r-width': '60ch'
  });
});

test('letter spacing carries word spacing with it', () => {
  const v = readerVars(normalize({ readerLetter: 0.1 }));
  assert.equal(v['--bzln-r-word'], '0.1em');
});
