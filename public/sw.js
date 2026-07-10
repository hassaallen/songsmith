// Minimal service worker: caches the app shell so the UI loads offline.
// API calls (api/*) are always network — never cached — so data stays fresh.
const CACHE = 'songsmith-v14';
const SHELL = [
  '.', 'index.html', 'css/app.css', 'js/api.js', 'js/app.js', 'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  // cache:'reload' bypasses the HTTP cache — a new SW version must never
  // populate its cache with stale assets the browser was sitting on.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache the API — always go to network.
  if (url.pathname.includes('/api/')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
