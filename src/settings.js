(() => {
  'use strict';

  // Settings: the chrome.storage.sync keys, their defaults, valid ranges and
  // edits. Pure except for load(); every page reads settings through here.
  const { SCHEMES } = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.BuzzlineCore;

  const KEYS = ['enabled', 'scheme', 'disabledHosts', 'siteSchemes', 'linkUnderline', 'sprintWpm', 'sprintChunk', 'sprintDelays'];
  const WPM = { min: 150, max: 900, default: 500 };
  // Sprint hold multipliers at clause boundaries (1-5, one decimal).
  const DELAYS = { period: 2.4, comma: 1.7 };

  // Nearest 10 inside [WPM.min, WPM.max]; non-numbers -> default.
  const clampWpm = (v) => (Number.isFinite(v) ? Math.max(WPM.min, Math.min(WPM.max, Math.round(v / 10) * 10)) : WPM.default);
  const clampMul = (v, d) => (Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : d);

  // Raw storage object (any shape, possibly empty) -> complete, valid settings.
  // Idempotent: normalize(normalize(x)) equals normalize(x).
  const normalize = (raw) => {
    raw = raw || {};
    const d = raw.sprintDelays || {};
    return {
      enabled: !!raw.enabled,
      scheme: SCHEMES[raw.scheme] ? raw.scheme : 'classic',
      disabledHosts: Array.isArray(raw.disabledHosts) ? raw.disabledHosts : [],
      siteSchemes: raw.siteSchemes && typeof raw.siteSchemes === 'object' ? raw.siteSchemes : {},
      linkUnderline: raw.linkUnderline !== false,
      sprintWpm: clampWpm(Number(raw.sprintWpm ?? WPM.default)),
      sprintChunk: [1, 2, 3].includes(Number(raw.sprintChunk)) ? Number(raw.sprintChunk) : 1,
      sprintDelays: { period: clampMul(+d.period, DELAYS.period), comma: clampMul(+d.comma, DELAYS.comma) }
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

  const api = { KEYS, WPM, DELAYS, clampWpm, clampMul, normalize, merge, effectiveScheme, isHostDisabled, normalizeHost, withHostDisabled, withSiteScheme, load };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BuzzlineSettings = api;
})();
