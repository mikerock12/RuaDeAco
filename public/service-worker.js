/* global self, caches, fetch, importScripts */
importScripts(new URL('precache-manifest.js', self.location.href).href);

const manifest = self.__RUA_DE_ACO_PRECACHE__;
const scopeUrl = new URL(self.registration.scope);
let scopeHash = 2166136261;
for (const character of scopeUrl.pathname) {
  scopeHash = Math.imul(scopeHash ^ character.charCodeAt(0), 16777619) >>> 0;
}
const scopeKey = scopeHash.toString(36);
const cachePrefix = 'rua-de-aco-' + scopeKey + '-';
const cacheName = cachePrefix + manifest.revision;
const scoped = (path) => new URL(path, scopeUrl).href;
const precacheUrls = manifest.files.map(scoped);
const indexUrl = scoped('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(precacheUrls)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => {
        const legacy = /^rua-de-aco-[a-f0-9]{12}$/.test(key);
        return key !== cacheName && (key.startsWith(cachePrefix) || legacy);
      }).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href) || request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      const cachedIndex = await cache.match(indexUrl);
      return cachedIndex ?? new Response('Rua de Aço está offline e ainda não concluiu o primeiro carregamento.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }));
    return;
  }

  // Online sempre consulta a origem. O fallback ignora somente a query dentro
  // do cache da revisão atual, permitindo usar o PNG precacheado sem reabrir a
  // porta para arquivos de revisões antigas.
  event.respondWith(caches.open(cacheName).then(async (cache) => {
    try {
      const response = await fetch(request);
      if (response.ok) void cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request)
        ?? await cache.match(request, { ignoreSearch: true });
      return cached ?? new Response('Asset indisponível offline.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }));
});
