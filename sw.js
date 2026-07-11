const CACHE_NAME = 'parashat-tracker-v3-original-language-v26';
const urlsToCache = [
  './',
  './index.html',
  './style.css?v=47',
  './bible-data.js',
  './parasha-data.js',
  './parasha-details.js',
  './hebcal.js',
  './generator.js',
  './original-language-data.js?v=1',
  './original-data/index.js',
  './original-data/hebrew-lexicon.js',
  './original-data/greek-lexicon.js',
  './original-data/kjv1769-strong/index.js',
  './app.js?v=50',
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
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
