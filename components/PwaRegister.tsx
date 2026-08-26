"use client";

import { useEffect } from "react";
import { syncOfflineQueue } from "@/lib/offlineQueue";

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
          if (!disposed) await registration.update();
        } catch (error) {
          console.warn("Service Worker güncellenemedi:", error instanceof Error ? error.name : "UnknownError");
        }
      };
      void registerAndUpdate();
    }

    const sync = () => {
      if (navigator.onLine) void syncOfflineQueue().catch((error) => console.warn("Çevrimdışı kayıt senkronizasyonu başarısız:", error instanceof Error ? error.name : "UnknownError"));
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "AGM_OFFLINE_SYNC") sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline-queue:sync", sync);
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);
    sync();

    return () => {
      disposed = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline-queue:sync", sync);
      navigator.serviceWorker?.removeEventListener("message", handleWorkerMessage);
      if (handleControllerChange) {
        navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  return null;
}
