"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
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

function MiniLineChart({ points }) {
  if (points.length < 2) return null;
  const w = 300, h = 120, pad = 8;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const path = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="bg-panel border border-border rounded-card">
      <path d={path} fill="none" stroke="#e8952f" strokeWidth="2.5" />
    </svg>
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
  const [message, setMessage] = useState(null);

  const [historyEngine, setHistoryEngine] = useState("");

  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);

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

  useEffect(() => { load(); }, []); // eslint-disable-line

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  function updateEntry(engineId, field, value) {
    setEntries((prev) => ({ ...prev, [engineId]: { ...prev[engineId], [field]: value } }));
  }

  async function saveReadings() {
    setSaving(true);
    setMessage(null);
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

    if (payload.length === 0) { setMessage({ ok: false, text: "Kaydedilecek bir değer girilmedi." }); setSaving(false); return; }

    const res = await fetch("/api/pressure-readings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reading_date: readingDate, entries: payload }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setMessage({ ok: true, text: `${data.inserted} motor için ölçüm kaydedildi.` });
      setEntries({});
      load();
    } else {
      const data = await res.json();
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  async function removeReading(id) {
    await fetch(`/api/pressure-readings/${id}`, { method: "DELETE" });
    load();
  }

  async function doImport() {
    if (!importFile) return;
    setImporting(true);
    setImportMsg(null);
    const file_b64 = await fileToBase64(importFile);
    const res = await fetch("/api/pressure-readings/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_b64 }),
    });
    setImporting(false);
    const data = await res.json();
    if (res.ok) { setImportMsg({ ok: true, text: `${data.inserted} ölçüm kaydı eklendi.` }); load(); }
    else setImportMsg({ ok: false, text: data.error || "Dosya okunamadı." });
  }

  const engineHistory = readings.filter((r) => r.engine_id === historyEngine).sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
  const numericHistory = engineHistory.filter((r) => r.pressure_bar !== null && r.pressure_bar !== undefined);

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Karter Fark Basıncı" />
      <div className="px-4 py-4">
        <div className="flex gap-1 bg-[#12161d] p-1 rounded-xl border border-border mb-4">
          {[["new", "➕ Yeni Ölçüm"], ["history", "📈 Geçmiş"], ["import", "📥 İçe Aktar"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold ${tab === key ? "bg-amber text-[#161006]" : "text-faint"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "new" && (
          <div>
            <input type="date" value={readingDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setReadingDate(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3" />
            <p className="text-[11px] text-faint mb-3">Her motor için yük ve fark basıncını girin, bakımda/yedek olanları işaretleyin.</p>
            <div className="flex flex-col gap-2 mb-24">
              {sortedEngines.map((e) => {
                const entry = entries[e._id] || {};
                return (
                  <div key={e._id} className="bg-panel border border-border rounded-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-bold text-text">{e.name}</span>
                      <label className="flex items-center gap-1.5 text-[10.5px] text-muted">
                        <input type="checkbox" checked={!!entry.maint} onChange={(ev) => updateEntry(e._id, "maint", ev.target.checked)} />
                        Bakımda/Yedek
                      </label>
                    </div>
                    {!entry.maint && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" placeholder="Yük (kW)" value={entry.load_kw ?? ""} onChange={(ev) => updateEntry(e._id, "load_kw", ev.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm" />
                        <input type="number" step="0.01" placeholder="Fark Basıncı (bar)" value={entry.pressure_bar ?? ""} onChange={(ev) => updateEntry(e._id, "pressure_bar", ev.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="fixed bottom-24 left-0 right-0 z-20 px-4">
              <div className="max-w-lg mx-auto">
                {message && <div className={`text-center text-[12px] mb-2 ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>}
                <button onClick={saveReadings} disabled={saving} className="w-full py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50">
                  {saving ? "Kaydediliyor..." : "💾 Tüm Ölçümleri Kaydet"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div>
            <select value={historyEngine} onChange={(e) => setHistoryEngine(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3">
              {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            {numericHistory.length >= 2 && (
              <div className="mb-3">
                <MiniLineChart points={numericHistory.map((r) => ({ y: r.pressure_bar }))} />
              </div>
            )}
            {engineHistory.length === 0 ? (
              <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Bu motor için henüz ölçüm kaydı yok.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {[...engineHistory].reverse().map((r) => (
                  <div key={r._id} className="flex items-center justify-between bg-panel border border-border rounded-xl px-3 py-2.5">
                    <div className="text-[12px] text-text">
                      {new Date(r.reading_date).toLocaleDateString("tr-TR")} · Basınç: {r.pressure_bar ?? r.status ?? "-"} · Yük: {r.load_kw ?? "-"}
                    </div>
                    {(user?.role === "yonetici" || user?.role === "planlamaci" || user?.id === r.uploaded_by_id) && (
                      <button onClick={() => removeReading(r._id)} className="text-[11px] text-red font-bold flex-shrink-0 ml-2">🗑️</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "import" && (
          <div className="bg-panel border border-border rounded-card p-3.5">
            <p className="text-[12px] text-muted mb-3 leading-relaxed">
              KARTER_FARK_BASINÇLARI.xlsx ile aynı yapıdaki bir dosyayı yükleyerek geçmiş ölçümleri toplu ekleyebilirsiniz.
              Her sayfa adı bir tarih (GG.AA.YYYY) olmalıdır.
            </p>
            <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-3">
              📊 {importFile ? importFile.name : "Excel dosyası seç"}
              <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            {importMsg && <div className={`text-[12px] mb-2 ${importMsg.ok ? "text-green" : "text-red"}`}>{importMsg.text}</div>}
            <button onClick={doImport} disabled={importing || !importFile} className="w-full py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50">
              {importing ? "İçe aktarılıyor..." : "İçe Aktar"}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
