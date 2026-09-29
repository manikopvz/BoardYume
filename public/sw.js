const CACHE_VERSION = 'board-yume-v3';
const CORE = ['', 'index.html', 'manifest.webmanifest'];
const MANIFEST_FILE = ['manifest', 'json'].join('.');

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

async function findManifest() {
  for (const root of ['assets/', 'public/assets/']) {
    try {
      const response = await fetch(scopedUrl(`${root}${MANIFEST_FILE}`), { cache: 'no-cache' });
      if (response.ok) return { root, manifest: await response.json() };
    } catch {
      // Try the direct-source layout next.
    }
  }
  return null;
}

function manifestAssetPaths(root, manifest) {
  return [...new Set(Object.values(manifest.assets || {}).map((asset) => asset.src).filter(Boolean))]
    .map((path) => `${root}${path.replace(/^\/?assets\//, '')}`);
}

async function documentAssets() {
  try {
    const response = await fetch(scopedUrl('index.html'), { cache: 'no-cache' });
    if (!response.ok) return [];
    const markup = await response.text();
    return [...markup.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((path) => !/^(?:https?:|data:|#)/i.test(path));
  } catch {
    return [];
  }
}

async function moduleGraph(initialPaths) {
  const scope = self.registration.scope;
  const queue = initialPaths.filter((path) => /\.js(?:$|[?#])/i.test(path));
  const discovered = new Set();

  while (queue.length) {
    const path = queue.shift();
    const absolute = new URL(path, scope);
    if (absolute.origin !== self.location.origin || !absolute.href.startsWith(scope)) continue;
    const relative = absolute.href.slice(scope.length);
    if (discovered.has(relative)) continue;
    discovered.add(relative);

    try {
      const response = await fetch(absolute.href, { cache: 'no-cache' });
      if (!response.ok) continue;
      const source = await response.text();
      for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+\.js)["']/g)) {
        const imported = new URL(match[1], absolute);
        if (imported.origin === self.location.origin && imported.href.startsWith(scope)) {
          queue.push(imported.href.slice(scope.length));
        }
      }
    } catch {
      // A missing optional module must not block the rest of the offline cache.
    }
  }
  return [...discovered];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(CORE.map((path) => cache.add(scopedUrl(path))));

    const [located, linkedFiles] = await Promise.all([findManifest(), documentAssets()]);
    const modules = await moduleGraph(linkedFiles);
    const optional = [...linkedFiles, ...modules];
    if (located) {
      optional.push(`${located.root}${MANIFEST_FILE}`, ...manifestAssetPaths(located.root, located.manifest));
    }
    await Promise.allSettled([...new Set(optional)].map((path) => cache.add(scopedUrl(path))));
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
