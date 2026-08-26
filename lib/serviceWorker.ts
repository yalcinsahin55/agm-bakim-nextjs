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

type OfflineQueueJob = {
  id: string;
  method: "POST" | "PATCH";
  endpoint: string;
  payload: Record<string, unknown>;
  media: unknown[];
  retryCount: number;
  lastError?: string;
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

const CACHE_NAME = "agm-bakim-shell-v4";
const SHELL_ASSETS = ["/login", "/manifest.json", "/icon.svg"];
const OFFLINE_DB_NAME = "agm-bakim-offline";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE_NAME = "records";
const MAX_WORKER_SYNC_BODY_BYTES = 512 * 1024;

workerScope.addEventListener("install", (rawEvent) => {
  const event = rawEvent as unknown as ExtendableEvent;
  event.waitUntil(
    workerScope.caches.open(CACHE_NAME).then((cache) => cache.addAll(
      SHELL_ASSETS.map((asset) => new Request(asset, { cache: "reload" })),
    )),
  );
  void workerScope.skipWaiting();
});

workerScope.addEventListener("activate", (rawEvent) => {
  const event = rawEvent as unknown as ExtendableEvent;
  event.waitUntil(
    Promise.all([
      workerScope.clients.claim(),
      workerScope.caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("agm-bakim-shell-") && key !== CACHE_NAME)
          .map((key) => workerScope.caches.delete(key)),
      )),
    ]),
  );
});

workerScope.addEventListener("message", (rawEvent) => {
  const event = rawEvent as unknown as MessageEvent<{ type?: unknown }>;
  if (event.data?.type === "AGM_SKIP_WAITING") void workerScope.skipWaiting();
});

workerScope.addEventListener("fetch", (rawEvent) => {
  const event = rawEvent as unknown as FetchEvent;
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== workerScope.location.origin || url.pathname.startsWith("/api/")) return;

  const isDocumentRequest = request.destination === "document" || request.headers.get("accept")?.includes("text/html") === true;
  const networkRequest = isDocumentRequest ? new Request(request, { cache: "no-store" }) : request;
  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void workerScope.caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => workerScope.caches.match(request).then((cached) => cached ?? workerScope.caches.match("/login").then((login) => login ?? new Response("Offline", { status: 503 })))),
  );
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function openOfflineQueueDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB desteklenmiyor."));
      return;
    }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        database.createObjectStore(OFFLINE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Çevrimdışı kayıt deposu açılamadı."));
  });
}

function readOfflineQueueJobs(database: IDBDatabase): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(OFFLINE_STORE_NAME, "readonly").objectStore(OFFLINE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as unknown[] : []);
    request.onerror = () => reject(request.error || new Error("Çevrimdışı kayıtlar okunamadı."));
  });
}

function deleteOfflineQueueJob(database: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE_NAME, "readwrite");
    transaction.objectStore(OFFLINE_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Çevrimdışı kayıt silinemedi."));
  });
}

function updateOfflineQueueJob(database: IDBDatabase, job: OfflineQueueJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE_NAME, "readwrite");
    transaction.objectStore(OFFLINE_STORE_NAME).put(job);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Çevrimdışı kayıt güncellenemedi."));
  });
}

function isAllowedOfflineEndpoint(endpoint: string): boolean {
  return endpoint === "/api/records" || /^\/api\/records\/[A-Za-z0-9_-]+$/.test(endpoint);
}

function isMetadataOnlyOfflineJob(value: unknown): value is OfflineQueueJob {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.method === "POST" || value.method === "PATCH")
    && typeof value.endpoint === "string"
    && isAllowedOfflineEndpoint(value.endpoint)
    && isRecord(value.payload)
    && Array.isArray(value.media)
    && value.media.length === 0
    && typeof value.retryCount === "number";
}

function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "Bilinmeyen senkronizasyon hatası.";
}

async function syncOfflineQueueInWorker(): Promise<void> {
  let database: IDBDatabase | null = null;
  let synced = 0;
  try {
    database = await openOfflineQueueDatabase();
    const jobs = await readOfflineQueueJobs(database);
    for (const candidate of jobs) {
      if (!isMetadataOnlyOfflineJob(candidate)) continue;
      const job: OfflineQueueJob = {
        ...candidate,
        payload: {
          ...candidate.payload,
          client_request_id: typeof candidate.payload.client_request_id === "string"
            ? candidate.payload.client_request_id
            : candidate.id,
        },
        media: [],
      };
      try {
        const serializedPayload = JSON.stringify(job.payload);
        if (new TextEncoder().encode(serializedPayload).byteLength > MAX_WORKER_SYNC_BODY_BYTES) {
          throw new Error("Çevrimdışı kayıt gövdesi worker sınırını aşıyor.");
        }
        const response = await fetch(job.endpoint, {
          method: job.method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: serializedPayload,
        });
        if (!response.ok) throw new Error(`Kayıt gönderilemedi (HTTP ${response.status}).`);
        await deleteOfflineQueueJob(database, job.id);
        synced += 1;
      } catch (error) {
        await updateOfflineQueueJob(database, {
          ...job,
          retryCount: job.retryCount + 1,
          lastError: syncErrorMessage(error),
        });
        break;
      }
    }
  } catch {
    // Service worker ortamı IndexedDB veya ağ erişimi sağlayamazsa client retry yolu korunur.
  } finally {
    database?.close();
  }

  const clientList = await workerScope.clients.matchAll({ type: "window", includeUncontrolled: true });
  clientList.forEach((client) => client.postMessage({ type: "AGM_OFFLINE_SYNC", source: "service-worker", synced }));
}

workerScope.addEventListener("sync", (rawEvent) => {
  const event = rawEvent as unknown as SyncEvent;
  if (event.tag !== "agm-offline-sync") return;
  event.waitUntil(
    workerScope.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      if (clientList.length > 0) {
        clientList.forEach((client) => client.postMessage({ type: "AGM_OFFLINE_SYNC" }));
        return;
      }
      await syncOfflineQueueInWorker();
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
