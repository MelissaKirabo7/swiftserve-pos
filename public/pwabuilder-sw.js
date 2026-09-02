// Replacement worker at the old PWABuilder service worker path.
// The previous worker cached every navigation with StaleWhileRevalidate and
// fell back to a page that never existed, which served blank/stale HTML.
// This version evicts its own caches and unregisters itself.

function isOldAppCache(name) {
  return (
    name === "pwabuilder-offline-page" ||
    /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name)
  );
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const stale = cacheNames.filter(isOldAppCache);
        await Promise.allSettled(stale.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
