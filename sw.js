const CACHE_NAME = 'p274-v3-shell-v40';
const RUNTIME_CACHE_NAME = 'p274-v3-scripture-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css?v=52',
  './bible-data.js',
  './parasha-data.js',
  './parasha-details.js',
  './torah-guide-data.js',
  './calendar-data.js',
  './hebcal.js',
  './generator.js?v=2',
  './original-language-data.js?v=1',
  './original-data/index.js',
  './korean-data/index.js',
  './original-data/hebrew-lexicon.js',
  './original-data/greek-lexicon.js',
  './original-data/kjv1769-strong/index.js',
  './app.js?v=62',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './hero.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== RUNTIME_CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isScriptureData = url.origin === self.location.origin &&
    (url.pathname.includes('/original-data/') || url.pathname.includes('/korean-data/'));

  if (isScriptureData) {
    event.respondWith(
      caches.open(RUNTIME_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
