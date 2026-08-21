"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MiniLineChart({ points, color = "#e8952f", label = "" }) {
  if (points.length < 2) return null;
  const w = 400, h = 140, pad = 15;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  
  const path = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const areaPath = path + ` L${pad + (w - pad * 2)},${h - pad} L${pad},${h - pad} Z`;

  return (
    <div className="relative bg-panel border border-border rounded-card p-3 hover:border-borderlt transition-all group">
      {label && <div className="text-[10px] text-faint uppercase font-bold mb-2">{label}</div>}
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#gradient-${color})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = pad + (i / (points.length - 1)) * (w - pad * 2);
          const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <title>{`${p.label || i + 1}: ${p.y.toLocaleString("tr-TR")} bar`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

export default function KarterBasinciPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("new");

  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);

  const [historyEngine, setHistoryEngine] = useState("");

  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const [engRes, readRes] = await Promise.all([fetch("/api/engines"), fetch("/api/pressure-readings")]);
    if (engRes.status === 401) { router.push("/login"); return; }
    const engData = await engRes.json();
    const readData = await readRes.json();
    setEngines(engData);
    setReadings(readData);
    setLoading(false);
    if (engData.length && !historyEngine) setHistoryEngine(engData[0]._id);
  }

  useEffect(() => { load(); }, []);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  function updateEntry(engineId, field, value) {
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
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.success(`${data.inserted} motor için ölçüm kaydedildi! 📊`);
        setEntries({});
        load();
      } else {
        const data = await res.json();
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

  async function removeReading(id) {
    const loadingToast = toast.loading("Siliniyor...");
    try {
      await fetch(`/api/pressure-readings/${id}`, { method: "DELETE" });
      toast.dismiss(loadingToast);
      toast.success("Kayıt silindi! 🗑️");
      load();
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Silinemedi.");
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
      const data = await res.json();
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

  const engineHistory = readings.filter((r) => r.engine_id === historyEngine).sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
  const numericHistory = engineHistory.filter((r) => r.pressure_bar !== null && r.pressure_bar !== undefined);

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

  return (
    <div>
      <TopBar title="Karter Fark Basıncı" />
      <div className="px-4 py-4">
        {/* Modern Tab Butonları */}
        <div className="flex gap-1 bg-[#12161d] p-1 rounded-xl border border-border mb-4">
          {[["new", "➕ Yeni Ölçüm"], ["history", "📈 Geçmiş"], ["import", "📥 İçe Aktar"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold transition-all ${
                tab === key ? "bg-amber text-[#161006] shadow-lg" : "text-faint hover:text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "new" && (
          <div className="animate-fade-in">
            <input
              type="date"
              value={readingDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setReadingDate(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <p className="text-[11px] text-faint mb-3">Her motor için yük ve fark basıncını girin, bakımda/yedek olanları işaretleyin.</p>
            <div className="flex flex-col gap-2 mb-40">
              {sortedEngines.map((e) => {
                const entry = entries[e._id] || {};
                return (
                  <div key={e._id} className="bg-panel border border-border rounded-card p-3 hover:border-borderlt transition-all hover:-translate-y-0.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-bold text-text">{e.name}</span>
                      <label className="flex items-center gap-1.5 text-[10.5px] text-muted cursor-pointer hover:text-text transition">
                        <input
                          type="checkbox"
                          checked={!!entry.maint}
                          onChange={(ev) => updateEntry(e._id, "maint", ev.target.checked)}
                          className="rounded border-border"
                        />
                        Bakımda/Yedek
                      </label>
                    </div>
                    {!entry.maint && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Yük (kW)"
                          value={entry.load_kw ?? ""}
                          onChange={(ev) => updateEntry(e._id, "load_kw", ev.target.value)}
                          className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Fark Basıncı (bar)"
                          value={entry.pressure_bar ?? ""}
                          onChange={(ev) => updateEntry(e._id, "pressure_bar", ev.target.value)}
                          className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="fixed bottom-32 left-0 right-0 z-40 px-4 pointer-events-none">
              <div className="max-w-lg mx-auto pointer-events-auto">
                <button
                  onClick={saveReadings}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
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
          </div>
        )}

        {tab === "history" && (
          <div className="animate-fade-in">
            <select
              value={historyEngine}
              onChange={(e) => setHistoryEngine(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            >
              {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>

            {numericHistory.length >= 2 && (
              <div className="mb-3">
                <MiniLineChart
                  points={numericHistory.map((r, i) => ({
                    y: r.pressure_bar,
                    label: new Date(r.reading_date).toLocaleDateString("tr-TR")
                  }))}
                  color="#e8952f"
                  label="Fark Basıncı (bar)"
                />
              </div>
            )}

            {engineHistory.length === 0 ? (
              <div className="text-center py-12 bg-panel border border-border rounded-card">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-sm text-muted">Bu motor için henüz ölçüm kaydı yok.</p>
                <p className="text-xs text-faint mt-1">Yeni ölçüm ekleyerek başlayın.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {[...engineHistory].reverse().map((r) => (
                  <div key={r._id} className="flex items-center justify-between bg-panel border border-border rounded-xl px-3 py-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5 group">
                    <div className="text-[12px] text-text flex-1">
                      <span className="font-semibold">{new Date(r.reading_date).toLocaleDateString("tr-TR")}</span>
                      <span className="text-faint mx-2">·</span>
                      <span className="text-amber font-mono">{r.pressure_bar ?? r.status ?? "-"} bar</span>
                      {r.load_kw !== null && r.load_kw !== undefined && (
                        <>
                          <span className="text-faint mx-2">·</span>
                          <span className="text-teal font-mono">{r.load_kw} kW</span>
                        </>
                      )}
                    </div>
                    {(user?.role === "yonetici" || user?.role === "planlamaci" || user?.id === r.uploaded_by_id) && (
                      <button
                        onClick={() => removeReading(r._id)}
                        className="text-[11px] text-red font-bold flex-shrink-0 ml-2 opacity-60 group-hover:opacity-100 hover:scale-110 transition"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "import" && (
          <div className="bg-panel border border-border rounded-card p-3.5 animate-fade-in">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">📊</span>
              <p className="text-[12px] text-muted leading-relaxed flex-1">
                KARTER_FARK_BASINÇLARI.xlsx ile aynı yapıdaki bir dosyayı yükleyerek geçmiş ölçümleri toplu ekleyebilirsiniz.
                Her sayfa adı bir tarih (GG.AA.YYYY) olmalıdır.
              </p>
            </div>
            <label className="flex items-center gap-2 border-2 border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-3 hover:border-amber hover:bg-amber/5 transition">
              <span className="text-lg">📁</span>
              <span className="flex-1">{importFile ? importFile.name : "Excel dosyası seç (.xlsx)"}</span>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <button
              onClick={doImport}
              disabled={importing || !importFile}
              className="w-full py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
            >
              {importing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                  İçe aktarılıyor...
                </span>
              ) : (
                "📥 İçe Aktar"
              )}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
