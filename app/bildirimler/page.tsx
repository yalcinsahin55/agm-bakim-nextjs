"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import type { Notification, NotificationStatus } from "@/lib/types";
import PushNotificationToggle from "@/components/PushNotificationToggle";

type GroupStatus = Exclude<NotificationStatus, "system">;

type NotificationGroup = {
  status: GroupStatus;
  title: string;
  icon: string;
  summary: string;
  notifications: Notification[];
};

const GROUP_CONFIG: Record<GroupStatus, { title: string; icon: string; summaryNoun: string; className: string; iconClassName: string; badgeClassName: string }> = {
  gecikmis: {
    title: "Gecikmiş bakımlar",
    icon: "🚨",
    summaryNoun: "gecikmiş bakım",
    className: "border-red/35 bg-red/[0.06]",
    iconClassName: "border-red/35 bg-red/10 text-red",
    badgeClassName: "bg-red/20 text-red border-red/35",
  },
  kritik: {
    title: "Kritik bakımlar",
    icon: "⚠️",
    summaryNoun: "kritik bakım",
    className: "border-orange/35 bg-orange/[0.06]",
    iconClassName: "border-orange/35 bg-orange/10 text-orange",
    badgeClassName: "bg-orange/20 text-orange border-orange/35",
  },
  yaklasiyor: {
    title: "Yaklaşan bakımlar",
    icon: "⏳",
    summaryNoun: "yaklaşan bakım",
    className: "border-yellow/35 bg-yellow/[0.06]",
    iconClassName: "border-yellow/35 bg-yellow/10 text-yellow",
    badgeClassName: "bg-yellow/20 text-yellow border-yellow/35",
  },
};

const STATUS_ORDER: GroupStatus[] = ["gecikmis", "kritik", "yaklasiyor"];
const INITIAL_VISIBLE_ITEMS = 3;

function getNotificationTimestamp(notification: Notification): number {
  const value = notification.last_notified_at ?? notification.created_at;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortNewestFirst(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a));
}

function formatNotificationDate(notification: Notification): string {
  const value = notification.last_notified_at ?? notification.created_at;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tarih bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getGroupSummary(notifications: Notification[]): string {
  const engines = new Set<string>();
  const types = new Set<string>();
  notifications.forEach((notification) => {
    const message = notification.message || "";
    const [enginePart, typePart] = message.split(" için ");
    if (enginePart?.trim()) engines.add(enginePart.trim());
    if (typePart?.trim()) types.add(typePart.replace(/ bakımı.*$/u, "").trim());
  });
  const engineCount = engines.size || notifications.length;
  const typeCount = types.size || notifications.length;
  return `${engineCount} motor · ${typeCount} ${typeCount === 1 ? "bakım türü" : "bakım türü"}`;
}

function groupNotifications(notifications: Notification[]): NotificationGroup[] {
  const newestFirst = sortNewestFirst(notifications);
  return STATUS_ORDER
    .map((status) => {
      const grouped = newestFirst.filter((notification) => notification.status === status);
      if (grouped.length === 0) return null;
      return {
        status,
        title: GROUP_CONFIG[status].title,
        icon: GROUP_CONFIG[status].icon,
        summary: getGroupSummary(grouped),
        notifications: grouped,
      };
    })
    .filter((group): group is NotificationGroup => Boolean(group))
    .sort((a, b) => getNotificationTimestamp(b.notifications[0]) - getNotificationTimestamp(a.notifications[0]));
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ gecikmis: true, kritik: true });
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});

  const load = useCallback(async (refresh = false) => {
    setLoadError("");
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = refresh
        ? await fetch("/api/notifications/refresh", { method: "POST", cache: "no-store" })
        : await fetch("/api/notifications?limit=500", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error("Bildirimler yüklenemedi");
      const data = await response.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setLoadError("Bildirimler yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load().catch(() => setLoadError("Bildirimler yüklenemedi.")); }, [load]);

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
        <section className="mb-4 overflow-hidden rounded-card border border-border bg-panel" aria-label="Bildirim özeti">
          <div className="grid grid-cols-3 divide-x divide-border">
            {STATUS_ORDER.map((status) => (
              <button key={status} onClick={() => { setExpandedGroups((current) => ({ ...current, [status]: true })); document.getElementById(`notification-group-${status}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="min-w-0 px-1.5 py-3 text-center transition hover:bg-panel2">
                <div className={`text-2xl font-black ${status === "gecikmis" ? "text-red" : status === "kritik" ? "text-orange" : "text-yellow"}`}>{counts[status]}</div>
                <div className="mt-0.5 truncate text-[10px] font-semibold text-muted">{status === "gecikmis" ? "Gecikmiş" : status === "kritik" ? "Kritik" : "Yaklaşıyor"}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row">
            <button onClick={() => { void load(true); }} disabled={refreshing} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted transition hover:border-teal/40 hover:text-teal disabled:opacity-50">
              <span aria-hidden="true">↻</span>
              {refreshing ? "Yenileniyor..." : "Bildirimleri yenile"}
            </button>
            {unreadCount > 0 && (
              <button onClick={markAllRead} disabled={busy} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-teal/25 px-3 py-2 text-[11px] font-bold text-teal transition hover:bg-teal/10 disabled:opacity-50">
                <span aria-hidden="true">✓</span>
                {busy ? "İşaretleniyor..." : "Tümünü okundu işaretle"}
              </button>
            )}
          </div>
        </section>

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
            <button onClick={() => { void load(); }} className="mt-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 text-xs font-bold text-teal">Tekrar dene</button>
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

            {groupedNotifications.map((group) => {
              const config = GROUP_CONFIG[group.status];
              const isExpanded = expandedGroups[group.status] ?? false;
              const showAll = expandedLists[group.status] ?? false;
              const visibleNotifications = showAll ? group.notifications : group.notifications.slice(0, INITIAL_VISIBLE_ITEMS);
              const hiddenCount = group.notifications.length - visibleNotifications.length;

              return (
                <section id={`notification-group-${group.status}`} key={group.status} className={`scroll-mt-24 overflow-hidden rounded-card border ${config.className}`}>
                  <button onClick={() => toggleGroup(group.status)} aria-expanded={isExpanded} className="flex min-h-[76px] w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]">
                    <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-xl ${config.iconClassName}`} aria-hidden="true">{config.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-extrabold text-text">{config.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{group.summary}</span>
                    </span>
                    <span className={`flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-black ${config.badgeClassName}`}>{group.notifications.length}</span>
                    <span className="w-5 text-center text-lg text-muted" aria-hidden="true">{isExpanded ? "⌃" : "⌄"}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/70">
                      {visibleNotifications.map((notification, index) => (
                        <div key={notification._id || notification.dedupe_key || `${group.status}-${index}`} className={`flex min-h-[62px] items-center gap-2.5 px-3.5 py-2.5 ${index > 0 ? "border-t border-border/60" : ""} ${notification.read_at ? "opacity-60" : ""}`}>
                          <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-sm ${config.iconClassName}`} aria-hidden="true">{config.icon}</span>
                          <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
                            <span className="block">{notification.message}</span>
                            <span className="mt-1 block text-[9.5px] leading-none text-faint">Geldi: {formatNotificationDate(notification)}</span>
                          </span>
                          <span className="flex flex-shrink-0 flex-col items-end gap-1">
                            {notification.href && <Link href={notification.href} onClick={() => notification._id && void markRead(notification._id)} className="text-[11px] font-bold text-teal hover:text-amber">Detay</Link>}
                            {!notification.read_at && notification._id && <button onClick={() => void markRead(notification._id!)} className="text-[9.5px] font-semibold text-faint hover:text-text">Okundu</button>}
                          </span>
                        </div>
                      ))}
                      {group.notifications.length > INITIAL_VISIBLE_ITEMS && (
                        <button onClick={() => toggleList(group.status)} className="flex min-h-11 w-full items-center justify-between border-t border-border/60 px-3.5 text-[11px] font-bold text-teal transition hover:bg-teal/5">
                          <span>{showAll ? "Daha az göster" : `${hiddenCount} bakım daha`}</span>
                          <span aria-hidden="true">{showAll ? "⌃" : "›"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {systemNotifications.length > 0 && (
              <section className="overflow-hidden rounded-card border border-teal/30 bg-teal/[0.05]">
                <button onClick={() => toggleGroup("system")} aria-expanded={expandedGroups.system ?? false} className="flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-lg" aria-hidden="true">🔔</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-extrabold text-text">Sistem bildirimleri</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{systemNotifications.length} bildirim</span>
                  </span>
                  <span className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-teal/30 bg-teal/10 px-2 text-sm font-black text-teal">{systemNotifications.length}</span>
                  <span className="w-5 text-center text-lg text-muted" aria-hidden="true">{expandedGroups.system ? "⌃" : "⌄"}</span>
                </button>
                {expandedGroups.system && systemNotifications.map((notification, index) => (
                  <div key={notification._id || `system-${index}`} className={`flex items-center gap-2.5 border-t border-border/60 px-3.5 py-3 ${notification.read_at ? "opacity-60" : ""}`}>
                    <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
                      <span className="block">{notification.message}</span>
                      <span className="mt-1 block text-[9.5px] leading-none text-faint">Geldi: {formatNotificationDate(notification)}</span>
                    </span>
                    {!notification.read_at && notification._id && <button onClick={() => void markRead(notification._id!)} className="flex-shrink-0 text-[10px] font-semibold text-faint hover:text-text">Okundu</button>}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
