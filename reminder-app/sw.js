// Handles clicks on reminder notifications ("Mark done" / "Snooze").
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
