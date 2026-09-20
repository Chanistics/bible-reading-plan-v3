#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'app-update.js'), 'utf8');
const shellUrls = [...JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa-shell.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'assets/branding/asset-index.json'), 'utf8')).shell];

async function workerTests() {
  const handlers = {};
  const deleted = [];
  const stores = new Map();
  let requests, skip = 0, claimed = 0, failInstall = false;
  let clients = [{ id: 'one', url: 'https://example.test/app/index.html' }];
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return {
      addAll: async list => { requests = list; if (failInstall) throw new Error('Partial deployment'); },
      match: async request => values.get(typeof request === 'string' ? request : request.url),
      put: async (request, response) => values.set(request.url, response)
    };
  };
  const context = {
    URL, Request, console, fetch: async () => new Response('network'),
    caches: { open: async name => cache(name), keys: async () => [...stores.keys()], delete: async name => { deleted.push(name); return stores.delete(name); } },
    self: { registration: { scope: 'https://example.test/app/' }, addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => { skip++; }, clients: { matchAll: async () => clients, claim: async () => { claimed++; } } }
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context);
  const dispatch = async (type, event = {}) => {
    let pending;
    handlers[type]({ ...event, waitUntil: promise => { pending = promise; }, respondWith: promise => { pending = promise; } });
    return pending;
  };
  await dispatch('install');
  assert.equal(skip, 0, 'Install must never force activation');
  assert.equal(requests.length, shellUrls.length);
  requests.forEach(request => { assert.equal(request.cache, 'reload'); assert.match(request.integrity, /^sha256-/); });
  const current = vm.runInContext('CACHE_NAME', context);
  const prefix = vm.runInContext('SHELL_PREFIX', context);
  stores.set(prefix + 'older', new Map());
  stores.set(prefix + 'previous', new Map());
  stores.set('unrelated-app', new Map());
  stores.set('p274-v3-scripture-v3', new Map());
  await dispatch('activate');
  assert.equal(claimed, 1);
  assert.deepEqual(deleted, [prefix + 'older']);
  const message = { data: { type: 'ACTIVATE_SAFE' }, source: { id: 'one' }, ports: [{ postMessage() {} }] };
  clients.push({ id: 'two', url: 'https://example.test/app/' });
  await dispatch('message', message);
  assert.equal(skip, 0, 'Multiple tabs must defer updates');
  clients.pop();
  await dispatch('message', { ...message, source: { id: 'other' } });
  assert.equal(skip, 0);
  await dispatch('message', message);
  assert.equal(skip, 1);
  const html = new Response('verified release');
  stores.get(current).set('https://example.test/app/index.html', html);
  assert.equal(await (await dispatch('fetch', { request: { method: 'GET', url: 'https://example.test/app/?test=1', mode: 'navigate' } })).text(), 'verified release');
  const url = 'https://example.test/app/original-data/hebrew-lexicon.js';
  stores.get(current).set(url, new Response('new lexicon'));
  stores.get('p274-v3-scripture-v3').set(url, new Response('old lexicon'));
  assert.equal(await (await dispatch('fetch', { request: new Request(url) })).text(), 'new lexicon');
  failInstall = true;
  await assert.rejects(dispatch('install'), /Partial deployment/);
  assert(stores.has(prefix + 'previous'));
  assert(stores.has('unrelated-app') && stores.has('p274-v3-scripture-v3'));
}

function clientFixture(protocol = 'https:', options = {}) {
  const listeners = {}, intervals = {}, storage = new Map();
  let time = 100000, safe = options.safe ?? true, prepared = true, reloads = 0, activations = 0, checks = 0, prompts = 0;
  let accept = false, multiTab = false, confirmHook;
  const button = { textContent: '', hidden: true, classList: { toggle: (_, value) => { button.hidden = value; } },
    addEventListener: (type, fn) => { listeners['button:' + type] = fn; } };
  const context = {
    console, setTimeout, clearTimeout, Date: { now: () => time },
    setInterval: (fn, ms) => { intervals[ms] = fn; },
    location: { protocol, reload: () => { reloads++; } },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { readyState: 'complete', visibilityState: 'visible', activeElement: { matches: () => false },
      getElementById: () => button, addEventListener: (type, fn) => { listeners[type] = fn; } },
    window: { getSelection: () => '', AppUpdateBridge: { isSafe: () => safe, prepareReload: () => prepared },
      confirm: () => { prompts++; confirmHook?.(); return accept; },
      addEventListener: (type, fn) => { listeners[type] = fn; } },
    MessageChannel: class {
      constructor() { this.port1 = { close() {} }; this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage({ data })) }; }
    }
  };
  const makeWorker = release => ({ state: 'installing',
    addEventListener: (type, fn) => { listeners[release + ':' + type] = fn; },
    postMessage: (data, ports) => {
    if (data.type === 'GET_RELEASE') ports[0].postMessage({ release });
    else {
      if (multiTab) { ports[0].postMessage({ activated: false }); return; }
      activations++;
      const worker = registration.waiting;
      registration.waiting = null;
      context.navigator.serviceWorker.controller = worker;
      listeners.controllerchange();
      ports[0].postMessage({ activated: true });
    }
  } });
  const next = makeWorker('new');
  const registration = { waiting: options.waiting === false ? null : next,
    installing: options.installing ? next : null,
    addEventListener: (type, fn) => { listeners[type] = fn; }, update: async () => { checks++; } };
  context.navigator = { onLine: true, serviceWorker: { controller: options.firstInstall ? null : {},
    register: async (url, options) => { assert.equal(options.updateViaCache, 'none'); return registration; },
    addEventListener: (type, fn) => { listeners[type] = fn; } } };
  vm.createContext(context);
  vm.runInContext(updateSource, context);
  return { context, listeners, intervals, storage, registration, next, makeWorker, button,
    idle: () => { time += 31000; }, safe: value => { safe = value; }, prepare: value => { prepared = value; },
    accept: value => { accept = value; }, multiTab: value => { multiTab = value; }, onConfirm: fn => { confirmHook = fn; },
    result: () => ({ reloads, activations, checks, prompts }) };
}

async function clientTests() {
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const local = clientFixture('file:');
  await flush();
  assert.deepEqual(Object.keys(local.intervals), []);
  const test = clientFixture();
  await flush();
  const apply = () => test.intervals[5000]();
  assert.equal(test.result().checks, 1, 'Every page load checks for an update');
  assert.equal(test.result().prompts, 1, 'A downloaded update requests consent on load');
  await apply();
  assert.equal(test.result().activations, 0);
  test.idle(); await apply();
  assert.equal(test.result().prompts, 1, 'Cancel must not trigger repeated dialogs');
  assert.equal(test.result().activations, 0, 'Idle time cannot substitute for consent');
  assert.equal(test.button.hidden, false, 'A cancelled update remains available by button');
  test.idle(); test.safe(false);
  await test.listeners['button:click']();
  assert.equal(test.result().activations, 0, 'Modal/editing/memory-only state blocks activation');
  test.safe(true); test.context.document.visibilityState = 'hidden';
  await apply();
  assert.equal(test.result().activations, 0);
  test.context.document.visibilityState = 'visible';
  test.context.document.activeElement.matches = () => true;
  await apply();
  assert.equal(test.result().activations, 0);
  test.context.document.activeElement.matches = () => false;
  test.accept(true);
  await test.listeners['button:click']();
  assert.equal(test.result().activations, 1);
  assert.equal(test.result().prompts, 2, 'The button allows explicit reconsideration');
  test.prepare(false); await apply();
  assert.equal(test.result().reloads, 0, 'Failed snapshot must prevent reload');
  test.prepare(true); test.context.navigator.onLine = false; await apply();
  assert.equal(test.result().reloads, 0);
  test.context.navigator.onLine = true;
  test.idle(); test.listeners.pointerdown();
  await apply();
  assert.equal(test.result().reloads, 0, 'New interaction after approval postpones reload');
  test.idle();
  await apply(); await apply();
  assert.equal(test.result().reloads, 1);
  assert.equal(JSON.parse(test.storage.get('p274_update_last_reload')).release, 'new');

  const unsafe = clientFixture('https:', { safe: false });
  await flush();
  assert.equal(unsafe.result().prompts, 0, 'Do not interrupt unsaved work with a dialog');
  unsafe.safe(true); unsafe.prepare(false); unsafe.accept(true);
  await unsafe.intervals[5000]();
  assert.equal(unsafe.result().activations, 0, 'Storage failure blocks activation as well as reload');

  const tabs = clientFixture();
  await flush();
  tabs.accept(true); tabs.multiTab(true);
  await tabs.listeners['button:click']();
  assert.equal(tabs.result().activations, 0);
  assert.match(tabs.button.textContent, /다른 앱 창/);
  tabs.multiTab(false);
  tabs.registration.waiting = tabs.makeWorker('newer');
  tabs.accept(false);
  await tabs.intervals[5000]();
  assert.equal(tabs.result().prompts, 3, 'A newer release needs its own consent');
  assert.equal(tabs.result().activations, 0);

  const race = clientFixture();
  await flush();
  race.accept(true);
  race.onConfirm(() => { race.registration.waiting = race.makeWorker('replacement'); });
  await race.listeners['button:click']();
  assert.equal(race.result().activations, 0, 'Never apply a worker replaced during confirmation');

  const installing = clientFixture('https:', { waiting: false, installing: true });
  await flush();
  assert.equal(installing.result().prompts, 0);
  installing.next.state = 'installed';
  installing.registration.waiting = installing.next;
  installing.listeners['new:statechange']();
  await flush();
  assert.equal(installing.result().prompts, 1, 'Watch an installation already running at registration');

  const first = clientFixture('https:', { firstInstall: true, waiting: false });
  await flush();
  first.context.navigator.serviceWorker.controller = first.next;
  first.listeners.controllerchange();
  await flush();
  assert.equal(first.result().prompts, 0, 'First installation is not a pending update');
  assert.equal(first.result().reloads, 0);

  const changed = clientFixture('https:', { waiting: false });
  await flush();
  changed.context.navigator.serviceWorker.controller = changed.next;
  changed.listeners.controllerchange();
  await flush();
  assert.equal(changed.result().prompts, 1, 'External activation still needs consent before reloading this page');
  assert.equal(changed.result().reloads, 0);
  changed.accept(true);
  changed.storage.set('p274_update_last_reload', JSON.stringify({ release: 'new', at: 100000 }));
  await changed.listeners['button:click']();
  assert.equal(changed.result().reloads, 0, 'Repeated reload of the same release is blocked');

  const refreshed = clientFixture();
  await flush();
  assert.equal(refreshed.result().prompts, 1, 'A fresh page may offer a previously deferred release again');
}

(async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const url of shellUrls.filter(url => /\.(js|css)\?/.test(url))) assert(html.includes(url.slice(2)), url);
  await workerTests();
  await clientTests();
  console.log('Update checks passed: integrity install, release-specific consent, cancellation/retry, load/install/controller changes, multi-tab and storage guards, offline/local behavior and single reload.');
})().catch(error => { console.error(error); process.exitCode = 1; });
