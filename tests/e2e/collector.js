// Page-side collector for the Buzzline e2e harness. Evaluate this file's single
// expression in the world where the content scripts run (core.js, blocks.js,
// reading.js, content.js loaded). Returns every counting block (visible,
// >= 30 chars; see BuzzlineBlocks.blockStats) in document order with the exact
// feature object the live classifier scores, plus:
//   coloured  share of its text the extension coloured (0..1, from the
//             window.__bzlnIsColoured hook defined by src/content.js)
//   inRoot    share of its text inside the content root, i.e. what colouring
//             considers before the classifier (0..1)
//   text      its own text, first 400 chars (never committed)
(() => {
  const B = window.BuzzlineBlocks;
  B.reset();
  const OWN = '.bzln-sprint-root, .bzln-reader-root, [data-bzln-launcher]';
  const r3 = (v) => +v.toFixed(3);
  const scope = new Set(window.BuzzlineReading.candidateText(document.body));
  const per = new Map();   // block -> { total, coloured, inRoot }
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement; if (!p || !n.nodeValue || p.closest(OWN)) continue;
    const b = B.nearestBlock(p);
    let r = per.get(b); if (!r) { r = { total: 0, coloured: 0, inRoot: 0 }; per.set(b, r); }
    r.total += n.nodeValue.length;
    if (window.__bzlnIsColoured(n)) r.coloured += n.nodeValue.length;
    if (scope.has(n)) r.inRoot += n.nodeValue.length;
  }
  const blocks = [];
  for (const [el, r] of per) {
    if (!B.countsAsBlock(el)) continue;
    const f = B.blockFeatures(el);
    blocks.push({ ...f, linkFrac: r3(f.linkFrac), cx: r3(f.cx), wFrac: r3(f.wFrac), sibProse: r3(f.sibProse),
      coloured: r3(r.coloured / Math.max(1, r.total)), inRoot: r3(r.inRoot / Math.max(1, r.total)), text: B.blockStats(el).text.slice(0, 400) });
  }
  return { title: document.title.slice(0, 120), url: location.href, vw: innerWidth, docH: Math.max(document.documentElement.scrollHeight, 1), blocks };
})()
