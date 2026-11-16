'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupLines, indexAt, bandOf } = require('../src/lines.js');

const r = (top, bottom, left = 0, right = 100) => ({ top, bottom, left, right });

test('rects on one line merge into it; separate lines stay apart, in order', () => {
  // two fragments of line 1 (a link splits it), then line 2, given out of order
  const lines = groupLines([r(40, 60, 0, 50), r(10, 30, 0, 80), r(11, 31, 80, 200), r(41, 61, 50, 120)]);
  assert.deepEqual(lines, [{ top: 10, bottom: 31, left: 0, right: 200 }, { top: 40, bottom: 61, left: 0, right: 120 }]);
});

test('empty and zero-size rects are ignored', () => {
  assert.deepEqual(groupLines([r(10, 10), r(0, 20, 5, 5), r(0, 20, 0, 10)]), [{ top: 0, bottom: 20, left: 0, right: 10 }]);
});

test('a tall inline box (superscript, image) does not swallow the next line', () => {
  const lines = groupLines([r(0, 20, 0, 100), r(2, 14, 100, 110), r(24, 44, 0, 100)]);
  assert.equal(lines.length, 2);
});

test('indexAt picks the line under y, tolerates a small gap, and gives up far away', () => {
  const lines = [r(0, 20), r(30, 50), r(60, 80)];
  assert.equal(indexAt(lines, 35), 1);
  assert.equal(indexAt(lines, 25), 0, 'in the gap: the nearer line (5 away from 20, 5 from 30 -> first)');
  assert.equal(indexAt(lines, 55), 1);
  assert.equal(indexAt(lines, 200), -1);
  assert.equal(indexAt([], 10), -1);
});

test('bandOf covers one line or three, clamped at the ends', () => {
  const lines = [r(0, 20, 0, 90), r(30, 50, 0, 100), r(60, 80, 10, 95)];
  assert.deepEqual(bandOf(lines, 1, 1), { top: 30, bottom: 50, left: 0, right: 100 });
  assert.deepEqual(bandOf(lines, 1, 3), { top: 0, bottom: 80, left: 0, right: 100 });
  assert.deepEqual(bandOf(lines, 0, 3), { top: 0, bottom: 50, left: 0, right: 100 }, 'no line above the first');
  assert.deepEqual(bandOf(lines, 2, 3), { top: 30, bottom: 80, left: 0, right: 100 });
});
