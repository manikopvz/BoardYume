const CACHE_VERSION = 'board-yume-v2';
const PRECACHE = [
  '',
  'index.html',
  'manifest.webmanifest',
  'assets/manifest.json',
  'assets/audio/music/day-garden.ogg',
  'assets/audio/music/night-garden.ogg',
  'assets/audio/sfx/footstep.ogg',
  'assets/audio/sfx/hoe.ogg',
  'assets/audio/sfx/water.ogg',
  'assets/audio/sfx/seed.ogg',
  'assets/audio/sfx/harvest.ogg',
  'assets/audio/sfx/chop.ogg',
  'assets/audio/sfx/mine.ogg',
  'assets/audio/sfx/pickup.ogg',
  'assets/audio/sfx/build.ogg',
  'assets/audio/sfx/complete.ogg',
  'assets/audio/sfx/click.ogg',
  'assets/audio/sfx/buy.ogg',
  'assets/audio/sfx/sell.ogg',
  'assets/audio/sfx/rain.ogg',
  'assets/audio/sfx/birds.ogg',
  'assets/audio/sfx/wind.ogg',
  'assets/audio/sfx/insects.ogg',
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE.map(scopedUrl));
    const response = await fetch(scopedUrl('assets/manifest.json'));
    if (!response.ok) return;
    const manifest = await response.clone().json();
    const paths = [...new Set(Object.values(manifest.assets || {}).map((asset) => asset.src).filter(Boolean))]
      .map((path) => path.replace(/^\//, ''));
    await Promise.allSettled(paths.map((path) => cache.add(scopedUrl(path))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match(scopedUrl('index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
