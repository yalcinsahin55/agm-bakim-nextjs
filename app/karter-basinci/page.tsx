"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import { engineSortKey } from "@/lib/status";
import PressureEntryForm from "./_components/PressureEntryForm";
import PressureHistory from "./_components/PressureHistory";
import PressureImportPanel from "./_components/PressureImportPanel";
import type { ImportResult, PressureEngine, PressureEntry, PressurePage, PressureReading, PressureTab } from "./_components/types";
import { fileToBase64 } from "./_lib/fileToBase64";

export default function KarterBasinciPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { signal } = useAbortableFetch();
  const [engines, setEngines] = useState<PressureEngine[]>([]);
  const [readings, setReadings] = useState<PressureReading[]>([]);
  const [readingsTotal, setReadingsTotal] = useState(0);
  const [readingPage, setReadingPage] = useState(1);
  const [hasMoreReadings, setHasMoreReadings] = useState(false);
  const [loadingMoreReadings, setLoadingMoreReadings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PressureTab>("new");

  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<Record<string, PressureEntry>>({});
  const [saving, setSaving] = useState(false);

  const [historyEngine, setHistoryEngine] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const [engRes, readRes] = await Promise.all([fetch("/api/engines", { cache: "no-store", signal }), fetch("/api/pressure-readings?page=1&page_size=250", { cache: "no-store", signal })]);
      if (engRes.status === 401 || readRes.status === 401) { router.push("/login"); return; }
      const engData = await engRes.json().catch(() => null) as unknown;
      const readData = await readRes.json().catch(() => null) as unknown;
      const pageData = readData && typeof readData === "object" && !Array.isArray(readData) ? readData as Partial<PressurePage> : null;
      const readingList = Array.isArray(readData) ? readData as PressureReading[] : Array.isArray(pageData?.items) ? pageData.items : null;
      if (!engRes.ok || !Array.isArray(engData) || !readRes.ok || !readingList) {
        setLoadError((engData && typeof engData === "object" && "error" in engData ? String(engData.error) : null) || (readData && typeof readData === "object" && "error" in readData ? String(readData.error) : null) || "Karter basıncı verileri yüklenemedi.");
        return;
      }
      setLoadError("");
      const engineList = engData as PressureEngine[];
      setEngines(engineList);
      setReadings(readingList);
      setReadingsTotal(typeof pageData?.total === "number" ? pageData.total : readingList.length);
      setReadingPage(typeof pageData?.page === "number" ? pageData.page : 1);
      setHasMoreReadings(pageData?.has_more === true);
      if (engineList.length) setHistoryEngine((current) => current || engineList[0]._id);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setLoadError("Karter basıncı verileri yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router, signal]);

  async function loadMoreReadings() {
    if (loadingMoreReadings || !hasMoreReadings) return;
    setLoadingMoreReadings(true);
    try {
      const response = await fetch(`/api/pressure-readings?page=${readingPage + 1}&page_size=250`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as (Partial<PressurePage> & { error?: string }) | null;
      const items = Array.isArray(data?.items) ? data.items : null;
      if (!response.ok || !items) throw new Error(data?.error || "Daha fazla ölçüm yüklenemedi.");
      setReadings((current) => [...current, ...items]);
      setReadingPage(typeof data?.page === "number" ? data.page : readingPage + 1);
      setHasMoreReadings(data?.has_more === true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Daha fazla ölçüm yüklenemedi.");
    } finally {
      setLoadingMoreReadings(false);
    }
  }

  useEffect(() => { void load(); }, [load]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  function updateEntry(engineId: string, field: "maint" | "load_kw" | "pressure_bar", value: boolean | string) {
    setEntries((prev) => ({ ...prev, [engineId]: { ...prev[engineId], [field]: value } }));
  }

  async function saveReadings() {
    setSaving(true);
    const payload = sortedEngines
      .map((e) => {
        const entry = entries[e._id] || {};
        if (entry.maint) return { engine_id: e._id, status: "BAKIMDA" };
        const load_kw = entry.load_kw !== undefined && entry.load_kw !== "" ? Number(entry.load_kw) : null;
        const pressure_bar = entry.pressure_bar !== undefined && entry.pressure_bar !== "" ? Number(entry.pressure_bar) : null;
        if (load_kw === null && pressure_bar === null) return null;
        return { engine_id: e._id, load_kw, pressure_bar };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      toast.error("Kaydedilecek bir değer girilmedi.");
      setSaving(false);
      return;
    }

    const loadingToast = toast.loading("Ölçümler kaydediliyor...");
    try {
      const res = await fetch("/api/pressure-readings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_date: readingDate, entries: payload }),
      });
      if (res.ok) {
        const data = await res.json() as ImportResult;
        toast.dismiss(loadingToast);
        toast.success(`${data.inserted} motor için ölçüm kaydedildi! 📊`);
        setEntries({});
        load();
      } else {
        const data = await res.json() as ImportResult;
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kaydedilemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  async function removeReading(id: string) {
    const loadingToast = toast.loading("Siliniyor...");
    try {
      const res = await fetch(`/api/pressure-readings/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Silinemedi.");
      toast.dismiss(loadingToast);
      toast.success("Kayıt silindi! 🗑️");
      void load();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : "Silinemedi.");
    }
  }

  async function doImport() {
    if (!importFile) return;
    setImporting(true);
    const loadingToast = toast.loading("Dosya işleniyor...");
    try {
      const file_b64 = await fileToBase64(importFile);
      const res = await fetch("/api/pressure-readings/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_b64 }),
      });
      const data = await res.json() as ImportResult;
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.inserted} ölçüm kaydı eklendi! 📥`);
        load();
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Dosya okunamadı.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("İçe aktarma hatası.");
    } finally {
      setImporting(false);
    }
  }

  const historyEngines = sortedEngines.filter((engine) => {
    const needle = historySearch.trim().toLocaleLowerCase("tr-TR");
    return !needle || engine.name.toLocaleLowerCase("tr-TR").includes(needle);
  });
  const engineHistory = readings.filter((r) => r.engine_id === historyEngine).sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
  const numericHistory = engineHistory.filter((r): r is PressureReading & { pressure_bar: number } => typeof r.pressure_bar === "number");
  const selectedHistoryEngine = sortedEngines.find((engine) => engine._id === historyEngine);
  const canWrite = user?.role === "yonetici";
  const visibleTab = canWrite ? tab : "history";
  const tabs: Array<[PressureTab, string]> = canWrite
    ? [["new", "➕ Yeni Ölçüm"], ["history", "📈 Geçmiş"], ["import", "📥 İçe Aktar"]]
    : [["history", "📈 Geçmiş"]];

  if (loading) {
    return (
      <div>
        <TopBar title="Karter Fark Basıncı" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <Skeleton className="h-6 w-full rounded-xl mb-3" />
          <Skeleton className="h-4 w-3/4 mb-3" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <TopBar title="Karter Fark Basıncı" />
        <div className="px-4 py-8 text-center">
          <div className="rounded-card border border-red/30 bg-panel p-6">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-red">{loadError}</p>
            <button onClick={() => { setLoading(true); void load(); }} className="mt-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 text-sm font-bold text-teal">Tekrar dene</button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Karter Fark Basıncı" />
      <div className="px-4 py-4">
        <section className="mb-3 rounded-card border border-teal/30 bg-teal/5 p-4">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-2xl" aria-hidden="true">📈</div><div className="min-w-0"><h1 className="font-display text-[14px] font-bold uppercase tracking-wide text-text">Basınç durumu</h1><p className="mt-0.5 text-[10.5px] text-muted">Motor yükü ve karter fark basıncını tek akışta takip et.</p></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-border bg-panel px-2.5 py-2"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Motor sayısı</div><div className="mt-1 font-mono text-lg font-bold text-teal">{engines.length}</div></div><div className="rounded-xl border border-border bg-panel px-2.5 py-2"><div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Toplam ölçüm</div><div className="mt-1 font-mono text-lg font-bold text-amber">{readingsTotal}</div></div></div>
        </section>
        {/* Modern Tab Butonları */}
        <div className="flex gap-1 overflow-x-auto bg-panel2 p-1 rounded-xl border border-border mb-4">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold transition-all ${
                visibleTab === key ? "bg-teal text-[#06181b] shadow-lg" : "text-faint hover:text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {canWrite && visibleTab === "new" && (
          <PressureEntryForm
            engines={sortedEngines}
            entries={entries}
            readingDate={readingDate}
            onReadingDateChange={setReadingDate}
            onEntryChange={updateEntry}
          />
        )}

        {visibleTab === "history" && (
          <PressureHistory
            historyEngines={historyEngines}
            historyEngine={historyEngine}
            historySearch={historySearch}
            selectedHistoryEngine={selectedHistoryEngine}
            engineHistory={engineHistory}
            numericHistory={numericHistory}
            readingsLength={readings.length}
            readingsTotal={readingsTotal}
            hasMoreReadings={hasMoreReadings}
            loadingMoreReadings={loadingMoreReadings}
            onHistoryEngineChange={setHistoryEngine}
            onHistorySearchChange={setHistorySearch}
            onLoadMore={loadMoreReadings}
            onRemove={removeReading}
            canDelete={(uploadedById) => user?.role === "yonetici" || user?.id === uploadedById}
          />
        )}

        {canWrite && visibleTab === "import" && (
          <PressureImportPanel
            importFile={importFile}
            importing={importing}
            onFileChange={setImportFile}
            onImport={doImport}
          />
        )}
      </div>

      {/* 💾 Kaydet butonu — animate-fade-in DIŞINDA (transform fixed'i bozmasın diye) */}
      {canWrite && visibleTab === "new" && (
        <div className="fixed bottom-32 md:bottom-8 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              onClick={saveReadings}
              disabled={saving}
              className="w-full py-3.5 rounded-xl bg-teal text-[#06181b] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Kaydediliyor...
                </span>
              ) : (
                "💾 Tüm Ölçümleri Kaydet"
              )}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
