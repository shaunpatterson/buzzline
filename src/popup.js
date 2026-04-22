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

for (const key of Object.keys(SCHEMES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = SCHEMES[key].name;
  schemeSelect.appendChild(opt);
}

chrome.storage.sync.get(['enabled', 'scheme'], (s) => {
  toggle.checked = !!s.enabled;
  schemeSelect.value = SCHEMES[s.scheme] ? s.scheme : 'classic';
  renderPreview();
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
schemeSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ scheme: schemeSelect.value });
  renderPreview();
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
