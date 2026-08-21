"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

export default function YedeklemePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function downloadBackup() {
    setBusy(true);
    try {
      const res = await fetch("/api/backups/export");
      if (res.status === 401) return router.push("/login");
      if (res.status === 403) return router.push("/dashboard");
      if (!res.ok) throw new Error("Yedek oluşturulamadı.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `agm-bakim-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Yedek alınamadı. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <TopBar title="Yedekleme" subtitle="Veri dışa aktarma ve koruma" />
      <main className="px-4 py-4">
        <section className="rounded-card border border-amber/20 bg-gradient-to-br from-amber/10 via-panel to-panel p-4">
          <div className="text-[15px] font-bold text-text">Uygulama verilerini indir</div>
          <p className="mt-1 text-[11px] leading-5 text-muted">Kullanıcılar, motorlar, bakım türleri, bakım kayıtları, bildirimler ve işlem geçmişi JSON olarak dışa aktarılır. Şifreler, VAPID private key ve büyük medya base64 alanları güvenlik ve boyut nedeniyle dışarıda bırakılır.</p>
          <button onClick={downloadBackup} disabled={busy} className="mt-4 w-full rounded-lg bg-amber py-2.5 text-[12px] font-extrabold text-[#161006] disabled:opacity-50">{busy ? "Yedek hazırlanıyor..." : "JSON yedeğini indir"}</button>
        </section>
        <section className="mt-4 rounded-card border border-border bg-panel p-4 text-[11px] leading-5 text-muted">
          <strong className="text-text">Önemli:</strong> Bu dosyayı güvenli bir yerde sakla. Yedek dosyasını GitHub’a veya herkese açık bir depolamaya yükleme. MongoDB Atlas planın destekliyorsa ayrıca Atlas Cloud Backup/Snapshot özelliğini etkinleştir.
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
