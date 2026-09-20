#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const workerFile = path.join(root, 'sw.js');
const block = /\/\* RELEASE_START \*\/[\s\S]*?\/\* RELEASE_END \*\//;
const source = fs.readFileSync(workerFile, 'utf8');
if (!block.test(source)) throw new Error('Missing release block');
const template = source.replace(block, '/* RELEASE_START */\nconst RELEASE = null;\n/* RELEASE_END */');
const urls = JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa-shell.json'), 'utf8'));
const assets = urls.map(url => {
  const relative = url === './' ? 'index.html' : url.split('?')[0];
  const bytes = fs.readFileSync(path.resolve(root, relative));
  return { url, integrity: 'sha256-' + crypto.createHash('sha256').update(bytes).digest('base64') };
});
const id = crypto.createHash('sha256').update(template).update(JSON.stringify(assets)).digest('hex').slice(0, 20);
const result = source.replace(block, `/* RELEASE_START */\nconst RELEASE = ${JSON.stringify({ id, assets })};\n/* RELEASE_END */`);
if (process.argv.includes('--check')) {
  if (source !== result) throw new Error('Stale PWA release: run npm run build:release');
} else fs.writeFileSync(workerFile, result);
console.log(`PWA release ${id}: ${assets.length} integrity-checked shell assets.`);
