'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planRuns, STEPS } = require('../src/gradient.js');
const { mix } = require('../src/core.js');

const P = [{ r: 0, g: 0, b: 0 }, { r: 240, g: 0, b: 0 }, { r: 0, g: 240, b: 0 }];
// A fragment of `len` chars laid out from x=left over `width` px on the line at `top`.
const frag = (node, len, { left = 0, width = len * 10, top = 0, height = 20, start = 0, linkRun = false } = {}) =>
  ({ node, start, end: start + len, linkRun, rect: { top, height, left, width, right: left + width } });
const spans = (runs) => runs.map((r) => [r.node, r.start, r.end]);

test('a line is cut into STEPS equal-width runs that fade from one palette colour to the next', () => {
  const runs = planRuns([frag('a', STEPS)], P);
  assert.equal(runs.length, STEPS);
  runs.forEach((r, k) => {
    assert.deepEqual([r.start, r.end], [k, k + 1]);
    assert.deepEqual(r.color, mix(P[0], P[1], (k + 0.5) / STEPS));
  });
});

test('chars in the same step share one run', () => {
  const runs = planRuns([frag('a', STEPS * 3)], P);
  assert.equal(runs.length, STEPS);
  assert.deepEqual(spans(runs).slice(0, 2), [['a', 0, 3], ['a', 3, 6]]);
});

test('fragments of different nodes on one line continue the same gradient', () => {
  const half = STEPS / 2;
  const runs = planRuns([frag('a', half), frag('b', half, { left: half * 10 })], P);
  assert.deepEqual(runs.filter((r) => r.node === 'a').map((r) => r.color), Array.from({ length: half }, (_, k) => mix(P[0], P[1], (k + 0.5) / STEPS)));
  assert.deepEqual(runs.find((r) => r.node === 'b').color, mix(P[0], P[1], (half + 0.5) / STEPS));
});

test('a new line starts when the top moves by more than 0.6 of the line height; lines walk the palette and wrap', () => {
  const lines = [0, 20, 40, 60].map((top, i) => frag('n' + i, 1, { top, width: 120 }));
  // one char spanning the whole line sits in the middle step
  const colours = planRuns(lines, P).map((r) => r.color);
  const mid = (STEPS / 2 + 0.5) / STEPS;
  assert.deepEqual(colours, [mix(P[0], P[1], mid), mix(P[1], P[2], mid), mix(P[2], P[0], mid), mix(P[0], P[1], mid)]);
  // small vertical jitter (inline images, baseline shifts) stays on the same line
  const jitter = planRuns([frag('a', STEPS / 2), frag('b', STEPS / 2, { left: 60, top: 10 })], P);
  assert.deepEqual(jitter.at(-1).color, mix(P[0], P[1], (STEPS - 0.5) / STEPS));
});

test('runs cover every char of every fragment exactly once, keep link flags and skip empty fragments', () => {
  const fs = [frag('a', 7, { width: 33 }), frag('b', 0, { left: 33, width: 0 }), frag('c', 19, { start: 4, left: 33, width: 80, linkRun: true })];
  const runs = planRuns(fs, P);
  for (const f of fs) {
    const own = runs.filter((r) => r.node === f.node);
    assert.equal(own.reduce((n, r) => n + r.end - r.start, 0), f.end - f.start, `${f.node} covered`);
    own.forEach((r, i) => assert.equal(r.start, i ? own[i - 1].end : f.start, `${f.node} contiguous`));
    assert.ok(own.every((r) => r.linkRun === f.linkRun));
  }
});
