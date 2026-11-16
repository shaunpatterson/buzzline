(() => {
  'use strict';

  // Settings: the chrome.storage.sync keys, their defaults, valid ranges and
  // edits. Pure except for load(); every page reads settings through here.
  const { SCHEMES } = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.BuzzlineCore;

  const KEYS = [
    'enabled', 'scheme', 'disabledHosts', 'siteSchemes', 'linkUnderline', 'sprintWpm', 'sprintChunk', 'sprintDelays',
    'rulerOn', 'rulerStyle', 'rulerLines', 'pacerWpm', 'pacerUnit',
    'readerFont', 'readerSize', 'readerLetter', 'readerWord', 'readerLine', 'readerWidth'
  ];
  const WPM = { min: 150, max: 900, default: 500 };
  // The pacer keeps the text on screen, so it starts near an adult's usual
  // silent-reading speed (about 240 wpm on non-fiction) and stops well short of Sprint's top.
  const PACE = { min: 100, max: 700, default: 250 };
  // Sprint hold multipliers at clause boundaries (1-5, one decimal).
  const DELAYS = { period: 2.4, comma: 1.7 };
  const RULER_STYLES = ['shade', 'bar', 'underline'];
  const PACER_UNITS = ['word', 'line'];
  // Reader text: size is a multiple of 16px; letter and word spacing are in em;
  // width is a column in characters (0 = the whole card).
  const READER_FONTS = ['auto', 'sans', 'serif', 'wide'];   // auto: each surface's own font
  const READER_SIZES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
  const READER = {
    letter: { min: 0, max: 0.12, step: 0.01, default: 0 },
    word: { min: 0, max: 0.4, step: 0.02, default: 0 },
    line: { min: 1.3, max: 2.2, step: 0.1, default: 1.7 },
    width: { min: 40, max: 90, step: 5, default: 0 }
  };

  // Nearest 10 inside [WPM.min, WPM.max]; non-numbers -> default.
  const clampWpm = (v) => (Number.isFinite(v) ? Math.max(WPM.min, Math.min(WPM.max, Math.round(v / 10) * 10)) : WPM.default);
  const clampPace = (v) => (Number.isFinite(v) ? Math.max(PACE.min, Math.min(PACE.max, Math.round(v / 10) * 10)) : PACE.default);
  const clampMul = (v, d) => (Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : d);
  // Inside [min, max] on a grid of `step`; non-numbers -> default.
  const clampStep = (v, { min, max, step, default: d }) => (Number.isFinite(v) ? +(Math.max(min, Math.min(max, Math.round(v / step) * step))).toFixed(2) : d);
  const nearest = (list, v, d) => (Number.isFinite(v) ? list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) : d);

  // Raw storage object (any shape, possibly empty) -> complete, valid settings.
  // Idempotent: normalize(normalize(x)) equals normalize(x).
  const normalize = (raw) => {
    raw = raw || {};
    const d = raw.sprintDelays || {};
    const letter = clampStep(+raw.readerLetter, READER.letter);
    return {
      enabled: !!raw.enabled,
      scheme: SCHEMES[raw.scheme] ? raw.scheme : 'classic',
      disabledHosts: Array.isArray(raw.disabledHosts) ? raw.disabledHosts : [],
      siteSchemes: raw.siteSchemes && typeof raw.siteSchemes === 'object' ? raw.siteSchemes : {},
      linkUnderline: raw.linkUnderline !== false,
      sprintWpm: clampWpm(Number(raw.sprintWpm ?? WPM.default)),
      sprintChunk: [1, 2, 3].includes(Number(raw.sprintChunk)) ? Number(raw.sprintChunk) : 1,
      sprintDelays: { period: clampMul(+d.period, DELAYS.period), comma: clampMul(+d.comma, DELAYS.comma) },
      rulerOn: !!raw.rulerOn,
      rulerStyle: RULER_STYLES.includes(raw.rulerStyle) ? raw.rulerStyle : 'shade',
      rulerLines: Number(raw.rulerLines) === 3 ? 3 : 1,
      pacerWpm: clampPace(Number(raw.pacerWpm ?? PACE.default)),
      pacerUnit: PACER_UNITS.includes(raw.pacerUnit) ? raw.pacerUnit : 'word',
      readerFont: READER_FONTS.includes(raw.readerFont) ? raw.readerFont : 'auto',
      readerSize: nearest(READER_SIZES, +raw.readerSize, 1),
      readerLetter: letter,
      // Wider letter spacing alone slows reading; the gap between words must grow at least as much.
      readerWord: Math.max(clampStep(+raw.readerWord, READER.word), +(Math.ceil(letter / READER.word.step - 1e-9) * READER.word.step).toFixed(2)),
      readerLine: clampStep(+raw.readerLine, READER.line),
      readerWidth: +raw.readerWidth === 0 || !Number.isFinite(+raw.readerWidth) ? READER.width.default : clampStep(+raw.readerWidth, READER.width)
    };
  };

  // Apply a chrome.storage.onChanged `changes` object to normalized settings.
  const merge = (settings, changes) => {
    const raw = { ...settings };
    for (const k of KEYS) if (k in changes) raw[k] = changes[k].newValue;
    return normalize(raw);
  };

  // A valid per-site scheme wins over the global one.
  const effectiveScheme = (settings, host) => {
    const s = settings.siteSchemes[host];
    return SCHEMES[s] ? s : settings.scheme;
  };
  const isHostDisabled = (settings, host) => settings.disabledHosts.includes(host);

  // Accept raw hostnames or full URLs; return a lowercase hostname or null.
  function normalizeHost(raw) {
    let s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s.includes('://')) {
      try { s = new URL(s).hostname; } catch { return null; }
    } else {
      s = s.replace(/\/.*$/, '');
    }
    if (!s || s.length > 253) return null;
    if (!/^[a-z0-9.-]+$/.test(s)) return null;
    if (s.startsWith('.') || s.endsWith('.')) return null;
    if (!s.includes('.')) return null;
    return s;
  }

  // New list with `host` present (disabled) or absent (!disabled).
  const withHostDisabled = (list, host, disabled) => {
    const rest = list.filter((h) => h !== host);
    return disabled ? (list.includes(host) ? list.slice() : rest.concat(host)) : rest;
  };
  // New map with `host` set to `scheme`, or removed when scheme is null.
  const withSiteScheme = (siteSchemes, host, scheme) => {
    if (scheme != null) return { ...siteSchemes, [host]: scheme };
    const { [host]: _dropped, ...rest } = siteSchemes;
    return rest;
  };

  const load = (cb) => chrome.storage.sync.get(KEYS, (raw) => cb(normalize(raw)));

  const api = {
    KEYS, WPM, PACE, DELAYS, RULER_STYLES, PACER_UNITS, READER_FONTS, READER_SIZES, READER,
    clampWpm, clampPace, clampMul, clampStep, normalize, merge, effectiveScheme, isHostDisabled, normalizeHost, withHostDisabled, withSiteScheme, load
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineSettings = api;
})();
