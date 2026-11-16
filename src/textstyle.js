(() => {
  'use strict';

  // Reader text: how the Reader overlay and the PDF reader's Reader view set
  // their text (font, size, letter / word / line spacing, column width).
  //   readerVars(settings) -> CSS custom properties (pure, node-tested)
  //   apply(el, settings)  -> sets them on an element
  //   createPanel(...)     -> the controls (browser only)
  // The panel offers fonts as a choice. No font is claimed to help: a 2026
  // meta-analysis of dyslexia fonts found no effect.
  const S = typeof module === 'object' && module.exports ? require('./settings.js') : globalThis.BuzzlineSettings;

  const FONTS = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    serif: '"Iowan Old Style", "Palatino Linotype", Charter, Georgia, serif',
    wide: 'Verdana, Tahoma, "DejaVu Sans", sans-serif'
  };
  const FONT_LABELS = { auto: 'Default', sans: 'Sans', serif: 'Serif', wide: 'Wide' };

  // Normalized settings -> { '--bzln-r-…': value | null }. null = leave the
  // surface's own value (the property is removed).
  const readerVars = (s) => ({
    '--bzln-r-font': FONTS[s.readerFont] || null,
    '--bzln-r-size': s.readerSize === 1 ? null : String(s.readerSize),
    '--bzln-r-letter': s.readerLetter ? s.readerLetter + 'em' : null,
    '--bzln-r-word': s.readerWord ? s.readerWord + 'em' : null,
    '--bzln-r-line': s.readerLine === S.READER.line.default ? null : String(s.readerLine),
    '--bzln-r-width': s.readerWidth ? s.readerWidth + 'ch' : null
  });

  const apply = (el, s) => {
    for (const [k, v] of Object.entries(readerVars(s))) { if (v == null) el.style.removeProperty(k); else el.style.setProperty(k, v); }
  };

  const READER_KEYS = ['readerFont', 'readerSize', 'readerLetter', 'readerWord', 'readerLine', 'readerWidth'];
  const pickReader = (s) => Object.fromEntries(READER_KEYS.map((k) => [k, s[k]]));

  // The text controls. `settings` are normalized; opts.size = false hides the
  // size row (the PDF reader has its own). onLive(settings) runs on every
  // change, so the text can follow a slider as it moves; the values are stored
  // when a slider is released or a button pressed.
  function createPanel(settings, { size = true, onLive }) {
    const doc = document;
    let cur = S.normalize({ ...settings });
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const panel = el('div', 'bzln-tp');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Text settings');

    const save = () => { try { chrome.storage.sync.set(pickReader(cur)); } catch { /* extension reloaded under the page */ } };
    const change = (patch, persist) => {
      cur = S.normalize({ ...cur, ...patch });
      refresh();
      onLive(cur);
      if (persist) save();
    };

    const row = (label) => { const r = el('div', 'bzln-tp-row'); r.appendChild(el('div', 'bzln-tp-label', label)); panel.appendChild(r); return r; };

    const fontRow = row('Font');
    const fontBtns = {};
    for (const k of S.READER_FONTS) {
      const b = el('button', 'bzln-tp-btn', FONT_LABELS[k]);
      b.type = 'button';
      if (FONTS[k]) b.style.fontFamily = FONTS[k];
      b.addEventListener('click', () => change({ readerFont: k }, true));
      fontRow.appendChild(b); fontBtns[k] = b;
    }

    let sizeText = null, smaller = null, larger = null;
    if (size) {
      const r = row('Size');
      smaller = el('button', 'bzln-tp-btn', 'A−'); larger = el('button', 'bzln-tp-btn', 'A+');
      smaller.type = larger.type = 'button';
      sizeText = el('span', 'bzln-tp-value');
      const stepSize = (d) => { const i = S.READER_SIZES.indexOf(cur.readerSize) + d; if (i >= 0 && i < S.READER_SIZES.length) change({ readerSize: S.READER_SIZES[i] }, true); };
      smaller.addEventListener('click', () => stepSize(-1));
      larger.addEventListener('click', () => stepSize(1));
      r.append(smaller, sizeText, larger);
    }

    const sliders = {};
    const slider = (label, key, spec, fmt, toValue = (v) => v, fromValue = (v) => v) => {
      const r = row(label);
      const input = doc.createElement('input');
      input.type = 'range'; input.className = 'bzln-tp-slider';
      input.min = String(spec.min); input.max = String(spec.max); input.step = String(spec.step);
      input.setAttribute('aria-label', label);
      const out = el('span', 'bzln-tp-value');
      input.addEventListener('input', () => change({ [key]: toValue(+input.value) }, false));
      input.addEventListener('change', () => save());
      r.append(input, out);
      sliders[key] = { input, out, fmt, fromValue };
    };
    slider('Letters', 'readerLetter', S.READER.letter, (v) => (v ? '+' + Math.round(v * 100) + '%' : 'normal'));
    slider('Words', 'readerWord', S.READER.word, (v) => (v ? '+' + Math.round(v * 100) + '%' : 'normal'));
    slider('Lines', 'readerLine', S.READER.line, (v) => v.toFixed(1));
    // Width: the slider's lowest stop means "the whole card" (stored as 0).
    const W = S.READER.width, W_FULL = W.min - W.step;
    slider('Width', 'readerWidth', { min: W_FULL, max: W.max, step: W.step }, (v) => (v ? v + ' ch' : 'full'), (v) => (v <= W_FULL ? 0 : v), (v) => (v || W_FULL));

    const foot = el('div', 'bzln-tp-foot');
    const reset = el('button', 'bzln-tp-btn', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', () => change(pickReader(S.normalize({})), true));
    foot.appendChild(reset);
    foot.appendChild(el('div', 'bzln-tp-note', 'Wider letter spacing also widens the gaps between words.'));
    panel.appendChild(foot);

    function refresh() {
      for (const [k, b] of Object.entries(fontBtns)) b.setAttribute('aria-pressed', String(cur.readerFont === k));
      if (size) {
        sizeText.textContent = Math.round(cur.readerSize * 100) + '%';
        smaller.disabled = cur.readerSize === S.READER_SIZES[0];
        larger.disabled = cur.readerSize === S.READER_SIZES[S.READER_SIZES.length - 1];
      }
      for (const [key, s] of Object.entries(sliders)) { s.input.value = String(s.fromValue(cur[key])); s.out.textContent = s.fmt(cur[key]); }
    }
    refresh();

    return {
      el: panel,
      // New settings arrived from elsewhere (another tab, the other surface).
      set(next) { cur = S.normalize({ ...cur, ...pickReader(next) }); refresh(); }
    };
  }

  const api = { FONTS, READER_KEYS, readerVars, apply, createPanel, pickReader };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineTextStyle = api;
})();
