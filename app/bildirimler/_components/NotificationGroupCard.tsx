import Link from "next/link";
import type { Notification } from "@/lib/types";
import { formatNotificationDate, GROUP_CONFIG, INITIAL_VISIBLE_ITEMS } from "../_lib/notificationGroups";
import type { NotificationGroup } from "../_lib/notificationGroups";

interface NotificationGroupCardProps {
  group: NotificationGroup;
  isExpanded: boolean;
  showAll: boolean;
  onToggleGroup: () => void;
  onToggleList: () => void;
  onMarkRead: (id: string) => void;
}

export default function NotificationGroupCard({ group, isExpanded, showAll, onToggleGroup, onToggleList, onMarkRead }: NotificationGroupCardProps) {
  const config = GROUP_CONFIG[group.status];
  const visibleNotifications = showAll ? group.notifications : group.notifications.slice(0, INITIAL_VISIBLE_ITEMS);
  const hiddenCount = group.notifications.length - visibleNotifications.length;

  return (
    <section id={`notification-group-${group.status}`} className={`scroll-mt-24 overflow-hidden rounded-card border ${config.className}`}>
      <button onClick={onToggleGroup} aria-expanded={isExpanded} className="flex min-h-[76px] w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03]">
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
            <NotificationRow key={notification._id || notification.dedupe_key || `${group.status}-${index}`} notification={notification} icon={config.icon} iconClassName={config.iconClassName} isFirst={index === 0} onMarkRead={onMarkRead} />
          ))}
          {group.notifications.length > INITIAL_VISIBLE_ITEMS && (
            <button onClick={onToggleList} className="flex min-h-11 w-full items-center justify-between border-t border-border/60 px-3.5 text-[11px] font-bold text-teal transition hover:bg-teal/5">
              <span>{showAll ? "Daha az göster" : `${hiddenCount} bakım daha`}</span>
              <span aria-hidden="true">{showAll ? "⌃" : "›"}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NotificationRow({ notification, icon, iconClassName, isFirst, onMarkRead }: { notification: Notification; icon: string; iconClassName: string; isFirst: boolean; onMarkRead: (id: string) => void }) {
  return (
    <div className={`flex min-h-[62px] items-center gap-2.5 px-3.5 py-2.5 ${!isFirst ? "border-t border-border/60" : ""} ${notification.read_at ? "opacity-60" : ""}`}>
      <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-sm ${iconClassName}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
        <span className="block">{notification.message}</span>
        <span className="mt-1 block text-[9.5px] leading-none text-faint">Geldi: {formatNotificationDate(notification)}</span>
      </span>
      <span className="flex flex-shrink-0 flex-col items-end gap-1">
        {notification.href && <Link href={notification.href} onClick={() => notification._id && onMarkRead(notification._id)} className="text-[11px] font-bold text-teal hover:text-amber">Detay</Link>}
        {!notification.read_at && notification._id && <button onClick={() => onMarkRead(notification._id!)} className="text-[9.5px] font-semibold text-faint hover:text-text">Okundu</button>}
      </span>
    </div>
  );
}
