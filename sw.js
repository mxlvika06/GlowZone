// Glow-Up OS service worker — makes the app load offline and be installable.
// Strategy: precache the app shell, then "stale-while-revalidate" for everything
// else (serve the cached copy instantly, refresh it in the background).
// Bump CACHE_NAME whenever files change so old caches are cleaned up.
const CACHE_NAME = 'glowup-cache-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/schema.js',
  './js/router.js',
  './js/components.js',
  './js/habits.js',
  './js/theme.js',
  './js/utils.js',
  './js/focusEngine.js',
  './js/sections/dashboard.js',
  './js/sections/fitness.js',
  './js/sections/badminton.js',
  './js/sections/skincare.js',
  './js/sections/haircare.js',
  './js/sections/posture.js',
  './js/sections/social.js',
  './js/sections/study.js',
  './js/sections/focusTimer.js',
  './js/sections/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each file independently (not addAll) so one missing/renamed
      // file can't silently blank out the entire offline app shell — a
      // genuine failure is still logged instead of swallowed.
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('[sw] failed to precache', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const network = fetch(req)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') cache.put(req, response.clone());
        return response;
      })
      .catch(() => null);

    if (cached) { event.waitUntil(network); return cached; } // instant, refreshed in background
    const fresh = await network;
    if (fresh) return fresh;
    // Offline and not cached: a page navigation still gets the app shell.
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline and this file was not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
