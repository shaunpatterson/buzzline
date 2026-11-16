(() => {
  'use strict';

  // Pacer: a highlight moves through the page's reading text at a set speed
  // (words or whole lines), and the page follows it. Unlike Sprint the text
  // stays on screen, so the eye can still look back. Timings use Sprint's
  // holds at commas and sentence ends. content.js calls start(settings) /
  // stop() / update(settings); there is one pacer per page.
  const S = globalThis.BuzzlineSettings;
  const R = globalThis.BuzzlineReading;
  const G = globalThis.BuzzlinePageGeo;
  const { holdFactor } = globalThis.BuzzlineSchedule;

  const HL = 'bzln_pace';   // not 'bzln-…': colouring owns that prefix
  const WORD_CAP = 40000;
  const KEY_STEP = 20;

  let st = null;

  const supported = () => typeof Highlight === 'function' && !!(CSS && CSS.highlights);

  // Reading text nodes in document order: the content root(s) and their peers,
  // filtered the way colouring filters them.
  function readingNodes() {
    let roots = R.roots();
    if (!roots.length) roots = R.refresh().roots;
    if (!roots.length) roots = [document.body];
    const seen = new Set(), out = [];
    for (const root of roots) {
      for (const n of R.candidateText(root)) {
        if (seen.has(n) || !R.isReadingText(n)) continue;
        seen.add(n); out.push(n);
      }
    }
    return out.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  // Words from `nodes` as { node, s, e }, starting at the word at/after (node, offset).
  function wordsFrom(nodes, startNode, startOffset) {
    const words = [];
    let started = !startNode;
    for (const node of nodes) {
      if (!started) {
        if (node === startNode) started = true;
        else if (startNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) started = true;
        else continue;
      }
      const rx = /\S+/g;
      let m;
      const from = node === startNode ? startOffset : 0;
      while ((m = rx.exec(node.nodeValue))) {
        if (m.index + m[0].length <= from) continue;
        words.push({ node, s: m.index, e: m.index + m[0].length });
        if (words.length >= WORD_CAP) return words;
      }
    }
    return words;
  }

  // Where to start: the selection, else the first reading text in view.
  function startPoint(nodes) {
    const sel = window.getSelection();
    if (sel && sel.anchorNode && sel.anchorNode.nodeType === 3 && nodes.includes(sel.anchorNode)) {
      return { node: sel.anchorNode, offset: sel.anchorOffset };
    }
    const range = document.createRange();
    for (const n of nodes) {
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.height && r.bottom > 80) return { node: n, offset: 0 };   // below any sticky header
    }
    return nodes.length ? { node: nodes[0], offset: 0 } : null;
  }

  const rangeOf = (a, b) => {
    const r = document.createRange();
    r.setStart(a.node, a.s); r.setEnd(b.node, b.e);
    return r;
  };

  // Last word on the same line as words[i] (lines are measured when first needed).
  function lineEnd(i) {
    if (st.lineEnds.has(i)) return st.lineEnds.get(i);
    const first = rangeOf(st.words[i], st.words[i]).getBoundingClientRect();
    let j = i;
    while (j + 1 < st.words.length) {
      const r = rangeOf(st.words[j + 1], st.words[j + 1]).getBoundingClientRect();
      if (!r.height || Math.abs(r.top - first.top) > 0.5 * first.height) break;
      j++;
    }
    st.lineEnds.set(i, j);
    return j;
  }
  const unitEnd = (i) => (st.unit === 'line' ? lineEnd(i) : i);

  // How long the unit starting at word i stays highlighted.
  function dwell(i) {
    let beats = 0;
    for (let k = i; k <= unitEnd(i); k++) beats += holdFactor(st.text(k), st.delays);
    return (60000 / st.wpm) * beats;
  }

  function show() {
    const end = unitEnd(st.index);
    const range = rangeOf(st.words[st.index], st.words[end]);
    CSS.highlights.set(HL, new Highlight(range));
    st.counter.textContent = `${st.wpm} wpm`;
    follow(range);
  }

  // Keep the highlighted text in the middle part of the view; scroll only when it nears an edge.
  function follow(range) {
    const now = performance.now();
    if (now < st.noScrollUntil) return;
    const r = range.getBoundingClientRect();
    const el = range.startContainer.parentElement;
    const view = G.viewportOf(el);
    const h = view.bottom - view.top;
    if (r.bottom > view.bottom - 0.22 * h || r.top < view.top + 0.1 * h) {
      G.scrollBy(el, r.top - (view.top + 0.33 * h));
      st.noScrollUntil = now + 450;
    }
  }

  function tick() {
    if (!st || !st.playing) return;
    show();
    st.timer = setTimeout(() => {
      if (!st) return;
      const next = unitEnd(st.index) + 1;
      if (next >= st.words.length) { stop(); return; }
      st.index = next;
      tick();
    }, dwell(st.index));
  }

  function setPlaying(on) {
    if (on === st.playing) return;
    st.playing = on;
    st.playBtn.textContent = on ? '⏸' : '▶';
    st.playBtn.title = on ? 'Pause (space)' : 'Play (space)';
    if (on) tick();
    else if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  }

  function go(index) {
    st.index = Math.max(0, Math.min(st.words.length - 1, index));
    if (st.playing) { clearTimeout(st.timer); tick(); } else show();
  }
  const step = (dir) => {
    if (dir > 0) go(unitEnd(st.index) + 1);
    else {
      // previous unit: step back one word, and in line mode to the start of that line
      let i = Math.max(0, st.index - 1);
      if (st.unit === 'line') while (i > 0 && lineEnd(i - 1) >= i) i--;
      go(i);
    }
  };

  function setWpm(v) {
    st.wpm = S.clampPace(v);
    st.counter.textContent = `${st.wpm} wpm`;
    try { chrome.storage.sync.set({ pacerWpm: st.wpm }); } catch { /* extension reloaded under the page */ }
    if (st.playing) { clearTimeout(st.timer); tick(); }
  }
  function setUnit(unit) {
    st.unit = unit;
    st.unitBtn.textContent = unit === 'line' ? 'Lines' : 'Words';
    try { chrome.storage.sync.set({ pacerUnit: unit }); } catch { /* as above */ }
    st.lineEnds.clear();
    if (st.playing) { clearTimeout(st.timer); tick(); } else show();
  }

  function button(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bzln-pacer-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.className = 'bzln-pacer-bar';
    st.playBtn = button('⏸', 'Pause (space)', () => setPlaying(!st.playing));
    const slower = button('−', 'Slower (↓)', () => setWpm(st.wpm - KEY_STEP));
    const faster = button('+', 'Faster (↑)', () => setWpm(st.wpm + KEY_STEP));
    st.counter = document.createElement('span');
    st.counter.className = 'bzln-pacer-wpm';
    st.unitBtn = button('Words', 'Highlight a word or a whole line at a time', () => setUnit(st.unit === 'line' ? 'word' : 'line'));
    const close = button('✕', 'Stop (Esc)', stop);
    bar.append(button('◀', 'Back (←)', () => step(-1)), st.playBtn, button('▶', 'Forward (→)', () => step(1)), slower, st.counter, faster, st.unitBtn, close);
    document.documentElement.appendChild(bar);
    return bar;
  }

  function notice(text) {
    const bar = document.createElement('div');
    bar.className = 'bzln-pacer-bar';
    bar.textContent = text;
    document.documentElement.appendChild(bar);
    setTimeout(() => bar.remove(), 2800);
  }

  function start(settings) {
    if (st) { stop(); return true; }   // the same command toggles it off
    if (!supported() || document.querySelector('.bzln-sprint-root, .bzln-reader-root')) return false;
    const nodes = readingNodes();
    const from = startPoint(nodes);
    const words = from ? wordsFrom(nodes, from.node, from.offset) : [];
    if (!words.length) {
      notice(location.protocol.endsWith('-extension:') && location.pathname.endsWith('/pdf.html')
        ? 'Nothing to pace here. In the PDF reader, switch to the Reader view.'
        : 'No reading text found to pace.');
      return false;
    }
    st = {
      words, index: 0, wpm: settings.pacerWpm, unit: settings.pacerUnit, delays: settings.sprintDelays,
      playing: false, timer: null, lineEnds: new Map(), noScrollUntil: 0,
      text: (k) => words[k].node.nodeValue.slice(words[k].s, words[k].e)
    };
    st.bar = buildBar();
    st.unitBtn.textContent = st.unit === 'line' ? 'Lines' : 'Words';
    st.onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const k = e.key;
      if (k === 'Escape') stop();
      else if (k === ' ') setPlaying(!st.playing);
      else if (k === 'ArrowRight') step(1);
      else if (k === 'ArrowLeft') step(-1);
      else if (k === 'ArrowUp') setWpm(st.wpm + KEY_STEP);
      else if (k === 'ArrowDown') setWpm(st.wpm - KEY_STEP);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    // Click text to move the highlight there (links, buttons and drags are left alone).
    st.onClick = (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest('a, button, input, textarea, select, .bzln-pacer-bar'))) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const c = G.caretAt(e.clientX, e.clientY);
      if (!c) return;
      let i = st.words.findIndex((w) => w.node === c.node && w.e >= c.offset);
      if (i < 0) return;
      if (st.unit === 'line') while (i > 0 && lineEnd(i - 1) >= i) i--;
      go(i);
    };
    document.addEventListener('keydown', st.onKey, true);
    document.addEventListener('click', st.onClick, true);
    setPlaying(true);
    return true;
  }

  function stop() {
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    document.removeEventListener('keydown', st.onKey, true);
    document.removeEventListener('click', st.onClick, true);
    if (supported()) CSS.highlights.delete(HL);
    st.bar.remove();
    st = null;
  }

  // New settings arrived (another tab or the options page changed them).
  function update(settings) {
    if (!st) return;
    st.delays = settings.sprintDelays;
    if (settings.pacerWpm !== st.wpm) { st.wpm = settings.pacerWpm; if (st.playing) { clearTimeout(st.timer); tick(); } else st.counter.textContent = `${st.wpm} wpm`; }
    if (settings.pacerUnit !== st.unit) { st.unit = settings.pacerUnit; st.unitBtn.textContent = st.unit === 'line' ? 'Lines' : 'Words'; st.lineEnds.clear(); if (st.playing) { clearTimeout(st.timer); tick(); } else show(); }
  }

  globalThis.BuzzlinePacer = { start, stop, update, isOn: () => !!st };
})();
