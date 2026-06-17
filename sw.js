/* =============================================
   sw.js — QuizMaster Pro Service Worker
   Caches app shell for offline use.
   ============================================= */

const CACHE_NAME   = 'qm-pro-v1';
const CACHE_STATIC = 'qm-static-v1';

// Core app shell — always cached
const SHELL_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/oldstatic.js',
  '/pomodoro.js',
  '/pomodoro-race.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: cache app shell ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────
// App shell   → Cache first, then network
// Supabase    → Network only (always fresh data)
// Google Fonts → Network first, cache fallback
// Everything else → Network first, cache fallback

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Supabase API — always network, never cache
  if (url.hostname.includes('supabase.co')) return;

  // App shell files — cache first
  if (SHELL_URLS.some(u => url.pathname === u || url.pathname.endsWith(u.replace('/',''))) ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
