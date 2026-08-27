"use client";

type CompletionOfflineStatusProps = {
  isOnline: boolean;
  pendingOfflineCount: number;
  hasOfflineMedia: boolean;
  onSyncNow: () => void;
};

export default function CompletionOfflineStatus({
  isOnline,
  pendingOfflineCount,
  hasOfflineMedia,
  onSyncNow,
}: CompletionOfflineStatusProps) {
  if (isOnline && pendingOfflineCount === 0 && !hasOfflineMedia) return null;

  return (
    <div className="mb-3 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[11px] text-amber" role="status">
      <div className="font-bold">{!isOnline ? "Çevrimdışı çalışma açık." : "Senkronizasyon bekleyen kayıt var."}</div>
      <div className="mt-0.5 text-[10px] text-muted">{!isOnline ? "Kayıt ve seçtiğiniz medya/rapor ekleri cihazda tutulur; bağlantı gelince arka planda veya uygulama yeniden açıldığında gönderilir." : `${pendingOfflineCount} kayıt gönderilmeyi bekliyor. Medya veya rapor eki olan işler için bağlantı geldikten sonra uygulamayı açık tutun.`}</div>
      {isOnline && pendingOfflineCount > 0 && <button type="button" onClick={onSyncNow} className="mt-2 rounded-lg border border-amber/40 px-2.5 py-1.5 text-[10px] font-bold text-amber">Şimdi senkronize et</button>}
    </div>
  );
}
