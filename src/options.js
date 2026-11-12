const S = globalThis.BuzzlineSettings;

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

function setWpmUI(v) {
  wpmSlider.value = String(v);
  wpmValue.textContent = `${v} wpm`;
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
  S.load((s) => cb(s.disabledHosts));
}

function saveHosts(list) {
  chrome.storage.sync.set({ disabledHosts: list }, () => {
    renderHosts(list);
    flashSaved();
  });
}

function addHost(raw) {
  const host = S.normalizeHost(raw);
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
    const next = S.withHostDisabled(list, host, true);
    saveHosts(next);
    addInput.value = '';
  });
}

function removeHost(host) {
  loadHosts((list) => {
    const next = S.withHostDisabled(list, host, false);
    saveHosts(next);
  });
}

// --- init ---

const linkUnderlineEl = document.getElementById('link-underline');

linkUnderlineEl.addEventListener('change', () => {
  chrome.storage.sync.set({ linkUnderline: linkUnderlineEl.checked }, flashSaved);
});

wpmSlider.addEventListener('input', () => {
  const v = S.clampWpm(parseInt(wpmSlider.value, 10));
  wpmValue.textContent = `${v} wpm`;
});
wpmSlider.addEventListener('change', () => {
  const v = S.clampWpm(parseInt(wpmSlider.value, 10));
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
    const v = S.clampWpm(Number(changes.sprintWpm.newValue));
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

// --- initial values (after every element lookup) ---
S.load((s) => {
  setWpmUI(s.sprintWpm);
  renderHosts(s.disabledHosts);
  linkUnderlineEl.checked = s.linkUnderline;
  chunkEl.value = String(s.sprintChunk);
  periodEl.value = String(s.sprintDelays.period);
  commaEl.value = String(s.sprintDelays.comma);
});
chunkEl.addEventListener('change', () => chrome.storage.sync.set({ sprintChunk: Number(chunkEl.value) }, flashSaved));
const saveDelays = () => {
  const period = S.clampMul(parseFloat(periodEl.value), S.DELAYS.period), comma = S.clampMul(parseFloat(commaEl.value), S.DELAYS.comma);
  periodEl.value = String(period); commaEl.value = String(comma);
  chrome.storage.sync.set({ sprintDelays: { period, comma } }, flashSaved);
};
periodEl.addEventListener('change', saveDelays);
commaEl.addEventListener('change', saveDelays);
