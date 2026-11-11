#!/usr/bin/env node
// Builds dist/buzzline-<version>.zip for the Chrome Web Store / Edge Add-ons:
// manifest.json, src/ and icons/ only.   node scripts/package.js
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join('dist', `buzzline-${version}.zip`);
fs.rmSync(path.join(root, out), { force: true });
execFileSync('zip', ['-rqX', out, 'manifest.json', 'src', 'icons', '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`wrote ${out} (${(fs.statSync(path.join(root, out)).size / 1024).toFixed(0)} KB)`);
