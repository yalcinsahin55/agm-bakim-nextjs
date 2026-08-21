"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (alive) setUnreadCount(Number(data.unreadCount || 0));
      } catch {
        // Bildirim sayacı ana sayfanın çalışmasını engellememeli.
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
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
