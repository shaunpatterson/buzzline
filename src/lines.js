(() => {
  'use strict';

  // Line geometry: turn the client rects of a block's text into lines, find the
  // line at a height, and the band a reading ruler covers. Pure; the ruler
  // (ruler.js) feeds it rects measured from the page or from the PDF reader.

  // Rects ({ top, bottom, left, right }, in any order) -> lines top to bottom.
  // Rects that share most of their height belong to one line.
  function groupLines(rects) {
    const lines = [];
    const sorted = rects.filter((r) => r.bottom > r.top && r.right > r.left).slice().sort((a, b) => a.top - b.top || a.left - b.left);
    for (const r of sorted) {
      const h = r.bottom - r.top;
      const line = lines.find((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > 0.5 * Math.min(h, l.bottom - l.top));
      if (line) {
        line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom);
        line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right);
      } else {
        lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      }
    }
    return lines.sort((a, b) => a.top - b.top);
  }

  // The line containing height y, else the nearest line within 0.6 of a line
  // height of it, else -1.
  function indexAt(lines, y) {
    let best = -1, bestD = Infinity;
    lines.forEach((l, i) => {
      const d = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best >= 0 && bestD <= 0.6 * (lines[best].bottom - lines[best].top) ? best : -1;
  }

  // The box covering `count` lines (1 or 3) centred on lines[index]; clamped
  // at the first and last line. Its width is the widest of those lines.
  function bandOf(lines, index, count) {
    const half = Math.floor(count / 2);
    const from = Math.max(0, index - half), to = Math.min(lines.length - 1, index + half);
    let b = null;
    for (let i = from; i <= to; i++) {
      const l = lines[i];
      b = b ? { top: Math.min(b.top, l.top), bottom: Math.max(b.bottom, l.bottom), left: Math.min(b.left, l.left), right: Math.max(b.right, l.right) } : { ...l };
    }
    return b;
  }

  const api = { groupLines, indexAt, bandOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineLines = api;
})();
