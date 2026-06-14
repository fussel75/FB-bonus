/**
 * BonusTrack Service Worker — minimaler Offline-Fallback
 *
 * Strategie:
 *   - Statische Assets (JS/CSS/Bilder): cache-first
 *   - API-Calls (/api/*): network-first, KEIN Caching
 *     (Bonus-Daten dürfen nie veraltet ausgespielt werden)
 *   - HTML-Navigation: network-first mit Cache-Fallback (Offline-Seite)
 */

const CACHE_VERSION = 'bonustrack-v1';
const PRECACHE = [
  '/',
  '/favicon.ico',
  '/site.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API-Calls: NIE cachen (Geschäftsdaten müssen aktuell sein)
  if (url.pathname.startsWith('/api/')) return;

  // GET-Anfragen mit cache-first für statische Assets
  if (request.method === 'GET' && /\.(js|css|png|jpg|svg|webp|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        return res;
      })),
    );
    return;
  }

  // HTML-Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/')),
    );
  }
});
