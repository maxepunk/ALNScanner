/**
 * Service Worker for ALN GM Scanner.
 * Strategy: NO precache list (avoids atomic-install 404s — SW-2). App shell is
 * runtime-cached on first fetch; navigations fall back to the cached shell when
 * offline. API + discovery + socket.io traffic always goes to the network.
 */
const CACHE_NAME = 'aln-gm-scanner-runtime-v1';

self.addEventListener('install', () => {
  // No addAll() — nothing to fail. Activate immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

const isBypass = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/socket.io/') ||
  /:(3000|8080)(\/|$)/.test(url.host + url.pathname) ||
  /\b\d+\.\d+\.\d+\.\d+\b/.test(url.host);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isBypass(url)) return; // let network handle it

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('./')))
    );
    return;
  }

  // Static assets: cache-first, populate on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return resp;
      });
    })
  );
});
