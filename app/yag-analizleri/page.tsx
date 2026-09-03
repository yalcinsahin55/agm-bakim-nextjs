"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import { engineSortKey } from "@/lib/status";
import { uploadOilAnalysisPdf } from "@/lib/mediaUpload";
import OilAnalysisCard from "./_components/OilAnalysisCard";
import OilAnalysisFilters from "./_components/OilAnalysisFilters";
import OilAnalysisForm from "./_components/OilAnalysisForm";
import OilAnalysisPreviewModal from "./_components/OilAnalysisPreviewModal";
import OilAnalysisSummary from "./_components/OilAnalysisSummary";
import type { AnalysisResult, Engine, OilAnalysis } from "./_lib/types";

export default function YagAnalizleriPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { signal } = useAbortableFetch();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [analyses, setAnalyses] = useState<OilAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [engineId, setEngineId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<AnalysisResult>("İyi");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterEngine, setFilterEngine] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"Tümü" | "İyi" | "Dikkat" | "Kötü">("Tümü");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<OilAnalysis | null>(null);
  const canWrite = user?.role === "yonetici";

  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const [engRes, anaRes] = await Promise.all([fetch("/api/engines", { cache: "no-store", signal }), fetch("/api/oil-analyses", { cache: "no-store", signal })]);
      if (engRes.status === 401 || anaRes.status === 401) { router.push("/login"); return; }
      const engData = await engRes.json().catch(() => null) as unknown;
      const anaData = await anaRes.json().catch(() => null) as unknown;
      if (!engRes.ok || !Array.isArray(engData) || !anaRes.ok || !Array.isArray(anaData)) {
        setLoadError((engData && typeof engData === "object" && "error" in engData ? String(engData.error) : null) || (anaData && typeof anaData === "object" && "error" in anaData ? String(anaData.error) : null) || "Yağ analizleri yüklenemedi.");
        return;
      }
      setLoadError("");
      setEngines(engData as Engine[]);
      setAnalyses(anaData as OilAnalysis[]);
      if (engData.length && !engineId) setEngineId((engData as Engine[])[0]._id);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setLoadError("Yağ analizleri yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  useEffect(() => { if (!signal.aborted) void load(); }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  async function submit() {
    if (!file) { toast.error("Lütfen bir PDF dosyası seçin."); return; }
    if (file.type !== "application/pdf") { toast.error("Sadece PDF dosyası yükleyebilirsiniz."); return; }
    setSaving(true);
    const loadingToast = toast.loading("Rapor yükleniyor...");
    try {
      const uploadResult = await uploadOilAnalysisPdf(file);

      const res = await fetch("/api/oil-analyses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine_id: engineId, analysis_date: date, result, note, pdf_url: uploadResult.url, pdf_filename: uploadResult.filename }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Analiz raporu kaydedildi! 🧪");
        setNote(""); setFile(null); setShowForm(false);
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Rapor kaydedilemedi.");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : "Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  async function loadPdf(analysis: OilAnalysis): Promise<OilAnalysis | null> {
    try {
      const res = await fetch(`/api/oil-analyses/${analysis._id}`);
      if (!res.ok) throw new Error("PDF yüklenemedi");
      const data = await res.json();
      return {
        ...analysis,
        // PDF’yi aynı-origin route üzerinden sunmak; mobil Chrome iframe ve Blob header sorunlarını önler.
        pdf_url: `/api/oil-analyses/${analysis._id}/file`,
        pdf_b64: data.pdf_b64 || analysis.pdf_b64,
        pdf_filename: data.pdf_filename || analysis.pdf_filename,
      };
    } catch {
      toast.error("PDF yüklenemedi.");
      return null;
    }
  }

  async function openPreview(analysis: OilAnalysis) {
    const detail = await loadPdf(analysis);
    if (detail) setPreview(detail);
  }

  async function downloadPdf(analysis: OilAnalysis) {
    const detail = await loadPdf(analysis);
    const source = detail?.pdf_url;
    if (!source) return;
    const link = document.createElement("a");
    link.href = `${source}?download=1`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = detail.pdf_filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function remove(id: string) {
    const loadingToast = toast.loading("Rapor siliniyor...");
    try {
      const res = await fetch(`/api/oil-analyses/${id}`, { method: "DELETE" });
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Rapor silindi! 🗑️");
        setConfirmDeleteId(null);
        load();
      } else {
        toast.error("Rapor silinemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  const resultCounts = {
    good: analyses.filter((analysis) => analysis.result === "İyi").length,
    attention: analyses.filter((analysis) => analysis.result === "Dikkat").length,
    bad: analyses.filter((analysis) => analysis.result === "Kötü").length,
  };
  const filtered = analyses.filter((analysis) => {
    const matchesEngine = filterEngine === "Tümü" || analysis.engine_id === filterEngine;
    const matchesResult = resultFilter === "Tümü" || analysis.result === resultFilter;
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    const matchesSearch = !needle || [analysis.engine_name, analysis.pdf_filename, analysis.uploaded_by, analysis.note].filter(Boolean).some((value) => String(value).toLocaleLowerCase("tr-TR").includes(needle));
    return matchesEngine && matchesResult && matchesSearch;
  });

  if (loading) {
    return (
      <div>
        <TopBar title="Yağ Analizleri" subtitle="" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <TopBar title="Yağ Analizleri" />
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
      <TopBar title="Yağ Analizleri" subtitle={`${filtered.length}/${analyses.length} rapor listeleniyor`} />
      <div className="px-4 py-4">
        <OilAnalysisSummary
          good={resultCounts.good}
          attention={resultCounts.attention}
          bad={resultCounts.bad}
        />
        {canWrite && (
          <button
            onClick={() => setShowForm((s) => !s)}
          className={`w-full py-3 rounded-xl font-bold text-[13px] mb-3 transition-all ${
            showForm
              ? "border border-border text-muted hover:bg-panel2"
              : "border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
          }`}
        >
            {showForm ? "✕ Kapat" : "➕ Yeni Analiz Raporu Ekle"}
          </button>
        )}

        {canWrite && showForm && (
          <OilAnalysisForm
            engines={sortedEngines}
            engineId={engineId}
            date={date}
            result={result}
            note={note}
            file={file}
            saving={saving}
            onEngineChange={setEngineId}
            onDateChange={setDate}
            onResultChange={setResult}
            onNoteChange={setNote}
            onFileChange={setFile}
            onSubmit={submit}
          />
        )}

        <OilAnalysisFilters
          engines={sortedEngines}
          search={search}
          filterEngine={filterEngine}
          resultFilter={resultFilter}
          onSearchChange={setSearch}
          onEngineFilterChange={setFilterEngine}
          onResultFilterChange={setResultFilter}
        />

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🧪</div>
            <p className="text-sm text-muted">Henüz analiz raporu eklenmemiş.</p>
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {filtered.map((analysis) => (
              <OilAnalysisCard
                key={analysis._id}
                analysis={analysis}
                canDelete={user?.role === "yonetici" || user?._id === analysis.uploaded_by_id}
                confirmDelete={confirmDeleteId === analysis._id}
                onPreview={() => void openPreview(analysis)}
                onDownload={() => void downloadPdf(analysis)}
                onRequestDelete={() => setConfirmDeleteId(analysis._id)}
                onConfirmDelete={() => void remove(analysis._id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {preview && <OilAnalysisPreviewModal analysis={preview} onClose={() => setPreview(null)} />}

      <BottomNav />
    </div>
  );
}
