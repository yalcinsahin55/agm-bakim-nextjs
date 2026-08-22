"use client";

import { useEffect } from "react";
import { syncOfflineQueue } from "@/lib/offlineQueue";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service Worker kaydedilemedi:", error);
      });
    }

    const sync = () => {
      if (navigator.onLine) void syncOfflineQueue().catch((error) => console.warn("Çevrimdışı kayıt senkronizasyonu başarısız:", error));
    };
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "AGM_OFFLINE_SYNC") sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline-queue:sync", sync);
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);
    sync();

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline-queue:sync", sync);
      navigator.serviceWorker?.removeEventListener("message", handleWorkerMessage);
    };
  }, []);

  return null;
}
