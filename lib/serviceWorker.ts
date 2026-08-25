type PushPayload = {
  title?: string;
  body?: string;
  href?: string;
  tag?: string;
};

type ServiceWorkerClient = {
  postMessage(message: unknown): void;
  navigate(url: string): Promise<ServiceWorkerClient>;
  focus(): Promise<ServiceWorkerClient>;
};

type ServiceWorkerClients = {
  claim(): Promise<void>;
  matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<ServiceWorkerClient[]>;
  openWindow(url: string): Promise<ServiceWorkerClient | null>;
};

type NotificationOptionsWithRenotify = NotificationOptions & { renotify?: boolean };

type ServiceWorkerRegistrationWithNotifications = {
  showNotification(title: string, options: NotificationOptionsWithRenotify): Promise<void>;
};

type ServiceWorkerScope = {
  location: Location;
  registration: ServiceWorkerRegistrationWithNotifications;
  clients: ServiceWorkerClients;
  caches: CacheStorage;
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
};

type PushEvent = {
  data: { json(): PushPayload } | null;
  waitUntil(promise: Promise<unknown>): void;
};

type ExtendableEvent = {
  waitUntil(promise: Promise<unknown>): void;
};

type FetchEvent = {
  request: Request;
  respondWith(response: Promise<Response>): void;
};

type SyncEvent = {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
};

type NotificationClickEvent = {
  notification: { data?: { href?: string }; close(): void };
  waitUntil(promise: Promise<unknown>): void;
};

const workerScope = globalThis as unknown as ServiceWorkerScope;

workerScope.addEventListener("push", (rawEvent) => {
  const event = rawEvent as unknown as PushEvent;
  let data: Required<Pick<PushPayload, "title" | "body" | "href" | "tag">> = {
    title: "Avcıkoru Bakım",
    body: "Yeni bir bakım bildiriminiz var.",
    href: "/bildirimler",
    tag: "agm-maintenance",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // JSON olmayan push gövdesinde varsayılan bildirim kullanılır.
  }

  event.waitUntil(
    workerScope.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag,
      data: { href: data.href },
      renotify: true,
    }),
  );
});

const CACHE_NAME = "agm-bakim-shell-v1";
const SHELL_ASSETS = ["/login", "/manifest.json", "/icon.svg"];

workerScope.addEventListener("install", (rawEvent) => {
  const event = rawEvent as unknown as ExtendableEvent;
  event.waitUntil(
    workerScope.caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  void workerScope.skipWaiting();
});

workerScope.addEventListener("activate", (rawEvent) => {
  const event = rawEvent as unknown as ExtendableEvent;
  event.waitUntil(workerScope.clients.claim());
});

workerScope.addEventListener("fetch", (rawEvent) => {
  const event = rawEvent as unknown as FetchEvent;
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== workerScope.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        void workerScope.caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => workerScope.caches.match(request).then((cached) => cached ?? workerScope.caches.match("/login").then((login) => login ?? new Response("Offline", { status: 503 })))),
  );
});

workerScope.addEventListener("sync", (rawEvent) => {
  const event = rawEvent as unknown as SyncEvent;
  if (event.tag !== "agm-offline-sync") return;
  event.waitUntil(
    workerScope.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      clientList.forEach((client) => client.postMessage({ type: "AGM_OFFLINE_SYNC" }));
    }),
  );
});

workerScope.addEventListener("notificationclick", (rawEvent) => {
  const event = rawEvent as unknown as NotificationClickEvent;
  event.notification.close();
  const href = event.notification.data?.href || "/bildirimler";
  event.waitUntil(
    workerScope.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        await client.navigate(href);
        return client.focus();
      }
      return workerScope.clients.openWindow(href);
    }),
  );
});
