#!/usr/bin/env node
// Produces dist/firefox/ with a Firefox-flavoured manifest. The code itself
// is shared: Firefox exposes the `chrome.*` callback namespace as well as
// `browser.*`. Differences handled here:
//   - MV3 background: Firefox runs event pages (`scripts`), not `service_worker`
//   - `browser_specific_settings.gecko.id` is required for signing / sync
// Note: Firefox treats MV3 host permissions as optional; users enable
// "Run on all sites" from the extension's settings on first use.
//   node scripts/build_firefox.js   -> dist/firefox/  (load via about:debugging)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'firefox');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of ['src', 'icons']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
manifest.background = { scripts: [manifest.background.service_worker] };
manifest.browser_specific_settings = { gecko: { id: 'buzzline@shaunpatterson.github.io', strict_min_version: '121.0' } };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', path.relative(root, out), 'version', manifest.version);
