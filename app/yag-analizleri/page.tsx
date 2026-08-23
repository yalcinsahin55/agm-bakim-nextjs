"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

interface OilAnalysis {
  _id: string;
  engine_id: string;
  engine_name: string;
  analysis_date: string;
  result: string;
  note?: string;
  pdf_url?: string;
  pdf_b64?: string;
  pdf_filename: string;
  uploaded_by: string;
  uploaded_by_id: string;
  created_at: string;
}

export default function YagAnalizleriPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [analyses, setAnalyses] = useState<OilAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [engineId, setEngineId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("İyi");
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
      const [engRes, anaRes] = await Promise.all([fetch("/api/engines", { cache: "no-store" }), fetch("/api/oil-analyses", { cache: "no-store" })]);
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
    } catch {
      setLoadError("Yağ analizleri yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  async function submit() {
    if (!file) { toast.error("Lütfen bir PDF dosyası seçin."); return; }
    if (file.type !== "application/pdf") { toast.error("Sadece PDF dosyası yükleyebilirsiniz."); return; }
    setSaving(true);
    const loadingToast = toast.loading("Rapor yükleniyor...");
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("folder", "oil-analyses");
      const uploadRes = await fetch("/api/blob/upload-server", { method: "POST", body: uploadData });
      const uploadResult = await uploadRes.json() as { url?: string; error?: string };
      if (!uploadRes.ok || !uploadResult.url) throw new Error(uploadResult.error || "PDF yüklenemedi.");

      const res = await fetch("/api/oil-analyses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine_id: engineId, analysis_date: date, result, note, pdf_url: uploadResult.url, pdf_filename: file.name }),
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
          <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 flex flex-col gap-2 animate-fade-in">
            <select value={engineId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEngineId(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
              {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition" />
            <select value={result} onChange={(e: ChangeEvent<HTMLSelectElement>) => setResult(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition">
              <option>İyi</option><option>Dikkat</option><option>Kötü</option>
            </select>
            <textarea value={note} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)} placeholder="Not (opsiyonel)" rows={2} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-teal transition" />
            <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
              📄 {file ? file.name : "PDF raporu seç"}
              <input type="file" accept="application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <button onClick={submit} disabled={saving} className="py-3 rounded-xl bg-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Yükleniyor...
                </span>
              ) : "💾 Raporu Kaydet"}
            </button>
          </div>
        )}

        <div className="mb-3 rounded-card border border-border bg-panel p-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Motor veya numune ara..." aria-label="Motor veya numune ara" className="w-full min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20" />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select value={filterEngine} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterEngine(e.target.value)} aria-label="Analiz motor filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[11px] font-bold text-text outline-none focus:border-teal transition">
              <option value="Tümü">Tüm motorlar</option>
              {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as "Tümü" | "İyi" | "Dikkat" | "Kötü")} aria-label="Analiz sonuç filtresi" className="min-w-0 rounded-xl border border-border bg-panel2 px-3 py-2.5 text-[11px] font-bold text-text outline-none focus:border-teal transition">
              <option value="Tümü">Tüm sonuçlar</option><option value="İyi">İyi</option><option value="Dikkat">Dikkat</option><option value="Kötü">Kötü</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🧪</div>
            <p className="text-sm text-muted">Henüz analiz raporu eklenmemiş.</p>
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {filtered.map((a) => (
              <div key={a._id} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-teal/30 bg-teal/10 text-lg" aria-hidden="true">🧪</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-text">{a.engine_name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" />{a.result}</div>
                    <div className="mt-1 text-[11px] text-faint">{new Date(a.analysis_date).toLocaleDateString("tr-TR")} · {a.uploaded_by}</div>
                    {a.note && <div className="mt-1 text-[11px] text-muted">📝 {a.note}</div>}
                  </div>
                  <button type="button" onClick={() => void openPreview(a)} className="flex-shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-[10.5px] font-bold text-teal hover:bg-teal/10 transition" aria-label={`${a.engine_name} PDF önizlemesini aç`}>PDF’yi aç</button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border pt-2.5">
                  <button type="button" onClick={() => void downloadPdf(a)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted hover:border-teal/40 hover:text-teal transition">📄 İndir</button>
                  {(user?.role === "yonetici" || user?._id === a.uploaded_by_id) && (confirmDeleteId === a._id ? <><button type="button" onClick={() => void remove(a._id)} className="rounded-lg bg-red px-2.5 py-1.5 text-[11px] font-bold text-white hover:brightness-110 transition">Evet</button><button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted hover:bg-panel2 transition">Vazgeç</button></> : <button type="button" onClick={() => setConfirmDeleteId(a._id)} className="rounded-lg border border-red/40 px-2.5 py-1.5 text-[11px] font-bold text-red hover:bg-red/10 transition">Sil</button>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*  PDF Önizleme Penceresi */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setPreview(null)}>
          <div className="relative w-full max-w-3xl h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 flex-1 text-[12px] font-bold text-text truncate">📄 {preview.pdf_filename}</div>
              <div className="flex items-center gap-1.5 ml-2">
                <a
                  href={`${preview.pdf_url || ""}?download=1`}
                  className="rounded-lg border border-amber/40 px-2 py-1 text-[10px] font-bold text-amber"
                >
                  İndir
                </a>
                <button
                type="button"
                onClick={() => setPreview(null)}
                className="w-8 h-8 rounded-full bg-panel text-text text-lg hover:bg-red hover:text-white transition flex-shrink-0 ml-2"
                  aria-label="Kapat"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={preview.pdf_url || (preview.pdf_b64 ? `data:application/pdf;base64,${preview.pdf_b64.replace(/^data:application\/pdf;base64,/, "")}` : undefined)}
              title={preview.pdf_filename}
              className="w-full h-[calc(100%-3rem)] rounded-xl border border-border bg-white"
              aria-label={`${preview.pdf_filename} PDF önizlemesi`}
            />
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
