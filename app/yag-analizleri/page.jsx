"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

const RESULT_ICON = { "İyi": "🟢", "Dikkat": "🟡", "Kötü": "🔴" };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function YagAnalizleriPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [engineId, setEngineId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("İyi");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [filterEngine, setFilterEngine] = useState("Tümü");

  async function load() {
    const [engRes, anaRes] = await Promise.all([fetch("/api/engines"), fetch("/api/oil-analyses")]);
    if (engRes.status === 401) { router.push("/login"); return; }
    const engData = await engRes.json();
    const anaData = await anaRes.json();
    setEngines(engData);
    setAnalyses(anaData);
    setLoading(false);
    if (engData.length && !engineId) setEngineId(engData[0]._id);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  async function submit() {
    if (!file) { setMessage({ ok: false, text: "Lütfen bir PDF dosyası seçin." }); return; }
    setSaving(true);
    setMessage(null);
    const pdf_b64 = await fileToBase64(file);
    const res = await fetch("/api/oil-analyses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine_id: engineId, analysis_date: date, result, note, pdf_b64, pdf_filename: file.name }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ ok: true, text: "Analiz raporu kaydedildi." });
      setNote(""); setFile(null); setShowForm(false);
      load();
    } else {
      const data = await res.json();
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  async function remove(id) {
    await fetch(`/api/oil-analyses/${id}`, { method: "DELETE" });
    load();
  }

  const filtered = filterEngine === "Tümü" ? analyses : analyses.filter((a) => a.engine_id === filterEngine);

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Yağ Analizleri" subtitle="Laboratuvar PDF raporları" />
      <div className="px-4 py-4">
        <button onClick={() => setShowForm((s) => !s)} className="w-full py-3 rounded-xl border border-teal/40 bg-teal/10 text-teal font-bold text-[13px] mb-3">
          {showForm ? "Kapat" : "➕ Yeni Analiz Raporu Ekle"}
        </button>

        {showForm && (
          <div className="bg-panel border border-border rounded-card p-3.5 mb-4 flex flex-col gap-2">
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm">
              {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <select value={result} onChange={(e) => setResult(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm">
              <option>İyi</option><option>Dikkat</option><option>Kötü</option>
            </select>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" rows={2} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
            <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer">
              📄 {file ? file.name : "PDF raporu seç"}
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            {message && <div className={`text-[12px] ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>}
            <button onClick={submit} disabled={saving} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50">
              {saving ? "Kaydediliyor..." : "Raporu Kaydet"}
            </button>
          </div>
        )}

        <select value={filterEngine} onChange={(e) => setFilterEngine(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3">
          <option value="Tümü">Tüm Motorlar</option>
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {filtered.length === 0 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Henüz analiz raporu eklenmemiş.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((a) => (
              <div key={a._id} className="bg-panel border border-border rounded-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-text">{a.engine_name} · {RESULT_ICON[a.result]} {a.result}</div>
                    <div className="text-[11px] text-faint mt-0.5">{new Date(a.analysis_date).toLocaleDateString("tr-TR")} · {a.uploaded_by}</div>
                    {a.note && <div className="text-[11.5px] text-muted mt-1">📝 {a.note}</div>}
                  </div>
                  <a href={`data:application/pdf;base64,${a.pdf_b64}`} download={a.pdf_filename} className="flex-shrink-0 text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5">
                    📄 İndir
                  </a>
                </div>
                {(user?.role === "yonetici" || user?.role === "planlamaci" || user?.id === a.uploaded_by_id) && (
                  <button onClick={() => remove(a._id)} className="mt-2 text-[11px] text-red font-bold">🗑️ Sil</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
