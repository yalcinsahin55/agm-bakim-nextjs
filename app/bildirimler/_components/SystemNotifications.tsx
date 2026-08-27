import type { Notification } from "@/lib/types";
import { formatNotificationDate } from "../_lib/notificationGroups";

interface SystemNotificationsProps {
  notifications: Notification[];
  expanded: boolean;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
}

export default function SystemNotifications({ notifications, expanded, onToggle, onMarkRead }: SystemNotificationsProps) {
  if (notifications.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-card border border-teal/30 bg-teal/[0.05]">
      <button onClick={onToggle} aria-expanded={expanded} className="flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-lg" aria-hidden="true">🔔</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-extrabold text-text">Sistem bildirimleri</span>
          <span className="mt-0.5 block text-[11px] text-muted">{notifications.length} bildirim</span>
        </span>
        <span className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-teal/30 bg-teal/10 px-2 text-sm font-black text-teal">{notifications.length}</span>
        <span className="w-5 text-center text-lg text-muted" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
      {expanded && notifications.map((notification, index) => (
        <div key={notification._id || `system-${index}`} className={`flex items-center gap-2.5 border-t border-border/60 px-3.5 py-3 ${notification.read_at ? "opacity-60" : ""}`}>
          <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
            <span className="block">{notification.message}</span>
            <span className="mt-1 block text-[9.5px] leading-none text-faint">Geldi: {formatNotificationDate(notification)}</span>
          </span>
          {!notification.read_at && notification._id && <button onClick={() => onMarkRead(notification._id!)} className="flex-shrink-0 text-[10px] font-semibold text-faint hover:text-text">Okundu</button>}
        </div>
      ))}
    </section>
  );
}
