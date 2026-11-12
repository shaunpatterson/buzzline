'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMES } = require('../src/core.js');
const {
  normalize, merge, effectiveScheme, normalizeHost, withHostDisabled, withSiteScheme
} = require('../src/settings.js');

const messy = { scheme: 'nope', sprintWpm: 505, sprintChunk: 7, sprintDelays: { period: 9, comma: 1.26 }, disabledHosts: 'x', linkUnderline: false };

test('normalize fills every key with its default', () => {
  assert.deepEqual(normalize({}), {
    enabled: false, scheme: 'classic', disabledHosts: [], siteSchemes: {}, linkUnderline: true,
    sprintWpm: 500, sprintChunk: 1, sprintDelays: { period: 2.4, comma: 1.7 }
  });
});

test('normalize repairs invalid values and rounds to the stored precision', () => {
  const s = normalize(messy);
  assert.equal(s.scheme, 'classic');
  assert.equal(s.sprintWpm, 510);
  assert.equal(s.sprintChunk, 1);
  assert.deepEqual(s.sprintDelays, { period: 2.4, comma: 1.3 });
  assert.deepEqual(s.disabledHosts, []);
  assert.equal(s.linkUnderline, false);
});

test('normalize clamps WPM into range and defaults non-numbers', () => {
  assert.equal(normalize({ sprintWpm: 1200 }).sprintWpm, 900);
  assert.equal(normalize({ sprintWpm: 'abc' }).sprintWpm, 500);
});

test('normalize is idempotent', () => {
  assert.deepEqual(normalize(normalize(messy)), normalize(messy));
});

test('merge applies storage changes and keeps the rest', () => {
  const before = normalize({});
  const after = merge(before, { enabled: { newValue: true } });
  assert.equal(after.enabled, true);
  assert.deepEqual({ ...after, enabled: false }, before);
});

test('effectiveScheme: a valid site scheme wins, an unknown one falls back to the global scheme', () => {
  const [a, b] = Object.keys(SCHEMES);
  assert.equal(effectiveScheme(normalize({ scheme: a, siteSchemes: { 'x.com': b } }), 'x.com'), b);
  assert.equal(effectiveScheme(normalize({ scheme: a, siteSchemes: { 'x.com': 'nope' } }), 'x.com'), a);
});

test('normalizeHost accepts hostnames and URLs, rejects everything else', () => {
  assert.equal(normalizeHost('https://Example.com/a'), 'example.com');
  assert.equal(normalizeHost('example.com/path'), 'example.com');
  for (const bad of ['localhost', '.x.com', 'a b.com', '']) assert.equal(normalizeHost(bad), null, bad);
});

test('withHostDisabled adds idempotently, removes, and never mutates its input', () => {
  const list = ['a.com'];
  assert.deepEqual(withHostDisabled(list, 'b.com', true), ['a.com', 'b.com']);
  assert.deepEqual(withHostDisabled(list, 'a.com', true), ['a.com']);
  assert.deepEqual(withHostDisabled(list, 'a.com', false), []);
  assert.deepEqual(list, ['a.com']);
});

test('withSiteScheme sets and removes without mutating its input', () => {
  const map = { 'a.com': 'x' };
  assert.deepEqual(withSiteScheme(map, 'b.com', 'y'), { 'a.com': 'x', 'b.com': 'y' });
  assert.deepEqual(withSiteScheme(map, 'a.com', null), {});
  assert.deepEqual(map, { 'a.com': 'x' });
});
