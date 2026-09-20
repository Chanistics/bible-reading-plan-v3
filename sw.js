/* RELEASE_START */
const RELEASE = {"id":"4c79bf70ed74da2205d5","assets":[{"url":"./","integrity":"sha256-A3m7sc3i5hQ5LU/lBkvYwft6mE9FUI7ujQYFhtLTlJw="},{"url":"./index.html","integrity":"sha256-A3m7sc3i5hQ5LU/lBkvYwft6mE9FUI7ujQYFhtLTlJw="},{"url":"./style.css?v=57","integrity":"sha256-0RPg2EOMtF+iBXVHQO8Ev2ZC9xeIZY9HOmyDzejUjVg="},{"url":"./bible-data.js?v=2","integrity":"sha256-I+4bNB56G/T5Tvo9idDuKdjLhaKmYH+pOdt/JdNg+fE="},{"url":"./parasha-data.js","integrity":"sha256-YBo/2/kuO0uy1jxu0jYTBU55QujwbxIxIvHhXwggsEU="},{"url":"./parasha-details.js","integrity":"sha256-Zm+KVk+oVaAm1p9ZYKAQs3snm0m5epRkK/TC8GdWPgc="},{"url":"./torah-guide-data.js","integrity":"sha256-arfAHPGyQEtF0DIai7L5dlnXqlJSohac2WlG73kEL9U="},{"url":"./calendar-data.js","integrity":"sha256-DqwL73HFG286h0G5uut+CKERNedXqsngE8y+cFwZ3Lg="},{"url":"./hebcal.js","integrity":"sha256-8YokGzE0jVdryXWmQUkmKIEYOf3FO3y8pp4DaD6TPc4="},{"url":"./generator.js?v=2","integrity":"sha256-Ln1faFQn28QkyCeH792KKI9X9rP9zm1+W1p4nsk7v3g="},{"url":"./festival-readings-data.js?v=1","integrity":"sha256-S+Xhd5SBphSTzO6IvREiZ58Ce/1Ngm9+UgY1MtF4WMQ="},{"url":"./festival-readings.js?v=1","integrity":"sha256-jy8lqPFRxnV3udJgHq/qM57A4A/hhoM3LbKoJ4cACU4="},{"url":"./original-language-data.js?v=1","integrity":"sha256-p2umNyQgsV/7p7wIljLRYaTUWKoIjzBbo0HUiXa5wfw="},{"url":"./original-data/index.js","integrity":"sha256-YTIdRkWZxBiNRutNw3wYzJKZeAZg1yHk55d/itNPmA0="},{"url":"./korean-data/index.js","integrity":"sha256-umZ1ZRzoDix8HjsAS4MFaonTfbcN72DnzxblfJai1Sg="},{"url":"./original-data/hebrew-lexicon.js","integrity":"sha256-1yVmsSv+7g533p0NRfVkUkAX9/GIHlUQIIsVAZqjSGI="},{"url":"./original-data/greek-lexicon.js","integrity":"sha256-iy8MBkeOsyFaBqrybXaKhLzBHn1DTAX+Aw4BOQtetSI="},{"url":"./original-data/kjv1769-strong/index.js","integrity":"sha256-nDuNICNC6xikWMxFinIG9K+iAUvTBuj8wqle52nwWbQ="},{"url":"./app.js?v=67","integrity":"sha256-sBCXCfbf3lc56NVSc83ktIqF4TWSDMOJohsyQ9rovjo="},{"url":"./app-update.js?v=1","integrity":"sha256-cEgvAou5BsQv2Qj3Jt52NEEPs+fDWUNuhabBtR+7MBE="},{"url":"./manifest.json?v=2","integrity":"sha256-ghNxW+n3/avHkqHVtmdP8/4yurY1JF86+OAwj4dONs4="},{"url":"./icon-192.png?v=2","integrity":"sha256-svgwK89lbF9GbZXz8iF9nLebtAZZVxC9D/9zn8lqjDM="},{"url":"./icon-512.png?v=2","integrity":"sha256-z8A5wv95Y9rlu8Axawhy2uZ6/FA9YejeLGBjoKsKQNQ="},{"url":"./icon-1024.png?v=2","integrity":"sha256-6COYtLQ+dSMSRtkNxcZUYnprIM+K3KpfCDNnLQS9wFQ="},{"url":"./apple-touch-icon.png?v=2","integrity":"sha256-EiVHKFz2gldRvBdPMQagglqJSuOWuwd/qLZfsuZNkbg="},{"url":"./hero.png","integrity":"sha256-Q7WaUmMYdFUQyZbCpleK7gNHXwb0U/zpvdHX1es11R0="}]};
/* RELEASE_END */
const SHELL_PREFIX = `p274-shell:${self.registration.scope}:`;
const CACHE_NAME = SHELL_PREFIX + RELEASE.id;
const RUNTIME_CACHE_NAME = 'p274-v3-scripture-v3';
const scope = new URL(self.registration.scope);

self.addEventListener('install', event => {
  // Integrity checks reject incomplete/mixed deployments without replacing the working release.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(RELEASE.assets.map(asset => new Request(new URL(asset.url, scope), {
        cache: 'reload', integrity: asset.integrity
      })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the preceding release for in-flight old requests; never delete another app's caches.
    const names = (await caches.keys()).filter(name => name.startsWith(SHELL_PREFIX) && name !== CACHE_NAME);
    await Promise.all(names.slice(0, -1).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const reply = data => event.ports[0]?.postMessage(data);
  if (event.data?.type === 'GET_RELEASE') reply({ release: RELEASE.id });
  if (event.data?.type !== 'ACTIVATE_SAFE') return;
  event.waitUntil((async () => {
    const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(scope.href));
    // An unresponsive/background tab may hold unsaved work, so a missing reply is never consent.
    if (clients.length !== 1 || clients[0].id !== event.source?.id) {
      reply({ activated: false });
      return;
    }
    reply({ activated: true });
    await self.skipWaiting();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const shell = await caches.open(CACHE_NAME);
    const isEntry = event.request.mode === 'navigate' &&
      (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');
    const cached = await shell.match(isEntry ? new URL('index.html', scope).href : event.request);
    if (cached) return cached;
    const isScripture = url.pathname.startsWith(scope.pathname + 'original-data/') ||
      url.pathname.startsWith(scope.pathname + 'korean-data/');
    if (!isScripture) return fetch(event.request);
    const runtime = await caches.open(RUNTIME_CACHE_NAME);
    const scripture = await runtime.match(event.request);
    if (scripture) return scripture;
    const response = await fetch(event.request);
    if (response.ok) {
      try { await runtime.put(event.request, response.clone()); } catch (_) { /* Reading still works when storage is full. */ }
    }
    return response;
  })());
});
