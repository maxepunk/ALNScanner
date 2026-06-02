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

// Bypass backend traffic by PATH only. Host/port checks are wrong here: in
// production the app and API share the origin https://<IP>:3000 (app at
// /gm-scanner/), so a host/port bypass matches the app's OWN assets and makes
// the runtime cache inert. In dev the app (localhost:8443) is a different
// origin from the backend, so the SW scope already excludes backend requests.
const isBypass = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/socket.io/');

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
