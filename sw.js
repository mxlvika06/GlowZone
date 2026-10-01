// Glow-Up OS service worker
// Makes the app load offline and be installable.

const CACHE_NAME = 'glowup-cache-v6';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './store.js',
  './schema.js',
  './router.js',
  './components.js',
  './habits.js',
  './theme.js',
  './utils.js',
  './focusEngine.js',
  './dashboard.js',
  './fitness.js',
  './badminton.js',
  './skincare.js',
  './haircare.js',
  './posture.js',
  './social.js',
  './study.js',
  './focusTimer.js',
  './settings.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch((err) =>
              console.warn('[sw] failed to precache', url, err)
            )
        )
      )
    )
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      const cached = await cache.match(req, {
        ignoreSearch: req.mode === 'navigate'
      });

      const network = fetch(req)
        .then((response) => {
          if (
            response &&
            response.ok &&
            response.type === 'basic'
          ) {
            cache.put(req, response.clone());
          }

          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;

      if (fresh) return fresh;

      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');

        if (shell) return shell;
      }

      return new Response(
        'Offline and this file was not cached yet.',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/plain'
          }
        }
      );
    })()
  );
});
