const { SCHEMES, hexToRgb, mix, rgbStr } = globalThis.BuzzlineCore;
const S = globalThis.BuzzlineSettings;

const toggle = document.getElementById('toggle');
const schemeSelect = document.getElementById('scheme');
const preview = document.getElementById('preview');
const siteRow = document.getElementById('site-row');
const siteHostEl = document.getElementById('site-host');
const siteToggle = document.getElementById('site-toggle');

let currentHost = null;

for (const key of Object.keys(SCHEMES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = SCHEMES[key].name;
  schemeSelect.appendChild(opt);
}

const siteOnly = document.getElementById('site-only');
let siteSchemes = {};
let globalScheme = 'classic';

S.load((s) => {
  toggle.checked = s.enabled;
  globalScheme = s.scheme;
  siteSchemes = s.siteSchemes;
  schemeSelect.value = globalScheme;
  renderPreview();
  initSiteRow(s.disabledHosts);
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
// Scheme: global by default; with "only this site" ticked it is remembered
// for the current hostname only (siteSchemes[host]).
schemeSelect.addEventListener('change', () => {
  if (siteOnly.checked && currentHost) {
    siteSchemes = S.withSiteScheme(siteSchemes, currentHost, schemeSelect.value);
    chrome.storage.sync.set({ siteSchemes });
  } else {
    globalScheme = schemeSelect.value;
    chrome.storage.sync.set({ scheme: globalScheme });
  }
  renderPreview();
});
siteOnly.addEventListener('change', () => {
  if (!currentHost) return;
  if (siteOnly.checked) {
    siteSchemes = S.withSiteScheme(siteSchemes, currentHost, schemeSelect.value);
  } else {
    siteSchemes = S.withSiteScheme(siteSchemes, currentHost, null);
    schemeSelect.value = globalScheme;
    renderPreview();
  }
  chrome.storage.sync.set({ siteSchemes });
});

function initSiteRow(disabledHosts) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) return;
    let host = null;
    try {
      const u = new URL(tab.url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        host = u.hostname.toLowerCase();
      }
    } catch { /* not a URL we can parse */ }
    if (!host) return; // chrome://, file://, etc. — leave row hidden
    currentHost = host;
    siteHostEl.textContent = host;
    siteHostEl.title = host;
    siteToggle.checked = !disabledHosts.includes(host);
    siteRow.hidden = false;
    siteOnly.disabled = false;
    if (siteSchemes[host] && SCHEMES[siteSchemes[host]]) {
      siteOnly.checked = true;
      schemeSelect.value = siteSchemes[host];
      renderPreview();
    }
  });
}

document.getElementById('settings-link').addEventListener('click', (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('src/options.html'));
  }
});

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    // Close the popup AFTER the callback fires so the IPC send isn't torn
    // down mid-flight. lastError will typically be "message port closed"
    // because our listener doesn't call sendResponse — that's expected.
    chrome.tabs.sendMessage(tab.id, message, () => {
      void chrome.runtime.lastError;
      window.close();
    });
  });
}

document.getElementById('sprint-page-btn').addEventListener('click', () => {
  sendToActiveTab({ type: 'sprint-page' });
});
document.getElementById('open-reader-btn').addEventListener('click', () => {
  sendToActiveTab({ type: 'open-reader' });
});
document.getElementById('fb-no').addEventListener('click', () => {
  sendToActiveTab({ type: 'feedback', verdict: 'no' });
});
document.getElementById('fb-yes').addEventListener('click', () => {
  sendToActiveTab({ type: 'feedback', verdict: 'yes' });
});

siteToggle.addEventListener('change', () => {
  if (!currentHost) return;
  S.load((s) => chrome.storage.sync.set({ disabledHosts: S.withHostDisabled(s.disabledHosts, currentHost, !siteToggle.checked) }));
});

function renderPreview() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = SCHEMES[schemeSelect.value][dark ? 'dark' : 'light'].map(hexToRgb);
  const lines = [
    'Reading on-screen can be tough on',
    'your eyes, especially if you read',
    'all day long. Buzzline pulls your',
    'eyes from one line to the next.'
  ];
  preview.innerHTML = '';
  for (let li = 0; li < lines.length; li++) {
    const lineDiv = document.createElement('div');
    const text = lines[li];
    const start = colors[li % colors.length];
    const end   = colors[(li + 1) % colors.length];
    for (let i = 0; i < text.length; i++) {
      const span = document.createElement('span');
      const t = text.length <= 1 ? 0 : i / (text.length - 1);
      span.style.color = rgbStr(mix(start, end, t));
      span.textContent = text[i];
      lineDiv.appendChild(span);
    }
    preview.appendChild(lineDiv);
  }
}
