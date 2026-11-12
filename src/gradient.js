(() => {
  'use strict';

  // Line gradient: where the colour changes inside a block. Measured line
  // fragments and a palette in, coloured runs out; no DOM access, so the
  // colouring users see is testable in node. Each visual line runs from
  // palette[i] to palette[i + 1] (wrapping) in STEPS equal-width steps across
  // the line's full width, so text split over several nodes continues the
  // same gradient.
  const { mix } = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.BuzzlineCore;

  const STEPS = 12;   // colour steps per line

  // A fragment starts a new visual line when its top moves by more than 0.6 of
  // its height from the previous fragment's top.
  function groupLines(fragments) {
    const lines = [];
    let current = null, lastTop = null;
    for (const f of fragments) {
      const top = f.rect.top, guard = Math.max(1, f.rect.height);
      if (!current || lastTop === null || Math.abs(top - lastTop) > guard * 0.6) { current = []; lines.push(current); }
      current.push(f);
      lastTop = top;
    }
    return lines;
  }

  // fragments: [{ node, start, end, rect: { top, height, left, right, width }, linkRun }]
  //   in document order; node is opaque (passed through), start/end are char
  //   offsets into it.
  // palette: [{ r, g, b }, ...]
  // -> [{ node, start, end, color, linkRun }]: consecutive chars of one
  //   fragment whose centres fall in the same step share one run.
  function planRuns(fragments, palette) {
    const out = [];
    const lines = groupLines(fragments);
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const startC = palette[li % palette.length], endC = palette[(li + 1) % palette.length];
      const left = Math.min(...line.map((f) => f.rect.left));
      const width = Math.max(1, Math.max(...line.map((f) => f.rect.right)) - left);
      for (const f of line) {
        const len = f.end - f.start;
        if (len <= 0) continue;
        const x0 = f.rect.left, w = f.rect.width;
        let runStart = f.start, runStep = -1;
        for (let i = f.start; i <= f.end; i++) {
          // position of char i's centre, linear within the fragment
          const step = i === f.end ? -2 : Math.min(STEPS - 1, Math.max(0, Math.floor(((x0 + w * (i - f.start + 0.5) / len) - left) / width * STEPS)));
          if (step !== runStep) {
            if (runStep >= 0 && i > runStart) {
              out.push({ node: f.node, start: runStart, end: i, color: mix(startC, endC, (runStep + 0.5) / STEPS), linkRun: f.linkRun });
            }
            runStart = i; runStep = step;
          }
        }
      }
    }
    return out;
  }

  const api = { STEPS, planRuns };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineGradient = api;
})();
