(() => {
  'use strict';

  // Sprint reader: RSVP (Rapid Serial Visual Presentation) overlay that
  // flashes words one at a time with the Optimal Recognition Point (ORP)
  // highlighted and horizontally aligned so the eye stays still. Exposes
  // window.__bzlnSprint(text); a new call replaces any open session.

  const DEFAULT_WPM = 500;
  const MIN_WPM = 150;
  const MAX_WPM = 900;

  // Pivot rule — longer words put the ORP slightly further in.
  function orpIndex(word) {
    const n = word.length;
    if (n <= 1) return 0;
    if (n <= 5) return 1;
    if (n <= 9) return 2;
    if (n <= 13) return 3;
    return 4;
  }

  function tokenize(text) {
    return text.trim().split(/\s+/).filter(Boolean);
  }

  // Hold longer on punctuation and on long words so readers catch clause
  // boundaries. Multipliers are applied to the base WPM tick.
  function delayMultiplier(word) {
    if (/[.!?][")\]]?$/.test(word)) return 2.4;
    if (/[,;:][")\]]?$/.test(word)) return 1.7;
    if (/[—–]$/.test(word)) return 1.5;
    if (word.length > 9) return 1.3;
    return 1;
  }

  let session = null;
  let buildToken = 0;

  function close() {
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    document.removeEventListener('keydown', session.onKey, true);
    if (session.root && session.root.parentNode) {
      session.root.parentNode.removeChild(session.root);
    }
    session = null;
  }

  function render() {
    if (!session) return;
    const word = session.words[session.index];
    const idx = orpIndex(word);
    session.preEl.textContent = word.slice(0, idx);
    session.orpEl.textContent = word[idx] || '';
    session.postEl.textContent = word.slice(idx + 1);
    session.counterEl.textContent =
      `${session.index + 1} / ${session.words.length}`;
    const pct = ((session.index + 1) / session.words.length) * 100;
    session.progressEl.style.width = pct.toFixed(2) + '%';
  }

  function step() {
    if (!session || !session.playing) return;
    render();
    const word = session.words[session.index];
    const base = 60000 / session.wpm;
    const delay = base * delayMultiplier(word);
    session.timer = setTimeout(() => {
      if (!session) return;
      if (session.index >= session.words.length - 1) {
        session.playing = false;
        session.playBtn.textContent = '▶';
        return;
      }
      session.index++;
      step();
    }, delay);
  }

  function play() {
    if (!session) return;
    if (session.playing) return;
    if (session.index >= session.words.length - 1) session.index = 0;
    session.playing = true;
    session.playBtn.textContent = '⏸';
    step();
  }

  function pause() {
    if (!session) return;
    session.playing = false;
    if (session.timer) { clearTimeout(session.timer); session.timer = null; }
    session.playBtn.textContent = '▶';
  }

  function togglePlay() {
    if (!session) return;
    if (session.playing) pause(); else play();
  }

  function step1(delta) {
    if (!session) return;
    pause();
    session.index = Math.max(
      0,
      Math.min(session.words.length - 1, session.index + delta)
    );
    render();
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function resolveStartWpm(cb) {
    try {
      chrome.storage.sync.get(['sprintWpm'], (s) => {
        const v = Number(s && s.sprintWpm);
        if (Number.isFinite(v) && v >= MIN_WPM && v <= MAX_WPM) cb(v);
        else cb(DEFAULT_WPM);
      });
    } catch {
      cb(DEFAULT_WPM);
    }
  }

  function build(text) {
    close();
    const words = tokenize(text);
    if (!words.length) return;
    const myToken = ++buildToken;
    resolveStartWpm((startWpm) => {
      // A later build() superseded this one — bail.
      if (myToken !== buildToken) return;
      buildSession(text, words, startWpm);
    });
  }

  function buildSession(text, words, startWpm) {

    const root = el('div', 'bzln-sprint-root');
    const backdrop = el('div', 'bzln-sprint-backdrop');
    const card = el('div', 'bzln-sprint-card');

    const header = el('div', 'bzln-sprint-header');
    const title = el('div', 'bzln-sprint-title', 'Buzzline · Sprint');
    const closeBtn = el('button', 'bzln-sprint-close', '✕');
    closeBtn.type = 'button';
    closeBtn.title = 'Close (Esc)';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const stage = el('div', 'bzln-sprint-stage');
    const guide = el('div', 'bzln-sprint-guide');
    const word = el('div', 'bzln-sprint-word');
    const pre = el('span', 'bzln-sprint-pre');
    const orp = el('span', 'bzln-sprint-orp');
    const post = el('span', 'bzln-sprint-post');
    word.appendChild(pre);
    word.appendChild(orp);
    word.appendChild(post);
    stage.appendChild(guide);
    stage.appendChild(word);

    const progress = el('div', 'bzln-sprint-progress');
    const progressFill = el('div', 'bzln-sprint-progress-fill');
    progress.appendChild(progressFill);

    const controls = el('div', 'bzln-sprint-controls');
    const prevBtn = el('button', 'bzln-sprint-ctrl', '◀');
    prevBtn.type = 'button'; prevBtn.title = 'Previous word (←)';
    const playBtn = el('button', 'bzln-sprint-ctrl bzln-sprint-play', '▶');
    playBtn.type = 'button'; playBtn.title = 'Play / pause (space)';
    const nextBtn = el('button', 'bzln-sprint-ctrl', '▶');
    nextBtn.type = 'button'; nextBtn.title = 'Next word (→)';
    nextBtn.style.transform = 'none';
    const counter = el('div', 'bzln-sprint-counter', `1 / ${words.length}`);
    controls.appendChild(prevBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(counter);

    const speedWrap = el('div', 'bzln-sprint-speed');
    const speedLabel = el('label', 'bzln-sprint-speed-label');
    const wpmText = el('span', 'bzln-sprint-wpm', `${startWpm} wpm`);
    speedLabel.textContent = 'Speed ';
    speedLabel.appendChild(wpmText);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(MIN_WPM);
    slider.max = String(MAX_WPM);
    slider.step = '10';
    slider.value = String(startWpm);
    slider.className = 'bzln-sprint-slider';
    speedWrap.appendChild(speedLabel);
    speedWrap.appendChild(slider);

    card.appendChild(header);
    card.appendChild(stage);
    card.appendChild(progress);
    card.appendChild(controls);
    card.appendChild(speedWrap);

    root.appendChild(backdrop);
    root.appendChild(card);
    document.documentElement.appendChild(root);

    session = {
      root,
      words,
      index: 0,
      wpm: startWpm,
      playing: false,
      timer: null,
      preEl: pre,
      orpEl: orp,
      postEl: post,
      counterEl: counter,
      progressEl: progressFill,
      playBtn,
      onKey: null
    };

    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', () => step1(-1));
    nextBtn.addEventListener('click', () => step1(1));
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      if (!Number.isFinite(v)) return;
      session.wpm = v;
      wpmText.textContent = `${v} wpm`;
    });

    session.onKey = (e) => {
      if (!session) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step1(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step1(1); }
    };
    document.addEventListener('keydown', session.onKey, true);

    render();
    play();
  }

  window.__bzlnSprint = build;
  window.__bzlnSprintClose = close;
})();
