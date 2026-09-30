// Remi's service worker: keeps the app working offline once installed, and handles
// clicks on reminder notifications ("Mark done" / "Snooze").
// Bump VERSION whenever app files change so phones pick up the new version.
const VERSION = 'remi-v3';
const APP_SHELL = [
  './', 'index.html', 'style.css', 'pixel.js', 'pet.js', 'music.js', 'sfx.js', 'app.js', 'chat.js',
  'cover.jpg', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Network first (so updates show up), falling back to the cache when offline.
// Music is large, so it is cached the first time it plays and served from the cache after.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has('range')) return; // let the browser stream audio directly
  const isMusic = req.url.includes('/music/');
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isMusic) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html'));
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  const id = event.notification.data && event.notification.data.id;
  const action = event.action || 'open';
  event.notification.close();
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (tabs.length) {
      const tab = tabs[0];
      if (id && action !== 'open') tab.postMessage({ action, id });
      return tab.focus();
    }
    const url = id && action !== 'open' ? `./?action=${action}&id=${encodeURIComponent(id)}` : './';
    return self.clients.openWindow(url);
  })());
});
