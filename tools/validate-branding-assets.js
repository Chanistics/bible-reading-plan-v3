#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('assets/branding/asset-index.json'));
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));
const release = JSON.parse(read('sw.js').match(/const RELEASE = (\{[^\n]+\});/)[1]);
const base = 'https://chanistics.github.io/bible-reading-plan-v3/';
assert.equal(new URL(manifest.id, base).href, new URL('./index.html', base).href, 'Keep the existing installed-app identity');
assert.equal(manifest.start_url, './index.html');
assert.equal(manifest.scope, './');
assert(html.includes('rel="manifest" href="manifest.json?v=2"'), 'The installed manifest URL must stay stable');
assert.equal(data.records.length, data.shell.length);
assert.equal(new Set(data.shell).size, data.shell.length);
for (const record of data.records) {
  const bytes = fs.readFileSync(path.join(root, record.path));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  assert(record.path.includes('-' + hash + '.'), `${record.path}: filename must change with image contents`);
  assert(data.shell.includes('./' + record.path));
  assert(release.assets.some(asset => asset.url === './' + record.path));
  if (record.path.endsWith('.png')) {
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), record.width);
    assert.equal(bytes.readUInt32BE(20), record.height);
  } else {
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert(read('branding.css').includes(record.path));
  }
  if (record.kind === 'startup') {
    const landscape = record.orientation === 'landscape';
    assert.equal(record.width, (landscape ? record.cssHeight : record.cssWidth) * record.scale);
    assert.equal(record.height, (landscape ? record.cssWidth : record.cssHeight) * record.scale);
    assert(record.logoSize <= 1254, 'Never enlarge the logo master');
    assert(html.includes(`href="${record.path}" media="screen and (device-width: ${record.cssWidth}px) and (device-height: ${record.cssHeight}px) and (-webkit-device-pixel-ratio: ${record.scale}) and (orientation: ${record.orientation})"`));
  }
}
assert.equal(data.records.filter(record => record.kind === 'startup').length, 38);
for (const icon of manifest.icons) {
  const record = data.records.find(item => item.path === icon.src);
  assert(record);
  assert.equal(icon.sizes, `${record.width}x${record.height}`);
  assert.equal(icon.purpose, record.kind === 'maskable' ? 'maskable' : 'any');
}
assert.deepEqual(manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.sizes), ['192x192', '512x512', '1024x1024']);
assert.equal(manifest.icons.filter(icon => icon.purpose === 'maskable').length, 2);
assert(!read('style.css').includes("url('hero.png')"));

const bootScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes('app-booting'));
assert(bootScript);
for (const state of [null, { hasEntered: false }, { hasEntered: true }, 'corrupt', 'blocked']) {
  const classes = new Set();
  let fallback;
  const context = { window: {}, document: { documentElement: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } } },
    localStorage: { getItem() { if (state === 'blocked') throw new Error('Blocked'); return state === 'corrupt' ? '{' : JSON.stringify(state); } },
    setTimeout(fn, ms) { assert.equal(ms, 10000); fallback = fn; return 1; } };
  vm.runInNewContext(bootScript, context);
  assert.equal(classes.has('app-booting'), state?.hasEntered === true);
  if (fallback) { fallback(); assert(!classes.has('app-booting'), 'A failed script must not trap the user behind the boot screen'); }
}
assert(read('app.js').includes("document.documentElement?.classList.remove('app-booting')"));
(async () => {
  for (const fails of [false, true]) {
    let removed = false, cleared = false;
    const element = { addEventListener() {}, classList: { add() {}, remove() {} } };
    const context = { console, Date, setTimeout, clearTimeout: () => { cleared = true; },
      window: { addEventListener() {}, appBootTimeout: 1 },
      document: { getElementById: () => element, documentElement: { classList: { remove: name => { removed = name === 'app-booting'; } } } },
      localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null } };
    vm.createContext(context);
    vm.runInContext(read('app.js'), context);
    await vm.runInContext(`appInitializationPromise = ${fails ? 'Promise.reject(new Error("test"))' : 'Promise.resolve()'}; enterApplication();`, context);
    assert(removed && cleared, 'Successful and failed initialization must both dismiss the boot screen');
  }
  console.log(`Branding checks passed: ${data.records.length} versioned image assets, 38 pixel-matched launch screens, stable app identity, offline release inclusion and boot recovery.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
