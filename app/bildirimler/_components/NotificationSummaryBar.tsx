import type { GroupStatus } from "../_lib/notificationGroups";
import { STATUS_ORDER } from "../_lib/notificationGroups";

interface NotificationSummaryBarProps {
  counts: Record<GroupStatus, number>;
  unreadCount: number;
  refreshing: boolean;
  busy: boolean;
  onJump: (status: GroupStatus) => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
}

export default function NotificationSummaryBar({ counts, unreadCount, refreshing, busy, onJump, onRefresh, onMarkAllRead }: NotificationSummaryBarProps) {
  return (
    <section className="mb-4 overflow-hidden rounded-card border border-border bg-panel" aria-label="Bildirim özeti">
      <div className="grid grid-cols-3 divide-x divide-border">
        {STATUS_ORDER.map((status) => (
          <button key={status} onClick={() => onJump(status)} className="min-w-0 px-1.5 py-3 text-center transition hover:bg-panel2">
            <div className={`text-2xl font-black ${status === "gecikmis" ? "text-red" : status === "kritik" ? "text-orange" : "text-yellow"}`}>{counts[status]}</div>
            <div className="mt-0.5 truncate text-[10px] font-semibold text-muted">{status === "gecikmis" ? "Gecikmiş" : status === "kritik" ? "Kritik" : "Yaklaşıyor"}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row">
        <button onClick={onRefresh} disabled={refreshing} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted transition hover:border-teal/40 hover:text-teal disabled:opacity-50">
          <span aria-hidden="true">↻</span>
          {refreshing ? "Yenileniyor..." : "Bildirimleri yenile"}
        </button>
        {unreadCount > 0 && (
          <button onClick={onMarkAllRead} disabled={busy} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-teal/25 px-3 py-2 text-[11px] font-bold text-teal transition hover:bg-teal/10 disabled:opacity-50">
            <span aria-hidden="true">✓</span>
            {busy ? "İşaretleniyor..." : "Tümünü okundu işaretle"}
          </button>
        )}
      </div>
    </section>
  );
}
