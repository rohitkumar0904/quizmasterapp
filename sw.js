/* =============================================
   QuizMaster Pro Service Worker
   Offline support + auto updates
============================================= */
const CACHE_STATIC = 'qm-static-v4';  // v3 → v4

const SHELL_URLS = [
  '/',
  '/index.html',
  '/index2.html',   // ← ADD
  '/app.js',
  '/oldstatic.js',
  '/pomodoro.js',
  '/pomodoro-race.js',
  '/qm-cache.js',
  '/qm-sidebar-chat.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
// rest stays the same

/* Install */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
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

  /* App shell: stale-while-revalidate */
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_STATIC).then(cache => {
                cache.put(event.request, response.clone());
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
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(event.request, response.clone());
          });
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
