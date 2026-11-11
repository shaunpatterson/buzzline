const MIN_WPM = 150;
const MAX_WPM = 900;
const DEFAULT_WPM = 500;

const wpmSlider = document.getElementById('sprint-wpm');
const wpmValue = document.getElementById('sprint-wpm-value');
const addForm = document.getElementById('add-form');
const addInput = document.getElementById('add-host');
const addError = document.getElementById('add-error');
const hostsEl = document.getElementById('hosts');
const emptyEl = document.getElementById('empty');
const savedEl = document.getElementById('saved');

let savedTimer = null;
function flashSaved() {
  savedEl.hidden = false;
  savedEl.classList.add('show');
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedEl.classList.remove('show'), 1200);
}

function clampWpm(v) {
  if (!Number.isFinite(v)) return DEFAULT_WPM;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(v / 10) * 10));
}

function setWpmUI(v) {
  wpmSlider.value = String(v);
  wpmValue.textContent = `${v} wpm`;
}

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

function showAddError(msg) {
  addError.textContent = msg;
  addError.hidden = false;
}
function clearAddError() {
  addError.hidden = true;
  addError.textContent = '';
}

function renderHosts(list) {
  hostsEl.innerHTML = '';
  if (!list.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  const sorted = list.slice().sort();
  for (const host of sorted) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'host-name';
    name.textContent = host;
    name.title = host;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => removeHost(host));
    li.appendChild(name);
    li.appendChild(btn);
    hostsEl.appendChild(li);
  }
}

function loadHosts(cb) {
  chrome.storage.sync.get(['disabledHosts'], (s) => {
    cb(Array.isArray(s.disabledHosts) ? s.disabledHosts : []);
  });
}

function saveHosts(list) {
  chrome.storage.sync.set({ disabledHosts: list }, () => {
    renderHosts(list);
    flashSaved();
  });
}

function addHost(raw) {
  const host = normalizeHost(raw);
  if (!host) {
    showAddError('Enter a valid hostname, like example.com');
    return;
  }
  clearAddError();
  loadHosts((list) => {
    if (list.includes(host)) {
      showAddError(`${host} is already blocked`);
      return;
    }
    const next = list.concat(host);
    saveHosts(next);
    addInput.value = '';
  });
}

function removeHost(host) {
  loadHosts((list) => {
    const next = list.filter((h) => h !== host);
    saveHosts(next);
  });
}

// --- init ---

const linkUnderlineEl = document.getElementById('link-underline');

chrome.storage.sync.get(['sprintWpm', 'disabledHosts', 'linkUnderline'], (s) => {
  const wpm = clampWpm(
    Number.isFinite(s.sprintWpm) ? s.sprintWpm : DEFAULT_WPM
  );
  setWpmUI(wpm);
  renderHosts(Array.isArray(s.disabledHosts) ? s.disabledHosts : []);
  linkUnderlineEl.checked = s.linkUnderline !== false;
});

linkUnderlineEl.addEventListener('change', () => {
  chrome.storage.sync.set({ linkUnderline: linkUnderlineEl.checked }, flashSaved);
});

wpmSlider.addEventListener('input', () => {
  const v = clampWpm(parseInt(wpmSlider.value, 10));
  wpmValue.textContent = `${v} wpm`;
});
wpmSlider.addEventListener('change', () => {
  const v = clampWpm(parseInt(wpmSlider.value, 10));
  chrome.storage.sync.set({ sprintWpm: v }, flashSaved);
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addHost(addInput.value);
});
addInput.addEventListener('input', clearAddError);

// Reflect changes made in the popup (e.g. toggling the per-site switch).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.disabledHosts) {
    const next = Array.isArray(changes.disabledHosts.newValue)
      ? changes.disabledHosts.newValue
      : [];
    renderHosts(next);
  }
  if (changes.sprintWpm) {
    const v = clampWpm(Number(changes.sprintWpm.newValue));
    setWpmUI(v);
  }
});

// --- model feedback (stored in chrome.storage.local by the content script) ---
const fbCount = document.getElementById('feedback-count');
function refreshFeedback() {
  chrome.storage.local.get(['feedback'], (s) => {
    const n = Array.isArray(s.feedback) ? s.feedback.length : 0;
    fbCount.textContent = `${n} ${n === 1 ? 'entry' : 'entries'}`;
  });
}
document.getElementById('feedback-export').addEventListener('click', () => {
  chrome.storage.local.get(['feedback'], (s) => {
    const blob = new Blob([JSON.stringify(s.feedback || [], null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `buzzline-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // Revoking synchronously can race the download; let it start first.
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
});
document.getElementById('feedback-clear').addEventListener('click', () => {
  chrome.storage.local.set({ feedback: [] }, () => { refreshFeedback(); flashSaved(); });
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.feedback) refreshFeedback(); });
refreshFeedback();

// --- Sprint chunking + punctuation holds ---
const chunkEl = document.getElementById('sprint-chunk');
const periodEl = document.getElementById('delay-period');
const commaEl = document.getElementById('delay-comma');
const clampMul = (v, d) => (Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : d);
chrome.storage.sync.get(['sprintChunk', 'sprintDelays'], (s) => {
  chunkEl.value = String([1, 2, 3].includes(Number(s.sprintChunk)) ? Number(s.sprintChunk) : 1);
  const d = s.sprintDelays || {};
  periodEl.value = String(clampMul(+d.period, 2.4));
  commaEl.value = String(clampMul(+d.comma, 1.7));
});
chunkEl.addEventListener('change', () => chrome.storage.sync.set({ sprintChunk: Number(chunkEl.value) }, flashSaved));
const saveDelays = () => {
  const period = clampMul(parseFloat(periodEl.value), 2.4), comma = clampMul(parseFloat(commaEl.value), 1.7);
  periodEl.value = String(period); commaEl.value = String(comma);
  chrome.storage.sync.set({ sprintDelays: { period, comma } }, flashSaved);
};
periodEl.addEventListener('change', saveDelays);
commaEl.addEventListener('change', saveDelays);
