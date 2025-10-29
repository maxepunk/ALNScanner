/**
 * Service Worker for ALN GM Scanner
 * Enables PWA functionality and offline support for standalone mode
 */

const CACHE_NAME = 'aln-gm-scanner-v3-local-socketio';
const urlsToCache = [
  './',
  './index.html',
  './data/tokens.json',
  '/socket.io-client/socket.io.min.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker
        self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when available
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip caching for API requests and discovery scans
  if (url.pathname.startsWith('/api/') ||
      event.request.url.includes('/api/') ||
      event.request.url.includes('localhost:3000') ||
      event.request.url.includes(':8080') ||
      event.request.url.match(/192\.168\.\d+\.\d+/)) {
    // Let API and discovery requests go directly to network
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response from cache
        if (response) {
          return response;
        }

        // Clone the request for fetch
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone response for cache
          const responseToCache = response.clone();

          // Only cache GET requests
          if (event.request.method === 'GET') {
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        }).catch((error) => {
          // Network request failed
          console.log('Service Worker: Fetch failed for', event.request.url, error);

          // For navigation requests, return cached index page
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }

          // For API requests, let them fail naturally (don't intercept)
          if (event.request.url.includes('/api/')) {
            throw error;
          }

          // Return a proper error response for other requests
          return new Response('Network request failed', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});