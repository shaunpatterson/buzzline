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

chrome.storage.sync.get(['sprintWpm', 'disabledHosts'], (s) => {
  const wpm = clampWpm(
    Number.isFinite(s.sprintWpm) ? s.sprintWpm : DEFAULT_WPM
  );
  setWpmUI(wpm);
  renderHosts(Array.isArray(s.disabledHosts) ? s.disabledHosts : []);
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
