/* =============================================
   QuizMaster Pro Service Worker
   Offline support + auto updates
============================================= */
const CACHE_STATIC = 'qm-static-v13';
const CACHE_DYNAMIC = 'qm-dynamic-v13';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/oldstatic.js',
  '/pomodoro.js',
  '/pomodoro-race.js',
  '/qm-cache.js',
  '/qm-sidebar-chat.js',
  '/tracker.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
/* Install */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});
/* Message — force update from UI */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
/* Activate */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => ![CACHE_STATIC, CACHE_DYNAMIC].includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});
/* Fetch */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  /* Supabase: always network */
  if (url.hostname.includes('supabase.co')) {
    return;
  }
  /* index.html — network-first (hamesha fresh HTML milega) */
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  /* JS/CSS/assets — stale-while-revalidate */
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_STATIC).then(cache => {
                cache.put(event.request, clone);
              });
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }
  /* Everything else: network first */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (
          response &&
          response.status === 200 &&
          response.type !== 'opaque'
        ) {
          const clone = response.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
