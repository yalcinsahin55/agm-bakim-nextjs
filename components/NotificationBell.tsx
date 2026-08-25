
import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";

interface UnreadCountResponse {
  unreadCount?: number;
}

const UNREAD_COUNT_URL = "/api/notifications/unread-count";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async (fresh = false) => {
      try {
        if (fresh) invalidateCachedFetch(UNREAD_COUNT_URL);
        const data = await cachedFetch<UnreadCountResponse>(UNREAD_COUNT_URL, fresh ? 0 : 30_000);
        if (alive) setUnreadCount(Number(data.unreadCount || 0));
      } catch {
        // Bildirim sayacı ana sayfanın çalışmasını engellememeli.
      }
    };

    const handleChanged = () => { void load(true); };
    const handleRefresh = () => { void load(true); };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    window.addEventListener("notifications:changed", handleChanged);
    window.addEventListener("notifications:refresh", handleRefresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("notifications:changed", handleChanged);
      window.removeEventListener("notifications:refresh", handleRefresh);
    };
  }, []);

  return (
    <Link
      href="/bildirimler"
      aria-label={unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : "Bildirimler"}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-panel2 text-base text-muted transition hover:border-amber/40 hover:text-amber"
    >
      🔔
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-red px-1 text-center text-[9px] font-bold leading-4 text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
