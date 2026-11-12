'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSchedule, holdMs } = require('../src/schedule.js');
const { normalize } = require('../src/settings.js');

const settings = (raw = {}) => normalize(raw);
const texts = (chunks) => chunks.map((c) => c.text);

test('the pivot moves further in as words get longer', () => {
  const split = (w) => { const [c] = buildSchedule(w, settings()); return [c.pre, c.pivot, c.post]; };
  assert.deepEqual(split('a'), ['', 'a', '']);
  assert.deepEqual(split('word'), ['w', 'o', 'rd']);
  assert.deepEqual(split('reading'), ['re', 'a', 'ding']);
  assert.deepEqual(split('comprehension'), ['com', 'p', 'rehension']);
  assert.deepEqual(split('internationalization'), ['inte', 'r', 'nationalization']);
});

test('one word per chunk by default; larger chunks close early at clause ends', () => {
  assert.deepEqual(texts(buildSchedule('one two three', settings())), ['one', 'two', 'three']);
  assert.deepEqual(texts(buildSchedule('one two three four five', settings({ sprintChunk: 2 }))), ['one two', 'three four', 'five']);
  assert.deepEqual(texts(buildSchedule('one, two three. four', settings({ sprintChunk: 3 }))), ['one,', 'two three.', 'four']);
});

test('punctuation-only tokens never become their own chunk', () => {
  assert.deepEqual(texts(buildSchedule('wait — what ?', settings())), ['wait—', 'what?']);
});

test('holds: sentence end and clause end use the settings; dashes and long words fixed', () => {
  const beats = (text, raw) => buildSchedule(text, settings(raw)).map((c) => c.beats);
  assert.deepEqual(beats('end. pause, plain'), [2.4, 1.7, 1]);
  assert.deepEqual(beats('end. pause,', { sprintDelays: { period: 3, comma: 2 } }), [3, 2]);
  assert.deepEqual(beats('"quoted." (aside,)'), [2.4, 1.7]);
  assert.deepEqual(beats('wait— extraordinary'), [1.5, 1.3]);
});

test('a multi-word chunk holds for each of its words', () => {
  const [a, b] = buildSchedule('one two three four.', settings({ sprintChunk: 2 }));
  assert.equal(a.beats, 2);
  assert.equal(b.beats, 2 * 2.4);
});

test('holdMs converts beats at the given wpm', () => {
  assert.equal(holdMs({ beats: 1 }, 600), 100);
  assert.equal(holdMs({ beats: 2.4 }, 500), 288);
});

test('text without words gives an empty schedule', () => {
  assert.deepEqual(buildSchedule('   ', settings()), []);
});
