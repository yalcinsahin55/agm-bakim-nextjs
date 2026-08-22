"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

export default function YedeklemePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");

  async function restoreBackup() {
    if (!restoreFile || restoreConfirm !== "RESTORE") return;
    setRestoreBusy(true);
    setRestoreMessage("");
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);
      if (backup?.version !== 1 || !backup?.collections) throw new Error("Geçersiz veya desteklenmeyen yedek dosyası.");
      const response = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: backup.collections, confirm: "RESTORE" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Geri yükleme başarısız.");
      setRestoreMessage("Yedek güvenli merge modunda geri yüklendi. Sayfayı yenilemen önerilir.");
      setRestoreFile(null);
      setRestoreConfirm("");
    } catch (error) {
      setRestoreMessage(error instanceof Error ? error.message : "Yedek geri yüklenemedi.");
    } finally {
      setRestoreBusy(false);
    }
  }

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
        <section className="mt-4 rounded-card border border-red/30 bg-red/5 p-4 text-[11px] leading-5 text-muted">
          <div className="text-[13px] font-bold text-text">Güvenli yedekten geri yükle</div>
          <p className="mt-1">Bu işlem yalnızca motor, bakım türü, bakım kaydı ve yağ analizi verilerini <b className="text-amber">merge</b> eder. Kullanıcılar, şifreler, bildirimler ve büyük medya alanları geri yüklenmez. Mevcut veriler silinmez.</p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-borderlt px-3 py-3 text-[12px] text-muted hover:border-amber">
            <span className="text-lg">📄</span><span className="flex-1 truncate">{restoreFile ? restoreFile.name : "JSON yedek dosyası seç"}</span>
            <input type="file" accept="application/json,.json" onChange={(event) => setRestoreFile(event.target.files?.[0] || null)} className="hidden" />
          </label>
          <input value={restoreConfirm} onChange={(event) => setRestoreConfirm(event.target.value)} placeholder="Onay için RESTORE yazın" className="mt-2 w-full rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-red" autoComplete="off" />
          <button onClick={restoreBackup} disabled={restoreBusy || !restoreFile || restoreConfirm !== "RESTORE"} className="mt-2 w-full rounded-lg border border-red/40 py-2.5 text-[12px] font-extrabold text-red disabled:opacity-40">{restoreBusy ? "Geri yükleniyor..." : "Yedeği güvenli şekilde geri yükle"}</button>
          {restoreMessage && <div className="mt-2 rounded-lg bg-panel2 p-2 text-[11px] text-muted" role="status">{restoreMessage}</div>}
        </section>
        <section className="mt-4 rounded-card border border-border bg-panel p-4 text-[11px] leading-5 text-muted">
          <strong className="text-text">Önemli:</strong> Bu dosyayı güvenli bir yerde sakla. Yedek dosyasını GitHub’a veya herkese açık bir depolamaya yükleme. MongoDB Atlas planın destekliyorsa ayrıca Atlas Cloud Backup/Snapshot özelliğini etkinleştir.
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
