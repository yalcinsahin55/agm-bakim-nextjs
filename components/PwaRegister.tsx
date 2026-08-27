"use client";

import { useEffect } from "react";
import { syncOfflineQueue } from "@/lib/offlineQueue";
import { AUTH_CHANGED_EVENT } from "@/lib/authClient";

interface AuthMeResponse {
  id?: unknown;
  _id?: unknown;
}

async function getCurrentUserId(): Promise<string> {
  try {
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return "";
    const data = await response.json().catch(() => ({})) as AuthMeResponse;
    const id = typeof data.id === "string" ? data.id : data._id;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

export default function PwaRegister() {
  useEffect(() => {
    let disposed = false;
    let handleControllerChange: (() => void) | undefined;
    if ("serviceWorker" in navigator) {
      handleControllerChange = () => {
        if (!disposed) window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      const registerAndUpdate = async () => {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
          const requestActivation = () => registration.waiting?.postMessage({ type: "AGM_SKIP_WAITING" });
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed") requestActivation();
            });
          });
          if (!disposed) {
            await registration.update();
            requestActivation();
          }
        } catch (error) {
          console.warn("Service Worker güncellenemedi:", error instanceof Error ? error.name : "UnknownError");
        }
      };
      void registerAndUpdate();
    }

    const sync = async () => {
      if (!navigator.onLine) return;
      const ownerUserId = await getCurrentUserId();
      if (!ownerUserId) return;
      try {
        await syncOfflineQueue(ownerUserId);
      } catch (error) {
        console.warn("Çevrimdışı kayıt senkronizasyonu başarısız:", error instanceof Error ? error.name : "UnknownError");
      }
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "AGM_OFFLINE_SYNC") void sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline-queue:sync", sync);
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);
    void sync();

    return () => {
      disposed = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline-queue:sync", sync);
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      navigator.serviceWorker?.removeEventListener("message", handleWorkerMessage);
      if (handleControllerChange) {
        navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  return null;
}
