const { SCHEMES, hexToRgb, mix, rgbStr } = globalThis.BuzzlineCore;

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

chrome.storage.sync.get(['enabled', 'scheme', 'disabledHosts'], (s) => {
  toggle.checked = !!s.enabled;
  schemeSelect.value = SCHEMES[s.scheme] ? s.scheme : 'classic';
  renderPreview();
  initSiteRow(Array.isArray(s.disabledHosts) ? s.disabledHosts : []);
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
schemeSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ scheme: schemeSelect.value });
  renderPreview();
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

siteToggle.addEventListener('change', () => {
  if (!currentHost) return;
  chrome.storage.sync.get(['disabledHosts'], (s) => {
    const list = Array.isArray(s.disabledHosts) ? s.disabledHosts.slice() : [];
    const idx = list.indexOf(currentHost);
    if (!siteToggle.checked && idx === -1) list.push(currentHost);
    else if (siteToggle.checked && idx !== -1) list.splice(idx, 1);
    chrome.storage.sync.set({ disabledHosts: list });
  });
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
