#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(root, 'app-update.js'), 'utf8');
const shellUrls = JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa-shell.json'), 'utf8'));

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

function clientFixture(protocol = 'https:') {
  const listeners = {}, intervals = {}, storage = new Map();
  let time = 100000, safe = true, prepared = true, reloads = 0, activations = 0, checks = 0;
  const context = {
    console, setTimeout, clearTimeout, Date: { now: () => time },
    setInterval: (fn, ms) => { intervals[ms] = fn; },
    location: { protocol, reload: () => { reloads++; } },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { readyState: 'complete', visibilityState: 'visible', activeElement: { matches: () => false },
      getElementById: () => ({ classList: { toggle() {} } }), addEventListener: (type, fn) => { listeners[type] = fn; } },
    window: { getSelection: () => '', AppUpdateBridge: { isSafe: () => safe, prepareReload: () => prepared },
      addEventListener: (type, fn) => { listeners[type] = fn; } },
    MessageChannel: class {
      constructor() { this.port1 = { close() {} }; this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage({ data })) }; }
    }
  };
  const next = { postMessage: (data, ports) => {
    if (data.type === 'GET_RELEASE') ports[0].postMessage({ release: 'new' });
    else {
      activations++;
      registration.waiting = null;
      context.navigator.serviceWorker.controller = next;
      listeners.controllerchange();
      ports[0].postMessage({ activated: true });
    }
  } };
  const registration = { waiting: next, addEventListener() {}, update: async () => { checks++; } };
  context.navigator = { onLine: true, serviceWorker: { controller: {},
    register: async (url, options) => { assert.equal(options.updateViaCache, 'none'); return registration; },
    addEventListener: (type, fn) => { listeners[type] = fn; } } };
  vm.createContext(context);
  vm.runInContext(updateSource, context);
  return { context, listeners, intervals, storage, registration,
    idle: () => { time += 31000; }, safe: value => { safe = value; }, prepare: value => { prepared = value; },
    result: () => ({ reloads, activations, checks }) };
}

async function clientTests() {
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const local = clientFixture('file:');
  await flush();
  assert.deepEqual(Object.keys(local.intervals), []);
  const test = clientFixture();
  await flush();
  const apply = () => test.intervals[5000]();
  await apply();
  assert.equal(test.result().activations, 0);
  test.idle(); test.safe(false);
  await apply();
  assert.equal(test.result().activations, 0, 'Modal/editing/memory-only state blocks activation');
  test.safe(true); test.context.document.visibilityState = 'hidden';
  await apply();
  assert.equal(test.result().activations, 0);
  test.context.document.visibilityState = 'visible';
  test.context.document.activeElement.matches = () => true;
  await apply();
  assert.equal(test.result().activations, 0);
  test.context.document.activeElement.matches = () => false;
  test.listeners.pointerdown();
  await apply();
  assert.equal(test.result().activations, 0, 'Recent interaction resets idle time');
  test.idle(); await apply();
  assert.equal(test.result().activations, 1);
  test.prepare(false); await apply();
  assert.equal(test.result().reloads, 0, 'Failed snapshot must prevent reload');
  test.prepare(true); test.context.navigator.onLine = false; await apply();
  assert.equal(test.result().reloads, 0);
  test.context.navigator.onLine = true;
  await apply(); await apply();
  assert.equal(test.result().reloads, 1);
  assert.equal(JSON.parse(test.storage.get('p274_update_last_reload')).release, 'new');
}

(async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const url of shellUrls.filter(url => /\.(js|css)\?/.test(url))) assert(html.includes(url.slice(2)), url);
  await workerTests();
  await clientTests();
  console.log('Update checks passed: integrity install, failed release, scoped cache retention, multi-tab deferral, safe idle gate, offline/local behavior and single reload.');
})().catch(error => { console.error(error); process.exitCode = 1; });
