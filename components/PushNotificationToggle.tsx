"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export default function PushNotificationToggle() {
  const [supported, setSupported] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setSupported(false);
        setBusy(false);
        return;
      }
      try {
        const response = await fetch("/api/push/subscribe", { cache: "no-store" });
        if (!response.ok) throw new Error("Push ayarı alınamadı");
        const data = await response.json();
        setConfigured(Boolean(data.configured && data.publicKey));
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        setEnabled(Boolean(subscription));
      } catch {
        setMessage("Push ayarı şu anda alınamıyor.");
      } finally {
        setBusy(false);
      }
    }
    load();
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (!configured) {
        setMessage("Web Push sunucu ortamında henüz yapılandırılmamış.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const existing = await registration.pushManager.getSubscription();
      if (existing && enabled) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        await existing.unsubscribe();
        setEnabled(false);
        setMessage("Tarayıcı bildirimleri kapatıldı.");
        return;
      }

      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.");
        return;
      }
      const keyResponse = await fetch("/api/push/subscribe", { cache: "no-store" });
      const { publicKey } = await keyResponse.json();
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const saveResponse = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      if (!saveResponse.ok) throw new Error("Abonelik kaydedilemedi");
      setEnabled(true);
      setMessage("Tarayıcı bildirimleri açıldı.");
    } catch {
      setMessage("Bildirim ayarı değiştirilemedi. HTTPS ve tarayıcı izinlerini kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return <p className="text-[11px] text-faint">Bu tarayıcı Web Push bildirimlerini desteklemiyor.</p>;
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-text">Tarayıcı bildirimi</div>
          <div className="mt-0.5 text-[10.5px] text-faint">Tarayıcı kapalıyken de bakım uyarısı al.</div>
        </div>
        <button onClick={toggle} disabled={busy} className={`flex-shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition ${enabled ? "border border-red/30 bg-red/10 text-red" : "bg-amber text-[#1a1206] hover:brightness-110"}`}>
          {busy ? "Kontrol ediliyor..." : enabled ? "Kapat" : "Aç"}
        </button>
      </div>
      {message && <p className="mt-2 text-[10.5px] text-muted">{message}</p>}
    </div>
  );
}
