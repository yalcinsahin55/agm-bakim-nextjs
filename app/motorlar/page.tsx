// @ts-nocheck
"use client";
// JavaScript kaynak dosyasından TypeScript'e taşındı; dinamik API/form verileri çalışma zamanında doğrulanıyor.
// @ts-nocheck

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import EngineBadge from "@/components/EngineBadge";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

export default function MotorlarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [recordsByEngine, setRecordsByEngine] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingEngineId, setLoadingEngineId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [qrEngine, setQrEngine] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newLoad, setNewLoad] = useState("");
  const [saving, setSaving] = useState(false);

  const canAdd = user?.role === "yonetici";

  async function load() {
    const engRes = await fetch("/api/engines");
    if (engRes.status === 401) { router.push("/login"); return; }
    if (!engRes.ok) throw new Error("Motorlar yüklenemedi");
    setEngines(await engRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  useEffect(() => {
    const requestedId = searchParams.get("engine_id");
    if (!requestedId || engines.length === 0) return;
    const engine = engines.find((item) => item._id === requestedId || item.name === requestedId);
    if (!engine) {
      toast.error("QR kodundaki motor bulunamadı.");
      return;
    }
    setOpenId(engine._id);
    if (recordsByEngine[engine._id]) return;
    setLoadingEngineId(engine._id);
    fetch(`/api/records?engine_id=${encodeURIComponent(engine._id)}&page=1&page_size=20`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Bakım geçmişi yüklenemedi");
        const data = await response.json();
        setRecordsByEngine((current) => ({ ...current, [engine._id]: Array.isArray(data) ? data : (data.records || []) }));
      })
      .catch(() => toast.error("QR ile motor geçmişi yüklenemedi."))
      .finally(() => setLoadingEngineId(null));
    // QR bağlantısı aynı sayfa açıkken yalnızca ilgili motoru otomatik açar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engines, searchParams]);

  useEffect(() => {
    if (!qrEngine) {
      setQrDataUrl("");
      return;
    }
    const value = typeof window === "undefined"
      ? `/tamamla?engine_id=${encodeURIComponent(qrEngine._id)}&mode=quick&plant_id=avcikoru`
      : `${window.location.origin}/tamamla?engine_id=${encodeURIComponent(qrEngine._id)}&mode=quick&plant_id=avcikoru`;
    QRCode.toDataURL(value, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => setQrDataUrl(dataUrl))
      .catch(() => {
        setQrDataUrl("");
        toast.error("QR kod oluşturulamadı.");
      });
  }, [qrEngine]);

  async function copyQrLink() {
    if (!qrEngine) return;
    const value = `${window.location.origin}/tamamla?engine_id=${encodeURIComponent(qrEngine._id)}&mode=quick&plant_id=avcikoru`;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Motor bağlantısı kopyalandı.");
    } catch {
      toast.error("Bağlantı kopyalanamadı.");
    }
  }

  const sorted = useMemo(
    () => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)),
    [engines]
  );

  async function toggleEngine(engineId) {
    if (openId === engineId) {
      setOpenId(null);
      return;
    }
    setOpenId(engineId);
    if (recordsByEngine[engineId]) return;
    setLoadingEngineId(engineId);
    try {
      const response = await fetch(`/api/records?engine_id=${encodeURIComponent(engineId)}&page=1&page_size=20`);
      if (!response.ok) throw new Error("Bakım geçmişi yüklenemedi");
      const data = await response.json();
      setRecordsByEngine((current) => ({ ...current, [engineId]: Array.isArray(data) ? data : (data.records || []) }));
    } catch {
      toast.error("Motor bakım geçmişi yüklenemedi.");
      setRecordsByEngine((current) => ({ ...current, [engineId]: [] }));
    } finally {
      setLoadingEngineId(null);
    }
  }

  async function addEngine(e) {
    e.preventDefault();
    if (!newName.trim()) { toast.error("Motor adı gerekli."); return; }
    setSaving(true);
    const loadingToast = toast.loading("Motor ekleniyor...");
    try {
      const res = await fetch("/api/engines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          hours: Number(newHours) || 0,
          load_kw: Number(newLoad) || 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.name} eklendi! ⚙️`);
        setShowAdd(false);
        setNewName(""); setNewHours(""); setNewLoad("");
        load();
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Motor eklenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Motorlar" subtitle="Tüm motorların bakım geçmişi" />
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Motorlar"
        subtitle={`${sorted.length} motor listeleniyor`}
        right={canAdd ? (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="px-3 py-2 rounded-lg bg-amber text-[#161006] text-[12px] font-extrabold shadow hover:brightness-110 active:scale-95 transition"
          >
            {showAdd ? "✕ Vazgeç" : "＋ Yeni Motor"}
          </button>
        ) : undefined}
      />

      <div className="px-4 py-4">
        {showAdd && (
          <form onSubmit={addEngine} className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
            <div className="text-[12px] font-bold text-teal mb-2">➕ Yeni Motor Ekle</div>
            <div className="flex flex-col gap-2">
              <input
                required placeholder="Motor adı (örn. Motor 7)" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" placeholder="Güncel saat" value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
                />
                <input
                  type="number" placeholder="Yük (kW)" value={newLoad}
                  onChange={(e) => setNewLoad(e.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="py-2.5 rounded-lg bg-teal text-[#06181b] text-[12.5px] font-extrabold disabled:opacity-50 hover:brightness-110 transition"
              >
                {saving ? "Ekleniyor..." : "💾 Kaydet"}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sorted.map((e) => {
            const recs = (recordsByEngine[e._id] || [])
              .slice()
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const open = openId === e._id;
            const recordsLoading = loadingEngineId === e._id;
            return (
              <div
                key={e._id}
                className="bg-panel border border-border rounded-card overflow-hidden hover:border-borderlt transition-all"
              >
                <button
                  onClick={() => void toggleEngine(e._id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <EngineBadge name={e.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold text-text truncate">{e.name}</div>
                    <div className="text-[10.5px] text-faint mt-0.5">
                      {recs.length} bakım kaydı
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-[13px] font-bold text-amber">
                      {(e.hours || 0).toLocaleString("tr-TR")}
                    </div>
                    <div className="text-[8.5px] text-faint tracking-wide">SAAT</div>
                  </div>
                  <span className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                </button>

                {open && (
                  <div className="border-t border-border bg-[#12161d] p-3 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-panel2 rounded-lg p-2 text-center">
                        <div className="text-[9px] text-faint uppercase font-bold">Yük</div>
                        <div className="font-mono text-[13px] font-bold text-teal mt-0.5">
                          {(e.load_kw || 0).toLocaleString("tr-TR")} kW
                        </div>
                      </div>
                      <div className="bg-panel2 rounded-lg p-2 text-center">
                        <div className="text-[9px] text-faint uppercase font-bold">Son Güncelleme</div>
                        <div className="text-[11px] font-bold text-text mt-0.5">
                          {e.updated_at ? new Date(e.updated_at).toLocaleDateString("tr-TR") : "-"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQrEngine(e)}
                      className="w-full mb-3 py-2 rounded-lg border border-amber/40 bg-amber/10 text-amber text-[11px] font-bold hover:bg-amber/20 active:scale-[.98] transition"
                    >
                      ▣ Hızlı bakım QR kodu göster ve indir
                    </button>

                    {recordsLoading ? (
                      <div className="text-center text-[11px] text-muted py-4">Bakım geçmişi yükleniyor...</div>
                    ) : recs.length === 0 ? (
                      <div className="text-center text-[11px] text-faint py-4">
                        Henüz bakım kaydı yok.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                        {recs.slice(0, 20).map((r) => (
                          <div key={r._id?.toString?.() || r.group_id} className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-2 border border-border">
                            <div className="min-w-0">
                              <div className="text-[11.5px] font-semibold text-text truncate">{r.type_label}</div>
                              <div className="text-[9.5px] text-faint">
                                {new Date(r.created_at).toLocaleDateString("tr-TR")} · {r.technician_name || ""}
                              </div>
                            </div>
                            <div className="font-mono text-[11px] text-amber flex-shrink-0">
                              {(r.hour_at_completion || 0).toLocaleString("tr-TR")} sa
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">⚙️</div>
            <p className="text-sm text-muted">Henüz motor eklenmemiş.</p>
          </div>
        )}
      </div>
      {qrEngine && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${qrEngine.name} QR kodu`}
          onClick={() => setQrEngine(null)}
        >
          <div
            className="w-full max-w-sm bg-panel border border-border rounded-2xl p-4 shadow-2xl text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wider text-amber font-bold">Motor QR Kodu</div>
                <div className="text-base font-extrabold text-text mt-0.5">{qrEngine.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setQrEngine(null)}
                className="w-8 h-8 rounded-lg border border-border text-muted hover:text-text hover:bg-panel2 transition"
                aria-label="QR penceresini kapat"
              >
                ✕
              </button>
            </div>
            <div className="bg-white rounded-xl p-3 mx-auto w-fit min-h-[190px] min-w-[190px] flex items-center justify-center">
              {qrDataUrl ? <img src={qrDataUrl} alt={`${qrEngine.name} motor QR kodu`} className="w-52 h-52" /> : <span className="text-xs text-slate-600">QR hazırlanıyor...</span>}
            </div>
            <p className="text-[11px] text-muted leading-relaxed mt-3">
              Bu kod okutulduğunda uygulama doğrudan bu motorun bakım panelini açar.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => void copyQrLink()}
                className="py-2.5 rounded-lg border border-border text-muted text-[11px] font-bold hover:bg-panel2 transition"
              >
                Bağlantıyı kopyala
              </button>
              <a
                href={qrDataUrl || undefined}
                download={`${qrEngine.name.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")}-qr.png`}
                className={`py-2.5 rounded-lg bg-amber text-[#161006] text-[11px] font-extrabold transition ${qrDataUrl ? "hover:brightness-110" : "pointer-events-none opacity-50"}`}
              >
                PNG indir
              </a>
            </div>
            <button
              type="button"
              onClick={() => setQrEngine(null)}
              className="w-full mt-2 py-2.5 rounded-lg bg-panel2 border border-border text-text text-[11px] font-bold hover:bg-border transition"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
