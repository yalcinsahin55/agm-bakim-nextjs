"use client";

import { Button } from "@/components/ui";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import type { Notification } from "@/lib/types";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import NotificationGroupCard from "./_components/NotificationGroupCard";
import NotificationSummaryBar from "./_components/NotificationSummaryBar";
import SystemNotifications from "./_components/SystemNotifications";
import { groupNotifications, sortNewestFirst } from "./_lib/notificationGroups";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ gecikmis: true, kritik: true });
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const { signal } = useAbortableFetch();

  const load = useCallback(async (refresh = false) => {
    setLoadError("");
    if (refresh) setRefreshing(true);
    else setLoading(true);

    const request = async (shouldRefresh: boolean): Promise<{ notifications?: Notification[] } | null> => {
      let response = shouldRefresh
        ? await fetch("/api/notifications/refresh", { method: "POST", cache: "no-store", signal })
        : await fetch("/api/notifications?limit=500", { cache: "no-store", signal });
      if (response.status === 401) {
        router.push("/login");
        return null;
      }
      if (!response.ok && shouldRefresh) {
        response = await fetch("/api/notifications?limit=500", { cache: "no-store", signal });
      }
      if (response.status === 401) {
        router.push("/login");
        return null;
      }
      if (!response.ok) throw new Error("Bildirimler yüklenemedi");
      return (await response.json()) as { notifications?: Notification[] };
    };

    try {
      let data: { notifications?: Notification[] } | null;
      try {
        data = await request(refresh);
      } catch {
        // Serverless cold start veya kısa süreli ağ hatasında kullanıcıyı gereksiz
        // yere hata ekranına düşürmeden aynı read-only listeyi bir kez yeniden dene.
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        data = await request(false);
      }
      if (!data) return;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setLoadError("Bildirimler yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      if (!signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [router, signal]);

  useEffect(() => { if (!signal.aborted) load().catch(() => setLoadError("Bildirimler yüklenemedi.")); }, [load, signal]);

  async function markRead(id: string) {
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
      if (!response.ok) throw new Error("Bildirim okunamadı");
      setNotifications((current) => current.map((item) => item._id === id ? { ...item, read_at: new Date().toISOString() } : item));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      // Okundu işaretleme başarısızsa listeyi değiştirme.
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (!response.ok) throw new Error("Bildirimler okunamadı");
      setNotifications((current) => current.map((item) => ({ ...item, read_at: new Date().toISOString() })));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      // Hata durumunda butonun kilitlenmemesi için finally kullanılır.
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const groupedNotifications = useMemo(() => groupNotifications(notifications), [notifications]);
  const systemNotifications = useMemo(() => sortNewestFirst(notifications.filter((notification) => notification.status === "system")), [notifications]);
  const counts = useMemo(() => ({
    gecikmis: notifications.filter((item) => item.status === "gecikmis").length,
    kritik: notifications.filter((item) => item.status === "kritik").length,
    yaklasiyor: notifications.filter((item) => item.status === "yaklasiyor").length,
  }), [notifications]);

  function toggleGroup(status: string) {
    setExpandedGroups((current) => ({ ...current, [status]: !current[status] }));
  }

  function toggleList(status: string) {
    setExpandedLists((current) => ({ ...current, [status]: !current[status] }));
  }

  return (
    <div>
      <TopBar title="Bildirimler" subtitle={unreadCount ? `${unreadCount} okunmamış bildirim` : "Önemli bakım uyarıları"} />
      <main className="px-4 py-4">
        <NotificationSummaryBar
          counts={counts}
          unreadCount={unreadCount}
          refreshing={refreshing}
          busy={busy}
          onJump={(status) => { setExpandedGroups((current) => ({ ...current, [status]: true })); document.getElementById(`notification-group-${status}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          onRefresh={() => { void load(true); }}
          onMarkAllRead={() => { void markAllRead(); }}
        />

        <p className="mb-3 text-[11px] leading-relaxed text-muted">Öncelikli bakım uyarıları durumlarına göre gruplandırılmıştır. Ayrıntıları görmek için ilgili grubu açın.</p>
        <PushNotificationToggle />

        {loading ? (
          <div className="mt-4 flex flex-col gap-2.5">
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
          </div>
        ) : loadError ? (
          <div className="mt-4 rounded-card border border-red/30 bg-panel py-12 text-center">
            <div className="mb-3 text-3xl">⚠️</div>
            <p className="text-sm font-semibold text-text">{loadError}</p>
            <Button onClick={() => { void load(); }} className="mt-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 text-xs font-bold text-teal">Tekrar dene</Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-4 rounded-card border border-border bg-panel py-14 text-center">
            <div className="mb-3 text-4xl">✅</div>
            <p className="text-sm font-semibold text-text">Yeni bildirim yok.</p>
            <p className="mt-1 text-xs text-faint">Bakım durumları değiştiğinde burada göreceksiniz.</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[15px] font-bold text-text">
              <span className="text-teal" aria-hidden="true">⚑</span>
              Öncelikli bildirimler
            </div>

            {groupedNotifications.map((group) => (
              <NotificationGroupCard
                key={group.status}
                group={group}
                isExpanded={expandedGroups[group.status] ?? false}
                showAll={expandedLists[group.status] ?? false}
                onToggleGroup={() => toggleGroup(group.status)}
                onToggleList={() => toggleList(group.status)}
                onMarkRead={(id) => { void markRead(id); }}
              />
            ))}

            <SystemNotifications
              notifications={systemNotifications}
              expanded={expandedGroups.system ?? false}
              onToggle={() => toggleGroup("system")}
              onMarkRead={(id) => { void markRead(id); }}
            />
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
