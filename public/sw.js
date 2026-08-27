/*
 * Hostello PMS service worker.
 *
 * This app is entirely server-rendered per signed-in user, so caching HTML would
 * risk handing one account's pages to another. The rule here is deliberately narrow:
 *
 *   - content-hashed build assets and app icons  -> cache-first (safe, immutable)
 *   - page navigations                           -> network-only, /offline on failure
 *   - everything else (Server Actions, RSC payloads, Supabase) -> untouched
 *
 * It also receives Web Push: the payload carries only what the OS banner shows
 * plus the URL to open, never anything the recipient could not already read.
 *
 * Bump CACHE_VERSION to evict old caches on the next deploy.
 */

const CACHE_VERSION = "v3";
const STATIC_CACHE = `hostello-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll([OFFLINE_URL, "/icons/icon-192.png?v=2", "/icons/icon-512.png?v=2"])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ||
          new Response("You're offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      })
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

/* ── Push ──────────────────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "Hostello", body: event.data.text() };
    }
  }

  const title = payload.title || "Hostello";
  const tag = payload.tag || "hostello";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png?v=2",
      badge: "/icons/icon-192.png?v=2",
      // Same tag replaces the earlier banner instead of stacking a duplicate.
      tag,
      renotify: true,
      // The Android app posts these on a high-importance channel, which already
      // vibrates; this is what makes the rest (older Android, desktop) buzz too.
      vibrate: [200, 100, 200],
      requireInteraction: payload.category === "critical",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Reuse a tab that is already on the target, then any open tab, and only
      // open a new window when Hostello is not running at all.
      for (const client of clientList) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      const open = clientList.find((client) => "focus" in client);
      if (open) {
        return open.focus().then((focused) => {
          if ("navigate" in focused) return focused.navigate(url);
          return focused;
        });
      }
      return self.clients.openWindow(url);
    })
  );
});
