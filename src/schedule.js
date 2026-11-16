(() => {
  'use strict';

  // Sprint schedule: what Sprint flashes and for how long. Text and the Sprint
  // settings in, a list of chunks out; each chunk carries its ORP split and its
  // length in beats (one beat = one word at the reader's wpm). The overlay in
  // sprint.js only renders chunks and ticks a timer.
  const { tokenizeWords } = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.BuzzlineCore;

  // Pivot rule — longer words put the ORP slightly further in.
  function orpIndex(word) {
    const n = word.length;
    if (n <= 1) return 0;
    if (n <= 5) return 1;
    if (n <= 9) return 2;
    if (n <= 13) return 3;
    return 4;
  }

  // Hold longer on punctuation and on long words so readers catch clause
  // boundaries.
  function holdFactor(chunk, delays) {
    if (/[.!?][")\]]?$/.test(chunk)) return delays.period;
    if (/[,;:][")\]]?$/.test(chunk)) return delays.comma;
    if (/[—–]$/.test(chunk)) return 1.5;
    if (chunk.length > 9) return 1.3;
    return 1;
  }

  // Group N words per flash. A clause-ending word closes its chunk early so
  // punctuation holds still land where the reader expects them.
  function chunkWords(words, n) {
    if (n <= 1) return words;
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.length >= n || /[.!?,;:][")\]]?$/.test(w)) { out.push(cur.join(' ')); cur = []; }
    }
    if (cur.length) out.push(cur.join(' '));
    return out;
  }

  // text + { sprintChunk, sprintDelays } (normalized settings) ->
  // [{ text, pre, pivot, post, beats }]; [] when the text has no words.
  const buildSchedule = (text, { sprintChunk, sprintDelays }) =>
    chunkWords(tokenizeWords(text), sprintChunk).map((chunk) => {
      const i = orpIndex(chunk);
      return {
        text: chunk, pre: chunk.slice(0, i), pivot: chunk[i] || '', post: chunk.slice(i + 1),
        // A multi-word chunk gets time proportional to its word count.
        beats: Math.max(1, chunk.split(' ').length) * holdFactor(chunk, sprintDelays)
      };
    });

  // How long a chunk stays on screen at `wpm`.
  const holdMs = (chunk, wpm) => (60000 / wpm) * chunk.beats;

  // Sentences over a chunk list. A chunk ends a sentence when its text ends in
  // . ! or ? (optionally followed by a closing quote or bracket).
  const endsSentence = (chunk) => /[.!?][")\]]?$/.test(chunk.text);
  // [start, end] (inclusive chunk indexes) of the sentence containing `index`.
  function sentenceSpan(chunks, index) {
    let start = index;
    while (start > 0 && !endsSentence(chunks[start - 1])) start--;
    let end = index;
    while (end < chunks.length - 1 && !endsSentence(chunks[end])) end++;
    return { start, end };
  }
  // Where "back one sentence" lands: the start of the current sentence, or of
  // the one before when already at the start. This gives back the look-back
  // that one-word-at-a-time reading removes.
  function backSentence(chunks, index) {
    const { start } = sentenceSpan(chunks, index);
    return start < index ? start : sentenceSpan(chunks, Math.max(0, index - 1)).start;
  }
  // The start of the next sentence, or the last chunk.
  const nextSentence = (chunks, index) => Math.min(chunks.length - 1, sentenceSpan(chunks, index).end + 1);

  const api = { buildSchedule, holdMs, holdFactor, sentenceSpan, backSentence, nextSentence };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineSchedule = api;
})();
