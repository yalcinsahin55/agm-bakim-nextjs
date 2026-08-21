"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import type { Notification } from "@/lib/types";
import PushNotificationToggle from "@/components/PushNotificationToggle";

const STATUS_STYLE: Record<string, string> = {
  gecikmis: "border-red/40 bg-red/10 text-red",
  kritik: "border-orange/40 bg-orange/10 text-orange",
  yaklasiyor: "border-yellow/40 bg-yellow/10 text-yellow",
  system: "border-teal/40 bg-teal/10 text-teal",
};

const STATUS_ICON: Record<string, string> = {
  gecikmis: "🚨",
  kritik: "⚠️",
  yaklasiyor: "⏳",
  system: "🔔",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error("Bildirimler yüklenemedi");
      const data = await response.json();
      setNotifications(data.notifications || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((current) => current.map((item) => item._id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  async function markAllRead() {
    setBusy(true);
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((current) => current.map((item) => ({ ...item, read_at: new Date().toISOString() })));
    setBusy(false);
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  return (
    <div>
      <TopBar title="Bildirimler" subtitle={unreadCount ? `${unreadCount} okunmamış bildirim` : "Güncel bakım durumları"} />
      <main className="px-4 py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted">Bakım durumları güncellendikçe bildirimler otomatik yenilenir.</p>
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={busy} className="flex-shrink-0 rounded-lg border border-border px-2.5 py-2 text-[10.5px] font-bold text-muted transition hover:border-amber/40 hover:text-amber disabled:opacity-50">
              Tümünü oku
            </button>
          )}
        </div>
        <PushNotificationToggle />

        {loading ? (
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-card border border-border bg-panel py-14 text-center">
            <div className="mb-3 text-4xl">✅</div>
            <p className="text-sm font-semibold text-text">Yeni bildirim yok.</p>
            <p className="mt-1 text-xs text-faint">Bakım durumları değiştiğinde burada göreceksiniz.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {notifications.map((notification) => (
              <article key={notification._id} className={`rounded-card border bg-panel p-3.5 transition ${notification.read_at ? "border-border opacity-70" : "border-amber/30 shadow-lg shadow-amber/5"}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border text-xl ${STATUS_STYLE[notification.status] || STATUS_STYLE.system}`}>
                    {STATUS_ICON[notification.status] || STATUS_ICON.system}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[13px] font-bold text-text">{notification.title}</h2>
                      {!notification.read_at && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-amber" aria-label="Okunmamış" />}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{notification.message}</p>
                    <div className="mt-2 flex items-center gap-3">
                      {notification.href && <Link href={notification.href} onClick={() => notification._id && markRead(notification._id)} className="text-[11px] font-bold text-teal hover:text-amber">Dashboard’a git →</Link>}
                      {!notification.read_at && notification._id && <button onClick={() => markRead(notification._id!)} className="text-[10.5px] font-semibold text-faint hover:text-text">Okundu işaretle</button>}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
