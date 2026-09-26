const CACHE_NAME = 'aylin-stream-cache-v2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests from same origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // NEVER intercept /api/ or dynamic streaming /watch/ routes
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/watch/')) {
    return;
  }

  // Only cache static build assets (_next/static, fonts, icons)
  const isStaticAsset = url.pathname.startsWith('/_next/static/') ||
                        url.pathname.endsWith('.png') ||
                        url.pathname.endsWith('.ico') ||
                        url.pathname.endsWith('.json') ||
                        url.pathname.endsWith('.woff2');

  if (!isStaticAsset) {
    // For normal pages, let the browser handle network natively
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
