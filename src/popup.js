const SCHEMES = {
  classic:       { name: 'Classic',        colors: ['#000000', '#1f4fb0', '#000000', '#b02a2a'] },
  dark:          { name: 'Dark mode',      colors: ['#eaeaea', '#7fb7ff', '#eaeaea', '#ff9c8a'] },
  ocean:         { name: 'Ocean',          colors: ['#003a5c', '#0087c7', '#003a5c', '#00b3a4'] },
  bumblebee:     { name: 'Bumblebee',      colors: ['#1a1a1a', '#d4a017', '#1a1a1a', '#8b4513'] },
  highcontrast:  { name: 'High contrast',  colors: ['#000000', '#0000ff', '#000000', '#d40000'] }
};

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
    siteToggle.checked = disabledHosts.includes(host);
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
    if (siteToggle.checked && idx === -1) list.push(currentHost);
    else if (!siteToggle.checked && idx !== -1) list.splice(idx, 1);
    chrome.storage.sync.set({ disabledHosts: list });
  });
});

function mix(a, b, t) {
  const parse = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [ar,ag,ab] = parse(a);
  const [br,bg,bb] = parse(b);
  const r = Math.round(ar + (br-ar)*t);
  const g = Math.round(ag + (bg-ag)*t);
  const bl = Math.round(ab + (bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}

function renderPreview() {
  const colors = SCHEMES[schemeSelect.value].colors;
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
      span.style.color = mix(start, end, t);
      span.textContent = text[i];
      lineDiv.appendChild(span);
    }
    preview.appendChild(lineDiv);
  }
}
