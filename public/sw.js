self.addEventListener("push", (event) => {
  let data = { title: "Avcıkoru Bakım", body: "Yeni bir bakım bildiriminiz var.", href: "/bildirimler", tag: "agm-maintenance" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    // JSON olmayan push gövdesinde varsayılan bildirim kullanılır.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "agm-maintenance",
      data: { href: data.href || "/bildirimler" },
      renotify: true,
    }),
  );
});

const CACHE_NAME = "agm-bakim-shell-v1";
const SHELL_ASSETS = ["/login", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/login")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/bildirimler";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return clients.openWindow(href);
    }),
  );
});
