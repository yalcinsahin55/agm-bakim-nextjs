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
