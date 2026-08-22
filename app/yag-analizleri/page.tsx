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

const RESULT_ICON: Record<string, string> = { "İyi": "🟢", "Dikkat": "", "Kötü": "🔴" };

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<OilAnalysis | null>(null);
  const canWrite = user?.role !== "goruntuleyici";

  async function load() {
    const [engRes, anaRes] = await Promise.all([fetch("/api/engines"), fetch("/api/oil-analyses")]);
    if (engRes.status === 401) { router.push("/login"); return; }
    const engData = await engRes.json() as Engine[];
    const anaData = await anaRes.json() as OilAnalysis[];
    setEngines(engData);
    setAnalyses(anaData);
    setLoading(false);
    if (engData.length && !engineId) setEngineId(engData[0]._id);
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

  const filtered = filterEngine === "Tümü" ? analyses : analyses.filter((a) => a.engine_id === filterEngine);

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

  return (
    <div>
      <TopBar title="Yağ Analizleri" subtitle={`${filtered.length} rapor listeleniyor`} />
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
            <button onClick={submit} disabled={saving} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition">
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  Yükleniyor...
                </span>
              ) : "💾 Raporu Kaydet"}
            </button>
          </div>
        )}

        <select value={filterEngine} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterEngine(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal transition">
          <option value="Tümü">Tüm Motorlar</option>
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🧪</div>
            <p className="text-sm text-muted">Henüz analiz raporu eklenmemiş.</p>
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {filtered.map((a) => (
              <div key={a._id} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-text truncate">{a.engine_name} · {RESULT_ICON[a.result] || "⚪"} {a.result}</div>
                    <div className="text-[11px] text-faint mt-0.5">{new Date(a.analysis_date).toLocaleDateString("tr-TR")} · {a.uploaded_by}</div>
                    {a.note && <div className="text-[11.5px] text-muted mt-1">📝 {a.note}</div>}
                  </div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => openPreview(a)}
                    className="flex-1 text-[11px] font-bold text-amber border border-amber/40 rounded-lg px-2.5 py-1.5 hover:bg-amber/10 transition"
                  >
                    👁️ Görüntüle
                  </button>
                  <button
                    onClick={() => downloadPdf(a)}
                    className="flex-1 text-center text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5 hover:bg-teal/10 transition"
                  >
                    📄 İndir
                  </button>
                  {(user?.role === "yonetici" || user?._id === a.uploaded_by_id) && (
                    confirmDeleteId === a._id ? (
                      <>
                        <button onClick={() => remove(a._id)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5 hover:brightness-110 transition">Evet</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-panel2 transition">Vazgeç</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(a._id)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5 hover:bg-red/10 transition">🗑️</button>
                    )
                  )}
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
