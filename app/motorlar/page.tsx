"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { usePageData } from "@/lib/usePageData";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import { engineSortKey } from "@/lib/status";
import { buildQuickMaintenanceLink } from "@/lib/quickMaintenanceLink";
import EngineAddForm from "./_components/EngineAddForm";
import EngineMaintenanceCard from "./_components/EngineMaintenanceCard";
import EngineQrModal from "./_components/EngineQrModal";
import type { EngineResponse, MotorEngine, MotorMaintenanceRecord } from "./_lib/types";

export default function MotorlarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [recordsByEngine, setRecordsByEngine] = useState<Record<string, MotorMaintenanceRecord[]>>({});
  const [loadingEngineId, setLoadingEngineId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [qrEngine, setQrEngine] = useState<MotorEngine | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newLoad, setNewLoad] = useState("");
  const [saving, setSaving] = useState(false);
  const { signal } = useAbortableFetch();

  const canAdd = user?.role === "yonetici";

  const { data: engines, loading, reload } = usePageData<MotorEngine[]>(async (signal) => {
    const response = await fetch("/api/engines?include_maintenance_counts=true", { signal });
    if (response.status === 401) {
      router.push("/login");
      return [];
    }
    if (!response.ok) throw new Error("Motorlar yüklenemedi");
    const data = await response.json() as unknown;
    return Array.isArray(data) ? data as MotorEngine[] : [];
  }, [], [router], "Motorlar yüklenemedi. Lütfen tekrar deneyin.");

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
    fetch(`/api/records?engine_id=${encodeURIComponent(engine._id)}&page=1&page_size=20`, { signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Bakım geçmişi yüklenemedi");
        const data = await response.json() as unknown;
        const records = Array.isArray(data) ? data as MotorMaintenanceRecord[] : (data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records) ? (data as { records: MotorMaintenanceRecord[] }).records : []);
        setRecordsByEngine((current) => ({ ...current, [engine._id]: records }));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("QR ile motor geçmişi yüklenemedi.");
      })
      .finally(() => { if (!signal.aborted) setLoadingEngineId(null); });
    // QR bağlantısı aynı sayfa açıkken yalnızca ilgili motoru otomatik açar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engines, searchParams, signal]);

  useEffect(() => {
    if (!qrEngine) {
      setQrDataUrl("");
      return;
    }
    const value = buildQuickMaintenanceLink({
      origin: typeof window === "undefined" ? "" : window.location.origin,
      engineId: qrEngine._id,
    });
    let active = true;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(value, { width: 320, margin: 2, errorCorrectionLevel: "M" }))
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl); })
      .catch(() => {
        if (!active) return;
        setQrDataUrl("");
        toast.error("QR kod oluşturulamadı.");
      });
    return () => { active = false; };
  }, [qrEngine]);

  async function copyQrLink() {
    if (!qrEngine) return;
    const value = buildQuickMaintenanceLink({ origin: window.location.origin, engineId: qrEngine._id });
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
  const visibleEngines = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("tr-TR");
    if (!query) return sorted;
    return sorted.filter((engine) => engine.name.toLocaleLowerCase("tr-TR").includes(query));
  }, [searchTerm, sorted]);
  const averageLoad = useMemo(() => visibleEngines.length ? visibleEngines.reduce((sum, engine) => sum + (engine.load_kw || 0), 0) / visibleEngines.length : 0, [visibleEngines]);

  async function toggleEngine(engineId: string): Promise<void> {
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
      const data = await response.json() as unknown;
      const records = Array.isArray(data) ? data as MotorMaintenanceRecord[] : (data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records) ? (data as { records: MotorMaintenanceRecord[] }).records : []);
      setRecordsByEngine((current) => ({ ...current, [engineId]: records }));
    } catch {
      toast.error("Motor bakım geçmişi yüklenemedi.");
      setRecordsByEngine((current) => ({ ...current, [engineId]: [] }));
    } finally {
      setLoadingEngineId(null);
    }
  }

  async function addEngine(e: React.FormEvent<HTMLFormElement>) {
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
      const data = await res.json() as EngineResponse;
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.name} eklendi! ⚙️`);
        setShowAdd(false);
        setNewName(""); setNewHours(""); setNewLoad("");
        void reload();
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
        <section className="relative mb-4 overflow-hidden rounded-card border border-teal/30 bg-gradient-to-br from-teal/10 via-panel to-panel p-4 shadow-lg shadow-black/10" aria-labelledby="engines-heading">
          <div className="pointer-events-none absolute -right-10 -top-16 h-36 w-36 rounded-full border border-white/5 bg-white/[0.02]" aria-hidden="true" />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">Ekipman envanteri</div>
            <h1 id="engines-heading" className="mt-1 text-[23px] font-extrabold tracking-tight text-text">Motorları durumuyla izle.</h1>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">Çalışma saati, yük ve bakım geçmişi aynı görünümde.</p>
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 sm:grid-cols-3">
            <div><div className="text-[9px] font-bold uppercase tracking-wider text-faint">İzlenen motor</div><div className="mt-1 font-mono text-lg font-extrabold text-text">{visibleEngines.length}</div></div>
            <div><div className="text-[9px] font-bold uppercase tracking-wider text-faint">Ortalama yük</div><div className="mt-1 font-mono text-lg font-extrabold text-teal">{averageLoad.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} kW</div></div>
          </div>
        </section>
        <div className="mb-3 flex gap-2">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Motor ara..."
            aria-label="Motor ara"
            className="min-w-0 flex-1 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[12px] text-text outline-none transition placeholder:text-faint focus:border-teal"
          />
          {searchTerm && <button type="button" onClick={() => setSearchTerm("")} className="flex-shrink-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[11px] font-bold text-muted transition hover:border-amber/50 hover:text-text" aria-label="Motor aramasını temizle">Temizle</button>}
          <div className="flex flex-shrink-0 items-center rounded-xl border border-border bg-panel2 px-2.5 text-[10px] font-bold text-muted">Sırala: Motor no</div>
        </div>
        <div className="mb-3 text-[11px] text-muted" aria-live="polite">{visibleEngines.length} / {sorted.length} motor gösteriliyor</div>
        {showAdd && (
          <EngineAddForm
            name={newName}
            hours={newHours}
            load={newLoad}
            saving={saving}
            onNameChange={setNewName}
            onHoursChange={setNewHours}
            onLoadChange={setNewLoad}
            onSubmit={addEngine}
          />
        )}

        <div className="flex flex-col gap-1.5">
          {visibleEngines.map((engine) => (
            <EngineMaintenanceCard
              key={engine._id}
              engine={engine}
              records={recordsByEngine[engine._id] || []}
              open={openId === engine._id}
              recordsLoading={loadingEngineId === engine._id}
              onToggle={() => void toggleEngine(engine._id)}
              onShowQr={() => setQrEngine(engine)}
            />
          ))}
        </div>
        {sorted.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">⚙️</div>
            <p className="text-sm text-muted">Henüz motor eklenmemiş.</p>
          </div>
        )}
        {sorted.length > 0 && visibleEngines.length === 0 && (
          <div className="text-center py-10 bg-panel border border-border rounded-card">
            <div className="text-3xl mb-3">🔎</div>
            <p className="text-sm text-muted">Aramanla eşleşen motor bulunamadı.</p>
            <button type="button" onClick={() => setSearchTerm("")} className="mt-3 rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-[11px] font-bold text-teal">Aramayı temizle</button>
          </div>
        )}
      </div>
      {qrEngine && (
        <EngineQrModal
          engine={qrEngine}
          qrDataUrl={qrDataUrl}
          onClose={() => setQrEngine(null)}
          onCopy={() => void copyQrLink()}
        />
      )}
      <BottomNav />
    </div>
  );
}
